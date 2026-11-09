import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stockThemeTable } from './theme-table.mjs';
import { readonlyErrors } from './qml-static.mjs';
import { writerFixture } from './settings-writer.mjs';
import { settingsUiFixture } from './settings-ui.mjs';
import { dragUiFixture } from './drag-ui.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A real hyprctl must never reach the desktop session running these tests:
// fixtures install their own, and anything else fails to connect.
process.env.HYPRLAND_INSTANCE_SIGNATURE = 'familiar-dock-tests-no-compositor';
const loaded = new Map();
function library(name) {
  const full = path.join(root, name);
  if (loaded.has(full)) return loaded.get(full);
  let source = fs.readFileSync(full, 'utf8').replace(/^\.pragma library\s*$/m, '');
  const context = {};
  source = source.replace(/^\.import "([^"]+)" as (\w+)\s*$/gm, (_, relative, alias) => {
    context[alias] = library(path.relative(root, path.resolve(path.dirname(full), relative)));
    return '';
  });
  vm.createContext(context);
  vm.runInContext(source, context, { filename: name });
  loaded.set(full, context);
  return context;
}
const plain = value => JSON.parse(JSON.stringify(value));
const deepEqual = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message || '');
let count = 0;
function test(name, run) {
  try { run(); console.log(`ok ${++count} - ${name}`); }
  catch (error) { console.error(`FAIL - ${name}`); throw error; }
}
const D = library('services/Defaults.js');
const C = library('services/Config.js');
const A = library('services/AppModel.js');
const W = library('services/WindowActions.js');
const L = library('panel/Layout.js');
const I = library('panel/Indicator.js');
const Dock = library('services/DockLifecycle.js');
const Cleanup = library('services/Cleanup.js');
const defaults = changes => C.validate(changes || {});
const seed = JSON.parse(fs.readFileSync(path.join(root, 'config/familiar-dock.seed.json')));

test('QML readonly guard catches Behavior, inherited bindings and id-qualified writes', () => {
  const errors = readonlyErrors({
    'Base.qml': 'Item { id: base; readonly property real amount: 1; Behavior on amount { NumberAnimation {} } Item { Component.onCompleted: base.amount = 3 } }',
    'Child.qml': 'Base { amount: 2 }',
    'Good.qml': 'Item { property real amount: 1; Behavior on amount {} /* readonly property real amount: 1 */ property string example: "Behavior on amount {}" }'
  });
  assert.equal(errors.length, 3, errors.join('\n'));
  assert(errors.some(e => e.includes('Behavior on readonly')));
  assert(errors.some(e => e.includes('binding to readonly')));
  assert(errors.some(e => e.includes('assignment to readonly')));
});
test('every shipped QML file passes the readonly load-time guard', () => {
  const files = {};
  function scan(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes:true})) {
      if (entry.name.startsWith('.')) continue;
      const name = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(name);
      else if (name.endsWith('.qml')) files[name] = fs.readFileSync(path.join(root, name), 'utf8');
    }
  }
  scan('');
  deepEqual(readonlyErrors(files), []);
});

test('complete upstream default contract with Omarchy overrides, excludes Drop/legacy keys', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/upstream-defaults.json')));
  // Keep the pinned upstream fixture intact; platform command mappings and
  // the starter setup (the seed, the Windows look) are intentional overrides,
  // used by a fresh install and after reset. Per-monitor ones live in
  // Config.monitorDefaults.
  const starter=Object.fromEntries(Object.entries(seed).filter(([key])=>!Object.hasOwn(C.monitorDefaults,key)));
  deepEqual(plain(D.values), { ...fixture.values, ...starter, 'progress-show-count': false, favorites: null, 'hide-omarchy-dock': true, 'theme-bg-color': 'auto', 'icon-contrast-outline': false, 'show-scratchpad-windows': false, 'animate-appicon-hover-macos': false, 'show-apps-hotkey': 'SUPER + ALT + SPACE', 'show-apps-click': {action:'drawer',app:'',keybinding:'',command:''}, 'look-custom': null });
  fixture.excluded.forEach(key => assert.equal(D.values[key], undefined, key));
  assert.equal(Object.keys(D.values).length, 241);
});
test('the starter file is the defaults: nothing reads as changed, the Look is Windows, the old defaults are kept', () => {
  const F=library('settings/FormModel.js'), Lk=library('settings/Looks.js');
  const effective=settings=>Object.fromEntries(Object.keys(settings).map(key=>[key,plain(Object.hasOwn(C.monitorDefaults,key)?C.forMonitor(settings,key,'DP-3','DP-3'):settings[key])]));
  deepEqual(effective(defaults(seed)),effective(defaults()));
  assert.equal(F.changedCount(defaults(seed),1,'*','DP-3'),0);
  assert.equal(F.changedCount(defaults(),1,'*','DP-3'),0);
  assert.equal(Lk.current(defaults(),['DP-3'],'DP-3'),'windows');
  assert.equal(Lk.current(defaults(seed),['DP-3'],'DP-3'),'windows');
  deepEqual(plain(C.monitorDefaults['panel-element-positions']),plain(Lk.find('windows').values['panel-element-positions']));
  assert.equal(C.monitorDefaults['panel-sizes'],45);
  // The defaults from before the starter became them, as an importable
  // file. Upstream's values stay pinned in tests/upstream-defaults.json.
  const old=JSON.parse(fs.readFileSync(path.join(root,'config/dash-to-panel.defaults.json')));
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/upstream-defaults.json')));
  assert(!Object.hasOwn(old,'favorites')&&!Object.hasOwn(old,'look-custom'));
  deepEqual(Object.keys(old).sort(),Object.keys(D.values).filter(k=>k!=='favorites'&&k!=='look-custom').sort());
  const was=defaults(old);
  const omarchy={'progress-show-count':false,'hide-omarchy-dock':true,'theme-bg-color':'auto','icon-contrast-outline':false,'show-scratchpad-windows':false,'animate-appicon-hover-macos':false,'show-apps-hotkey':'SUPER + ALT + SPACE','show-apps-click':{action:'drawer',app:'',keybinding:'',command:''}};
  for(const [key,value] of Object.entries({...fixture.values,...omarchy})) if(!['context-menu-entries'].includes(key)&&!Object.hasOwn(C.monitorDefaults,key)) deepEqual(plain(was[key]),plain(value),key);
  assert.equal(C.forMonitor(was,'panel-sizes','DP-3','DP-3'),48);
  assert.equal(C.forMonitor(was,'panel-element-positions','DP-3','DP-3').find(r=>r.element==='taskbar').position,'stackedTL');
  assert.equal(Lk.current(was,['DP-3'],'DP-3'),'custom');
  assert.equal(F.changedCount(was,1,'*','DP-3'),9);
  // About › Import takes the file back as it is, and keeps the pins.
  const imported=library('settings/WritePlan.js').importChanges(fs.readFileSync(path.join(root,'config/dash-to-panel.defaults.json'),'utf8'));
  deepEqual(Object.keys(imported).sort(),Object.keys(old).sort());
  const back=defaults({favorites:['a'],...imported});
  deepEqual(back.favorites,['a']);
  assert.equal(Lk.current(back,['DP-3'],'DP-3'),'custom');
  assert.equal(F.changedCount(back,1,'*','DP-3'),9);
});
test('seed preserves layout and commands without overriding system default pins', () => {
  assert(!Object.hasOwn(seed,'favorites'));
  assert.equal(C.forMonitor(defaults(seed), 'panel-sizes', 'DP-3', 'DP-3'),45);
  deepEqual(seed['context-menu-entries'],[
    {title:'Terminal',cmd:'TERMINALSETTINGS'},
    {title:'System monitor',cmd:'omarchy-launch-or-focus-tui btop'},
    {title:'Files',cmd:'nautilus --new-window'}
  ]);
  deepEqual(defaults()['context-menu-entries'],seed['context-menu-entries']);
  for (const key of ['trans-use-custom-bg','trans-bg-color','trans-use-custom-opacity','trans-panel-opacity']) assert(!Object.hasOwn(seed,key));
});
test('monitor named overrides wildcard; scalar/array apply everywhere', () => {
  let s = defaults({'panel-sizes': {'*': 45, 'DP-2': 64}, 'panel-positions': 'LEFT'});
  assert.equal(C.forMonitor(s, 'panel-sizes', 'DP-2'), 64);
  assert.equal(C.forMonitor(s, 'panel-sizes', 'DP-1'), 45);
  assert.equal(C.forMonitor(s, 'panel-positions', 'DP-1'), 'LEFT');
  assert.equal(C.forMonitor(defaults(), 'panel-lengths', 'DP-1'), 100);
  s = defaults({'panel-element-positions': seed['panel-element-positions']['*']});
  assert.equal(C.forMonitor(s, 'panel-element-positions', 'DP-2')[3].position, 'centerMonitor');
});
test('layout sync prefers wildcard then primary; unsynced uses named', () => {
  const layout = pos => [{element: 'taskbar', position: pos, visible: true}];
  const input = {'panel-element-positions': {'*':layout('stackedTL'), A:layout('centerMonitor'), B:layout('stackedBR')}};
  assert.equal(C.forMonitor(defaults(input), 'panel-element-positions', 'B', 'A')[0].position, 'stackedTL');
  delete input['panel-element-positions']['*'];
  assert.equal(C.forMonitor(defaults(input), 'panel-element-positions', 'B', 'A')[0].position, 'centerMonitor');
  input['panel-element-positions-monitors-sync'] = false;
  assert.equal(C.forMonitor(defaults(input), 'panel-element-positions', 'B', 'A')[0].position, 'stackedBR');
});
test('enums, boolean types, numeric bounds, invalid colors and layouts', () => {
  const s = defaults({'dot-position':'garbage','group-apps':'false','appicon-padding':300,'panel-sizes':-5,'panel-lengths':-1,'trans-panel-opacity':4,'focus-highlight-color':'url(https://bad)','global-border-radius':30,'window-preview-title-font-size':-100});
  assert.equal(s['dot-position'], 'BOTTOM'); assert.equal(s['group-apps'], true);
  assert.equal(s['appicon-padding'],32); assert.equal(s['panel-sizes'],16);
  assert.equal(s['panel-lengths'],-1); assert.equal(s['trans-panel-opacity'],1);
  assert.equal(s['focus-highlight-color'],'#EEEEEE'); assert.equal(s['global-border-radius'],5);
  assert.equal(s['window-preview-title-font-size'],6);
  const rows = C.layout([{element:'taskbar',position:'bogus',visible:false},{element:'taskbar'}, {element:'not-real'}]);
  assert.equal(rows.length,9); assert.equal(rows[0].position,'centerMonitor'); assert.equal(rows[0].visible,false);
});
test('CSS colors decode alpha-last and reject invalid tokens', () => {
  deepEqual(plain(C.parseColor('#abc')), [170/255,187/255,204/255,1]);
  deepEqual(plain(C.parseColor('#11223380')), [17/255,34/255,51/255,128/255]);
  deepEqual(plain(C.parseColor('rgba(255, 128, 0, 0.25)')), [1,128/255,0,0.25]);
  deepEqual(plain(C.parseColor('rgb(0,0,0)')), [0,0,0,1]);
  for (const bad of ['red','#ggg','rgb(999,0,0)','rgba(0,0,0,2)','rgb(0,0,0,1)','rgba(0,0,0)','rgb(1.2.3,0,0)']) assert.equal(C.parseColor(bad),null,bad);
});
test('malformed/oversized JSON is rejected; favorites writes preserve all other values', () => {
  for (const raw of ['', '{', '[]', 'null', 'false', ' '.repeat(1024*1024+1)]) assert.throws(() => C.parse(raw));
  const raw = { favorites:['old'], 'panel-sizes':{'DP-3':45}, unknown:{a:'<img src="https://bad">'}, 'dot-position':'future-value' };
  const next = C.withFavorites(raw,['a.desktop','b','a','',4,' bad\n']);
  deepEqual(plain(next), {...raw,favorites:['a','b','bad']});
  deepEqual(raw.favorites,['old']);
  const parsed = C.parse(JSON.stringify(raw));
  assert.equal(parsed.raw['dot-position'],'future-value');
  assert.equal(parsed.settings['dot-position'],'BOTTOM');
});
const entries = [
  {id:'browser', name:'Browser', icon:'browser', startupClass:'BrowserClass'},
  {id:'nvim',name:'Neovim',runInTerminal:true,command:['/usr/bin/nvim']},
  {id:'Docker',name:'Docker',execString:'terminal --app-id=TUI.tile -e lazydocker'},
  {id:'WhatsApp',name:'WhatsApp',execString:'omarchy-launch-webapp https://web.whatsapp.com/'},
  {id:'pages',name:'Pages',execString:'launch https://www.icloud.com/pages/'},
  {id:'numbers',name:'Numbers',execString:'launch https://www.icloud.com/numbers/'},
  {id:'chrome-mmoimpclojknilbjmniiffejljfeokbp-Default',name:'OptionStrat'}
];
const entryMap = Object.fromEntries(entries.map(e => [e.id,e]));
const match = id => A.matchEntry(id,entries,key => entryMap[key],key => key === 'heuristic' ? entries[0] : null);
test('desktop matching: direct, StartupWMClass, Chromium, web URL paths and terminal claims', () => {
  assert.equal(match('browser.desktop').id,'browser');
  assert.equal(match('browserclass').id,'browser');
  assert.equal(match('crx_mmoimpclojknilbjmniiffejljfeokbp').name,'OptionStrat');
  assert.equal(match('chrome-mmoimpclojknilbjmniiffejljfeokbp-Default').name,'OptionStrat');
  assert.equal(match('org.omarchy.nvim').id,'nvim'); assert.equal(match('TUI.tile').id,'Docker');
  assert.equal(match('chrome-web.whatsapp.com__-Default').id,'WhatsApp');
  assert.equal(match('chrome-www.icloud.com__pages_-Default').id,'pages');
  assert.equal(match('chrome-www.icloud.com__other_-Default'),null);
  assert.equal(match('heuristic').id,'browser'); assert.equal(match('unmatched'),null);
});
function win(appKey,address,extra={}) { return {appKey,address,title:`<img src="https://bad/${address}">`,workspaceId:1,monitor:'DP-1',activated:false,minimized:false,focusHistory:10,...extra}; }
const windows = [win('browser','a'),win('browser','b',{monitor:'DP-2',workspaceId:2}),win('nvim','c')];
const context = {monitor:'DP-1',workspaceId:1,primary:true,panelCount:2};
const build = (changes={}, ctx=context, list=windows, pins=['browser','missing'], order=['browser','nvim']) => A.buildItems(pins,list,order,defaults(changes),ctx,entryMap);
test('favorites skip uninstalled entries; running apps follow stable first-seen order', () => {
  let result = build();
  deepEqual(result.map(i=>i.appKey),['browser','nvim']);
  assert.equal(result[0].isFavorite,true); assert.equal(result[0].windows.length,2);
  deepEqual(plain(A.updateOrder(['nvim','browser'],windows.slice().reverse())),['nvim','browser']);
  deepEqual(plain(A.updateOrder(['nvim','browser'],[win('other','x'),...windows])),['nvim','browser','other']);
  assert.equal(build({'show-running-apps':false}).length,1);
  assert.equal(build({'show-favorites':false})[0].isFavorite,false);
  assert.equal(build({'show-favorites-all-monitors':false},{...context,primary:false})[0].isFavorite,false);
  entryMap.missing={id:'missing',name:'Installed now'};
  deepEqual(build().map(i=>i.appKey),['browser','missing','nvim']); delete entryMap.missing;
});
test('grouped/ungrouped keys, separate pinned launchers, exact untrusted titles', () => {
  let result = build({'group-apps':false});
  deepEqual(result.map(i=>i.key),['window:a','window:b','window:c']);
  assert.equal(result[0].title, windows[0].title);
  result=build({'group-apps':false,'group-apps-use-launchers':true});
  deepEqual(result.map(i=>i.key),['pin:browser','window:a','window:b','window:c']);
  assert.equal(result[0].windows.length,0);
  assert.equal(build({},context,[win('browser','a',{activated:true})])[0].focused,true);
});
test('workspace/monitor filtering includes tagged minimized windows on their source workspace', () => {
  assert.equal(build({'isolate-workspaces':true})[0].windows.length,1);
  assert.equal(build({'isolate-monitors':true})[0].windows.length,1);
  assert.equal(build({'isolate-monitors':true},{...context,panelCount:1})[0].windows.length,2);
  assert.equal(build({'isolate-monitors':true,'isolate-monitors-with-single-panel':true},{...context,panelCount:1})[0].windows.length,1);
  const minimized=win('browser','d',{minimized:true,workspaceId:-99,tags:['omarchy-minimized-from-1']});
  assert.equal(build({'isolate-workspaces':true},context,[minimized])[0].windows.length,1);
});
test('scratchpad windows stay off the taskbar unless enabled; minimized windows always show', () => {
  const pad=win('nvim','s',{workspace:'special:scratchpad',workspaceId:-97});
  const qconsole=win('nvim','q',{workspace:'special:qconsole',workspaceId:-96});
  const bare=win('nvim','u',{workspace:'special',workspaceId:-99});
  const pinnedPad=win('browser','p',{workspace:'special:scratchpad',workspaceId:-97});
  const minimized=win('nvim','m',{workspace:'special:minimized',workspaceId:-98,minimized:true,tags:['omarchy-minimized-from-1']});
  assert.equal(defaults()['show-scratchpad-windows'],false);
  // Off by default: unpinned scratchpad apps vanish, pinned ones stay as idle pins.
  deepEqual(build({},context,[pad,qconsole,bare,pinnedPad]).map(i=>[i.appKey,i.windows.length]),[['browser',0]]);
  deepEqual(build({},context,[minimized,pad]).map(i=>[i.appKey,i.windows.map(w=>w.address)]),[['browser',[]],['nvim',['m']]]);
  // On: they show, on every workspace, since a scratchpad opens over the active one.
  deepEqual(build({'show-scratchpad-windows':true},context,[pad,qconsole,pinnedPad]).map(i=>[i.appKey,i.windows.length]),[['browser',1],['nvim',2]]);
  deepEqual(build({'show-scratchpad-windows':true,'isolate-workspaces':true},{...context,workspaceId:5},[pad]).map(i=>i.appKey),['browser','nvim']);
  // The monitor filter still applies.
  deepEqual(build({'show-scratchpad-windows':true,'isolate-monitors':true},context,[{...pad,monitor:'DP-2'}]).map(i=>i.appKey),['browser']);
});
test('ListModel updates move existing delegates and insert/remove only changed keys', () => {
  const rows=[{key:'a',identity:1},{key:'b',identity:2},{key:'c',identity:3}];
  const model={get count(){return rows.length},get:i=>rows[i],move:(from,to,n)=>rows.splice(to,0,...rows.splice(from,n)),insert:(i,row)=>rows.splice(i,0,row),remove:(i,n)=>rows.splice(i,n)};
  A.syncModel(model,['c','a','new']);
  deepEqual(rows,[{key:'c',identity:3},{key:'a',identity:1},{key:'new'}]);
});
test('safe window targeting and MRU ordering', () => {
  assert.equal(W.address('0xabcdef'),'0xabcdef'); assert.equal(W.address('ABCDEF'),'0xABCDEF');
  assert.equal(W.address('abc";os.execute("bad")'), '');
  deepEqual(W.operations('restore',[{address:'a'},{address:'bad!'}],7),[{mode:'restore',address:'0xa',workspace:7}]);
  assert.equal(W.sourceWorkspace(['omarchy-minimized-from-7'],1),7);
  assert.equal(W.sourceWorkspace(['other'],3),3);
  assert.equal(W.pickWindow([{address:'a',focusHistory:9},{address:'b',focusHistory:0}]).address,'b');
});
test('upstream icon geometry, all panel lengths and extreme padding', () => {
  deepEqual(plain(L.iconGeometry(45,4,4)),{icon:37,padding:4,button:53});
  deepEqual(plain(L.iconGeometry(16,0,32)),{icon:4,padding:6,button:16});
  assert.equal(L.panelLength(1000,50,250,10),490);
  assert.equal(L.panelLength(1000,-1,250,10),250);
  assert.equal(L.panelLength(100,-1,500,10),80);
});
test('short-panel anchors retain requested length and outer margins', () => {
  for (const [anchor, start, end] of [['START',10,500],['MIDDLE',255,255],['END',500,10]]) {
    const margins=L.lengthMargins(1000,490,10,anchor);
    deepEqual(margins,{start,end});
    assert.equal(1000-margins.start-margins.end,490);
  }
  deepEqual(L.lengthMargins(1000,980,10,'END'),{start:10,end:10});
  deepEqual(L.lengthMargins(1000,249,10,'MIDDLE'),{start:375,end:376});
});
const row=(element,position)=>({element,position,visible:true});
const sizes={showAppsButton:50,taskbar:200,dateMenu:100,desktopButton:10};
test('centered is between neighbors; centerMonitor is centered on the panel', () => {
  let a=L.allocate([row('showAppsButton','stackedTL'),row('taskbar','centered'),row('dateMenu','stackedBR')],sizes,1000);
  assert.equal(a.taskbar.start,375); assert.equal(a.showAppsButton.start,0); assert.equal(a.dateMenu.start,900);
  a=L.allocate([row('showAppsButton','stackedTL'),row('taskbar','centerMonitor'),row('dateMenu','stackedBR')],sizes,1000);
  assert.equal(a.taskbar.start,400);
});
test('overflow shrinks only taskbar; dynamic mode packs; hidden/dropped elements take no space', () => {
  let elements=[row('showAppsButton','stackedTL'),row('taskbar','centered'),row('dateMenu','stackedBR'),row('desktopButton','stackedBR')];
  let a=L.allocate(elements,{...sizes,taskbar:2000},500);
  assert.equal(a.taskbar.length,340); assert.equal(a.taskbar.start,50);
  a=L.allocate(elements,sizes,360,'MIDDLE');
  assert.equal(a.taskbar.start,50); assert.equal(a.dateMenu.start,250); assert.equal(a.desktopButton.start,350);
  elements=[{...row('showAppsButton','stackedTL'),visible:false},row('activitiesButton','stackedTL'),row('taskbar','centered'),row('systemMenu','stackedBR')];
  assert.equal(L.naturalLength(elements,sizes),200);
  deepEqual(Object.keys(L.allocate(elements,sizes,1000)),['taskbar']);
});
test('the empty boxes the editor leaves out never split or move the elements around them', () => {
  // The stored default order, with Show Applications set beside the
  // centered taskbar. The empty left box between them used to make two
  // centered groups that never got a place, so both vanished.
  const stored=(apps,taskbar)=>[row('showAppsButton',apps),{...row('activitiesButton','centered'),visible:false},row('leftBox','stackedTL'),
    row('taskbar',taskbar),row('centerBox','centered'),{...row('rightBox','stackedBR'),visible:false},row('dateMenu','stackedBR'),
    {...row('systemMenu','stackedBR'),visible:false},row('desktopButton','stackedBR')];
  let a=L.allocate(stored('centered','centered'),sizes,1000);
  // Centered between the panel's start and the clock group at 890.
  deepEqual(a.showAppsButton,{start:320,length:50});
  deepEqual(a.taskbar,{start:370,length:200},'right after Show Applications');
  assert(!('leftBox' in a) && !('centerBox' in a));
  // A taskbar stacked to the end stays at the end: the empty center box
  // after it used to pull its whole group, clock included, to the middle.
  a=L.allocate(stored('stackedTL','stackedBR'),sizes,1000);
  deepEqual([a.showAppsButton.start,a.taskbar.start,a.dateMenu.start,a.desktopButton.start],[0,690,890,990]);
  a=L.allocate(stored('stackedBR','stackedBR'),sizes,1000);
  deepEqual([a.showAppsButton.start,a.taskbar.start],[640,690],'Show Applications at the end, right before the taskbar');
  // The default layout is unchanged.
  a=L.allocate(stored('stackedTL','centered'),sizes,1000);
  deepEqual([a.showAppsButton.start,a.taskbar.start,a.dateMenu.start,a.desktopButton.start],[0,370,890,990]);
  // The same elements as the settings editor leaves out.
  const editor=library('settings/ElementLayout.js');
  assert.equal(JSON.stringify(L.undrawn.slice().sort()),JSON.stringify(editor.omitted.slice().sort()));
});
test('all seven indicator styles, count cap, edges and upstream geometry', () => {
  for (const style of ['DOTS','SQUARES','DASHES','SEGMENTED','SOLID','CILIORA','METRO']) {
    for(const edge of ['TOP','BOTTOM','LEFT','RIGHT']) {
      const marks=I.marks(style,8,48,48,edge,3,true);
      assert(marks.length>0); assert(marks.every(m=>m.width>0&&m.height>0));
      deepEqual(plain(marks),plain(I.marks(style,4,48,48,edge,3,true)));
      assert.equal(I.marks(style,0,48,48,edge,3,true).length,0);
    }
  }
  const d=I.marks('DASHES',2,48,48,'BOTTOM',3,true);
  deepEqual(d.map(m=>[m.x,m.y,m.width,m.height]),[[13,45,9,3],[25,45,9,3]]);
  assert.equal(I.marks('DOTS',2,48,48,'TOP',3,true)[0].radius,1.5);
  assert.equal(I.marks('METRO',2,48,48,'BOTTOM',3,false)[2].width,10);
  assert.equal(I.colorKey(8,false,true,true),'dot-color-unfocused-4');
  assert.equal(I.colorKey(8,false,false,true),'');
});
test('fullscreen checks actual fullscreen bit and active workspace', () => {
  assert.equal(L.fullscreenOn([{workspace:{id:1},lastIpcObject:{fullscreen:2}}],1),true);
  assert.equal(L.fullscreenOn([{workspace:{id:1},lastIpcObject:{fullscreen:1}}],1),false);
  assert.equal(L.fullscreenOn([{workspace:{id:2},lastIpcObject:{fullscreen:2}}],1),false);
});
// Every process in this integration test operates inside a repository fixture.
// omarchy/sleep are mocks: never enable/disable real plugins or wait three seconds.
function fakeOmarchy(bin) {
  fs.writeFileSync(path.join(bin,'omarchy'),'#!/bin/bash\nprintf "%s\\n" "$*" >> "$TEST_CALLS"\nexec omarchy-shell "$@"\n');
  fs.writeFileSync(path.join(bin,'omarchy-shell'),`#!/bin/bash
set -eu
config=$TEST_SHELL_CONFIG
if [[ $1 == shell && $2 == listShellConfig ]]; then jq -c . "$config"; exit 0; fi
if [[ $1 == plugin && $2 == list ]]; then
  jq -c '[{id: "omarchy.clock", enabled: ([.bar.layout[]?[]? | select(. == "omarchy.clock" or (type == "object" and .id == "omarchy.clock"))] | length > 0)}]' "$config"
  exit 0
fi
if [[ $1 == bar && $2 == put ]]; then
  jq --arg s "$5" --argjson i "$7" '.bar.layout[$s] |= ((. // [])[:$i] + [{id: "omarchy.clock"}] + (. // [])[$i:])' "$config" > "$config.tmp"
  mv "$config.tmp" "$config"; exit 0
fi
if [[ $1 == bar && $2 == set ]]; then
  jq --arg s "$8" --arg k "$4" --argjson v "$5" '.bar.layout[$s] |= map(if type == "object" and .id == "omarchy.clock" then .[$k] = $v else . end)' "$config" > "$config.tmp"
  mv "$config.tmp" "$config"; exit 0
fi
if [[ $1 == plugin ]]; then
  action=$2; id=$3
  [[ \${TEST_DOCK_MODE:-} != disable-lost || $action != disable ]] || exit 0
  if [[ $id == omarchy.dock && $action == enable ]]; then
    n=0; [[ ! -f "$config.attempts" ]] || n=$(cat "$config.attempts")
    n=$((n + 1)); echo "$n" > "$config.attempts"
    [[ \${TEST_DOCK_MODE:-} != fail ]] || exit 1
    if [[ \${TEST_DOCK_MODE:-} == first-fail && $n == 1 ]]; then exit 1; fi
  fi
  if [[ $action == enable ]]; then
    jq --arg id "$id" '.disabledPlugins = ((.disabledPlugins // []) - [$id])' "$config" > "$config.tmp"
  else
    jq --arg id "$id" '.disabledPlugins = (((.disabledPlugins // []) + [$id]) | unique)' "$config" > "$config.tmp"
  fi
  mv "$config.tmp" "$config"
  if [[ $id == omarchy.dock && $action == enable ]]; then
    if [[ \${TEST_DOCK_MODE:-} == slow ]]; then touch "$config.ready"; /usr/bin/sleep 0.4; fi
    [[ \${TEST_DOCK_MODE:-} != nonzero ]] || exit 1
  fi
fi
`);
  for (const name of ['omarchy','omarchy-shell']) fs.chmodSync(path.join(bin,name),0o755);
}
test('dock lifecycle: owned marker, hot reload, removal, manual override, corrupt config', () => {
  const dir=fs.mkdtempSync(path.join(root,'tests/.dock-test-'));
  try {
    const bin=path.join(dir,'bin'), home=path.join(dir,'home'), calls=path.join(dir,'calls');
    const cfg=path.join(home,'.config/omarchy/shell.json'), marker=path.join(home,'.local/state/familiar-dock/dock-hidden');
    fs.mkdirSync(bin); fs.mkdirSync(path.dirname(cfg),{recursive:true});
    fakeOmarchy(bin);
    fs.writeFileSync(path.join(bin,'sleep'),'#!/bin/sh\nexit 0\n');
    fs.writeFileSync(path.join(bin,'hyprctl'),'#!/bin/sh\nexit 1\n');
    for(const cmd of ['omarchy','sleep','hyprctl']) fs.chmodSync(path.join(bin,cmd),0o755);
    const run=script=>{
      const result=spawnSync('bash',['-c',script,'test',home],{env:{...process.env,PATH:`${bin}:${process.env.PATH}`,TEST_CALLS:calls,TEST_SHELL_CONFIG:cfg},encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
    };
    const config=value=>fs.writeFileSync(cfg,JSON.stringify(value));
    const read=()=>fs.existsSync(calls)?fs.readFileSync(calls,'utf8').trim().split('\n'):[];
    config({plugins:[{id:'rugobal.familiar-dock'}],disabledPlugins:['omarchy.dock']});
    run(Dock.hideScript); assert.equal(fs.existsSync(marker),false); assert.equal(read().length,0);
    config({plugins:[{id:'rugobal.familiar-dock'}],disabledPlugins:[]});
    run(Dock.hideScript); assert.equal(fs.existsSync(marker),true); deepEqual(read(),['plugin disable omarchy.dock']);
    run(Dock.hideScript); run(Cleanup.script); assert.equal(read().length,1); // reloaded, still enabled
    fs.writeFileSync(cfg,'{broken'); run(Cleanup.script); assert.equal(read().length,1);
    config({plugins:[],disabledPlugins:['omarchy.dock']}); run(Cleanup.script);
    assert.equal(fs.existsSync(marker),false); assert.equal(read().at(-1),'plugin enable omarchy.dock');
    run(Cleanup.script); assert.equal(read().length,2); // marker absent: no ownership
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('a dock hide the shell never saved is tried again; a dock the user turned back on stays', () => {
  const dir=fs.mkdtempSync(path.join(root,'tests/.dock-lost-'));
  try {
    const bin=path.join(dir,'bin'),home=path.join(dir,'home'),calls=path.join(dir,'calls');
    const cfg=path.join(home,'.config/omarchy/shell.json'),marker=path.join(home,'.local/state/familiar-dock/dock-hidden');
    fs.mkdirSync(bin); fs.mkdirSync(path.dirname(cfg),{recursive:true});
    fakeOmarchy(bin);
    fs.writeFileSync(path.join(bin,'sleep'),'#!/bin/sh\nexit 0\n'); fs.chmodSync(path.join(bin,'sleep'),0o755);
    const env=mode=>({...process.env,PATH:`${bin}:${process.env.PATH}`,TEST_CALLS:calls,TEST_SHELL_CONFIG:cfg,TEST_DOCK_MODE:mode});
    const run=(script,mode='')=>assert.equal(spawnSync('bash',['-c',script,'test',home],{env:env(mode),encoding:'utf8'}).status,0);
    const disables=()=>fs.readFileSync(calls,'utf8').trim().split('\n').filter(c=>c==='plugin disable omarchy.dock').length;
    fs.writeFileSync(cfg,JSON.stringify({plugins:[{id:'rugobal.familiar-dock'}],disabledPlugins:[]}));
    run(Dock.hideScript,'disable-lost'); assert.equal(fs.readFileSync(marker,'utf8'),'pending');
    run(Dock.hideScript,'disable-lost'); assert.equal(disables(),2,'a pending hide is tried again');
    run(Dock.hideScript); assert.equal(fs.readFileSync(marker,'utf8'),'','confirmed once shell.json shows it');
    // Turned back on by hand: the confirmed marker keeps it on.
    fs.writeFileSync(cfg,JSON.stringify({plugins:[{id:'rugobal.familiar-dock'}],disabledPlugins:[]}));
    run(Dock.hideScript); assert.equal(disables(),3);
    // A pending marker whose disable landed late is confirmed without a new one.
    fs.writeFileSync(marker,'pending'); fs.writeFileSync(cfg,JSON.stringify({plugins:[{id:'rugobal.familiar-dock'}],disabledPlugins:['omarchy.dock']}));
    run(Dock.hideScript); assert.equal(fs.readFileSync(marker,'utf8'),''); assert.equal(disables(),3);
    // A pending marker with the dock still on: the hide may be saved late, so
    // the dock is turned on again before the marker goes.
    const enables=()=>fs.readFileSync(calls,'utf8').trim().split('\n').filter(c=>c==='plugin enable omarchy.dock').length;
    fs.writeFileSync(marker,'pending'); fs.writeFileSync(cfg,JSON.stringify({plugins:[],disabledPlugins:[]}));
    run(Dock.liveRestoreScript); assert(!fs.existsSync(marker)); assert.equal(enables(),1);
    // That enable must be heard: while it fails, the marker stays to try again.
    fs.writeFileSync(marker,'pending');
    const failed=spawnSync('bash',['-c',Dock.liveRestoreScript,'test',home],{env:env('fail'),encoding:'utf8'});
    assert.notEqual(failed.status,0); assert.equal(fs.readFileSync(marker,'utf8'),'pending');
    // A confirmed marker with the dock on asks nothing more of the shell.
    fs.writeFileSync(marker,''); const before=enables();
    run(Dock.liveRestoreScript); assert(!fs.existsSync(marker)); assert.equal(enables(),before);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
const F = library('services/WindowFader.js');
const M = library('panel/MenuModel.js');
const P = library('panel/PreviewLogic.js');
const S = library('panel/ScrollLogic.js');
const actionWindow = (addr, history, extra={}) => ({address:addr,focusHistory:history,workspaceId:1,monitor:'DP-3',minimized:false,activated:false,...extra});
const panel = {monitorName:'DP-3',workspaceId:1};
const two = [actionWindow('0xa',0,{activated:true}),actionWindow('0xb',1)];
const app = {appKey:'browser',key:'app:browser',desktopEntry:{id:'browser',actions:[]},isFavorite:false,windows:two};
test('nine grouped actions and all four configurable input combinations', () => {
  const expected = {RAISE:'all',MINIMIZE:'minimize',LAUNCH:'launch',CYCLE:'cycle','CYCLE-MIN':'cycle',QUIT:'close','TOGGLE-SHOWPREVIEW':'preview','TOGGLE-CYCLE':'cycle','TOGGLE-SPREAD':'preview'};
  for (const [button,mods,key] of [['left','','click-action'],['left','shift','shift-click-action'],['middle','','middle-click-action'],['middle','shift','shift-middle-click-action']]) {
    for (const [action,op] of Object.entries(expected)) {
      const settings=defaults({[key]:action});
      assert.equal(W.action(settings,button,mods),action);
      assert.equal(W.activatePlan(settings,app,button,mods,panel,false,false).op,op);
      assert.equal(W.activatePlan(settings,{...app,windows:[]},button,mods,panel,false,false).op,'launch');
      assert.equal(W.activatePlan(settings,app,button,'ctrl,shift',panel,false,false).op,'launch');
    }
  }
});
test('focus on this panel, minimize rules, double click, ungrouped behavior', () => {
  const background={...app,windows:two.map(w=>({...w,activated:false}))};
  const settings=defaults({'click-action':'MINIMIZE'});
  assert.equal(W.activatePlan(settings,background,'left','',panel,false,false).op,'all');
  assert.equal(W.activatePlan(settings,app,'left','',panel,false,false).all,true);
  assert.equal(W.activatePlan(settings,background,'left','shift',panel,false,false).all,false);
  assert.equal(W.activatePlan(settings,background,'left','shift',panel,true,false).all,true);
  assert.equal(W.hasFocus(two,'OTHER'),false);
  for (const action of Object.keys(D.enums).length ? D.enums['click-action'] : []) {
    const one={...app,windows:two.slice(0,1)};
    const cfg=defaults({'group-apps':false,'click-action':action});
    const plan=W.activatePlan(cfg,one,'left','',panel,false,false);
    const want=['MINIMIZE','CYCLE-MIN','TOGGLE-CYCLE','TOGGLE-SHOWPREVIEW','TOGGLE-SPREAD'].includes(action)?'minimize':action==='LAUNCH'?'launch':action==='QUIT'?'close':'first';
    assert.equal(plan.op,want,action);
  }
  assert.equal(W.activatePlan(defaults({'click-action':'TOGGLE-SHOWPREVIEW'}),app,'left','',panel,true,false).op,'minimize');
  assert.equal(W.clickState(1000,'left',1449).doubleClick,true);
  assert.equal(W.clickState(1000,'left',1450).doubleClick,false);
  assert.equal(W.clickState(1000,'middle',1100).lastClick,1000);
  assert.equal(W.clickState(1000,'middle',1100).doubleClick,false);
  assert.equal(W.clickState(1000,'left',1100,'ctrl').doubleClick,false);
  assert.equal(W.clickState(1000,'left',1100,'ctrl').lastClick,1000);
});
test('cycle keeps MRU snapshot for 3 seconds, reverse, membership, monitor and minimize slot', () => {
  let r=W.cycle(null,'browser','DP-3',two,false,true,5000);
  assert.equal(r.target,'0xb');
  r=W.cycle(r.memory,'browser','DP-3',two.slice().reverse().map((w,i)=>({...w,focusHistory:i})),false,true,5100);
  assert.equal(r.target,'MINIMIZE');
  r=W.cycle(r.memory,'browser','DP-3',two,false,true,5200); assert.equal(r.target,'0xa');
  r=W.cycle(r.memory,'browser','DP-3',two,true,true,5300); assert.equal(r.target,'MINIMIZE');
  assert.equal(W.cycle(r.memory,'browser','DP-3',two,false,true,8300).target,'0xb');
  assert.equal(W.cycle(r.memory,'browser','DP-4',two,false,true,5400).target,'0xb');
  const changed=[two[0],actionWindow('0xc',1)];
  assert.equal(W.cycle(r.memory,'browser','DP-3',changed,false,true,5400).target,'0xc');
  assert.equal(W.cycle(null,'a','m',[],false,false,0).target,null);
  assert.equal(W.activatePlan(defaults(),{...app,windows:two.map(w=>({...w,activated:false}))},'left','',panel,false,true).op,'cycle');
});
test('minimize current workspace only, raise ordering and show-desktop focus invalidation', () => {
  const list=[two[0],two[1],actionWindow('0xc',2,{workspaceId:7}),actionWindow('0xd',3,{minimized:true})];
  deepEqual(W.minimizeCandidates(list,1,true).map(w=>w.address),['0xa','0xb']);
  deepEqual(W.minimizeCandidates(list,1,false).map(w=>w.address),['0xa']);
  deepEqual(W.activateAllCandidates(list).map(w=>w.address),['0xa','0xd','0xb','0xa']);
  let d=W.showDesktopPlan(null,list,1); assert.equal(d.op,'minimize'); assert.equal(d.remember.length,2);
  d=W.showDesktopPlan(d.remember,list,1); assert.equal(d.op,'restore'); deepEqual(d.remember,[]);
  const state={m:[two[0]]}; assert.equal(W.desktopStateAfterFocus(state,10,20,'abc'),state);
  assert.equal(W.desktopStateAfterFocus(state,30,20,''),state);
  deepEqual(W.desktopStateAfterFocus(state,30,20,'abc'),{});
  assert.equal(W.panelCycle(list,false).address,'0xb'); assert.equal(W.panelCycle(list,true).address,'0xd');
  const unfocused=list.map(w=>({...w,activated:false}));
  assert.equal(W.panelCycle(unfocused,false).address,'0xa'); assert.equal(W.panelCycle(unfocused,true).address,'0xd');
});
test('scroll delay and touchpad accumulation; command argv remains intact', () => {
  let s=S.step(null,40,100,1000); assert.equal(s.direction,0);
  s=S.step(s.state,80,100,1001); assert.equal(s.direction,1);
  assert.equal(S.step(s.state,120,100,1050).direction,0);
  assert.equal(S.step(s.state,-120,100,1101).direction,-1);
  assert.equal(S.step(null,NaN,0,0).direction,0);
  deepEqual(W.commandArgv('echo "x"; $(printf y)'),['uwsm-app','--','bash','-c','echo "x"; $(printf y)']);
  deepEqual(W.commandArgv('TERMINALSETTINGS'),['xdg-terminal-exec']);
});
test('settings edits preserve unknown keys and reorder/pin uniquely', () => {
  const raw={unknown:{keep:true},favorites:['a','b'],other:'hi'};
  const next=C.withSettings(raw,{'taskbar-locked':true}); assert.equal(next.unknown.keep,true); assert.equal(next.other,'hi');
  deepEqual(next.favorites,['a','b']); assert.equal(next['taskbar-locked'],true);
  deepEqual(C.reorderFavorites(['a','b','c'],'c','a'),['c','a','b']);
  deepEqual(C.reorderFavorites(['a','b'],'running','b'),['a','running','b']);
  deepEqual(C.reorderFavorites(['a','b'],'a','a'),['a','b']);
  deepEqual(C.reorderFavorites(['a','b'],'a',''),['b','a']);
});
test('menu rows, desktop actions, bounded plain titles, navigation and command pairing', () => {
  const t=k=>k, markup='<img src="https://invalid/" />';
  const item={...app,desktopEntry:{id:'app',actions:[{name:'Action'}]},windows:[{...two[0],title:markup}]};
  const rows=M.appRows(item,defaults(),t,'Quit');
  deepEqual(rows.map(r=>r.kind),['section','window','new','action','pin','quit']); assert.equal(rows[1].text,markup);
  assert.equal(M.nextEnabled(rows,rows.length-1,1),1);
  assert.equal(M.nextEnabled(rows,1,-1),5);
  assert.equal(M.bounded('a'.repeat(2000)).length,512);
  const cfg=defaults({'show-apps-button-context-menu-commands':['one','two'],'show-apps-button-context-menu-titles':['Title'],'taskbar-locked':true});
  const panelRows=M.panelRows('showAppsButton',cfg,true,t);
  assert.equal(panelRows.filter(r=>r.command==='one').length,1); assert.equal(panelRows.filter(r=>r.command==='two').length,0);
  assert.equal(panelRows.find(r=>r.kind==='lock').text,'menu.unlock'); assert.equal(panelRows.at(-1).text,'desktop.restore');
  // The default entries are named in the catalog; a title the user wrote is not.
  deepEqual(M.builtinTitles,defaults()['context-menu-entries'].map(r=>r.title));
  const named=M.panelRows('panel',defaults({'context-menu-entries':[{title:'Files',cmd:'x'},{title:'menu.lock',cmd:'y'}]}),false,k=>'«'+k+'»');
  deepEqual(named.filter(r=>r.kind==='command').map(r=>r.text),['«menu.entry.Files»','menu.lock']);
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'i18n/en.json')));
  for(const title of M.builtinTitles) assert(catalog['menu.entry.'+title],title);
  assert(!M.appRows(item,defaults({'secondarymenu-contains-appmenu':false}),t,'Quit').some(r=>r.kind==='action'));
  assert.equal(M.appRows({...item,isFavorite:false},defaults({favorites:[item.appKey]}),t,'Quit').find(r=>r.kind==='pin').text,'menu.unpin');
});
test('preview sizing honors edge, source ratio, fixed dimensions and bounds', () => {
  const cfg=defaults({'window-preview-size':180});
  deepEqual(P.dimensions(cfg,false,1600,900),{width:320,height:180});
  deepEqual(P.dimensions(cfg,false,900,1600),{width:101.25,height:180});
  assert.equal(P.dimensions({...cfg,'window-preview-fixed-x':true},false,900,1600).width,320);
  assert.equal(P.dimensions(cfg,true,1600,900).height,101.25);
});
test('shared fade owners, visible workspaces, transitions interrupted on leave and closed windows', () => {
  const target=F.targets([...two,actionWindow('0xc',2,{workspaceId:2}),actionWindow('0xd',3,{minimized:true})],[1],'0xa',0.4);
  deepEqual(target,{'0xb':0.4});
  deepEqual(F.combined({peek:target,desktop:{'0xa':0,'0xb':0}}),{'0xa':0,'0xb':0});
  const middle=F.frame({'0xb':1},target,0.5); assert(middle['0xb']<1 && middle['0xb']>0.4);
  const leave=F.frame(middle,{},1); deepEqual(leave,{});
  deepEqual(F.prune({'0xa':{opacity:0.7},'0xb':{opacity:1}},['0xb']),{'0xb':{opacity:1}});
});
// All shell integration uses a private HOME and mocked hyprctl; no desktop commands execute.
function compositorFixture(run) {
  const dir=fs.mkdtempSync(path.join(root,'tests/.compositor-'));
  const bin=path.join(dir,'bin'), home=path.join(dir,'home'), calls=path.join(dir,'calls'), clients=path.join(dir,'clients.json');
  fs.mkdirSync(bin); fs.mkdirSync(home);
  fs.writeFileSync(clients,JSON.stringify([{address:'0xa',workspace:{id:1,name:'1'},tags:['unrelated','omarchy-minimized-from-7','omarchy-minimized-from-8']} ]));
  fs.writeFileSync(path.join(bin,'hyprctl'),`#!/bin/bash
case "$1" in
clients) cat "$TEST_CLIENTS" ;;
getprop) printf '%s\\n' "$*" >> "$TEST_CALLS"; if [[ $3 == opacity ]]; then echo '{"float":0.6}'; else echo '{"float":0.35}'; fi ;;
--batch) printf '%s\\n' "$2" >> "$TEST_CALLS"; if [[ -e "$TEST_FAIL" ]]; then echo 'error: test failure'; else echo ok; fi ;;
*) exit 1 ;;
esac
`);
  fs.chmodSync(path.join(bin,'hyprctl'),0o755);
  fs.writeFileSync(path.join(bin,'omarchy-shell'),'#!/bin/sh\necho "omarchy-shell is not responding" >&2; exit 1\n'); fs.chmodSync(path.join(bin,'omarchy-shell'),0o755);
  const env={...process.env,PATH:`${bin}:${process.env.PATH}`,TEST_CLIENTS:clients,TEST_CALLS:calls,TEST_FAIL:path.join(dir,'fail'),HYPRLAND_INSTANCE_SIGNATURE:'test-session'};
  const execute=(script,args)=>spawnSync('bash',['-c',script,'test',...args],{env,encoding:'utf8'});
  try { run({home,calls,clients,env,execute,read:()=>fs.existsSync(calls)?fs.readFileSync(calls,'utf8'):''}); }
  finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
test('fresh minimize/restore batch building, stale tag cleanup, source focus and no-animation wrapper', () => compositorFixture(f => {
  let r=f.execute(W.mutationScript,[JSON.stringify(W.operations('minimize',[two[0]],1))]); assert.equal(r.status,0,r.stderr);
  let calls=f.read(); assert.match(calls,/-omarchy-minimized-from-7/); assert.match(calls,/-omarchy-minimized-from-8/);
  assert.match(calls,/\+omarchy-minimized-from-1/); assert.match(calls,/workspace = "special:minimized", follow = false/); assert.match(calls,/hl.dsp.focus\(\{ workspace = "1"/);
  fs.writeFileSync(f.clients,JSON.stringify([{address:'0xa',workspace:{id:-99,name:'special:minimized'},tags:['omarchy-minimized-from-42']} ]));
  fs.writeFileSync(f.calls,'');
  r=f.execute(W.mutationScript,[JSON.stringify(W.operations('restore',[{...two[0],tags:['omarchy-minimized-from-7']}],1))]); assert.equal(r.status,0,r.stderr);
  calls=f.read(); assert.match(calls,/workspace = "42"/); assert(!calls.includes('workspace = "7"'));
  assert.match(calls,/prop = "no_anim", value = "1"/); assert.match(calls,/prop = "no_anim", value = "unset"/);
  assert.match(calls,/alter_zorder.*mode = "top"/);
  fs.writeFileSync(f.clients,JSON.stringify([{address:'0xa',workspace:{id:-99,name:'special:minimized'},tags:[]} ]));
  fs.writeFileSync(f.calls,'');
  r=f.execute(W.mutationScript,[JSON.stringify(W.operations('restore',two,3))]); assert.equal(r.status,0,r.stderr); assert.match(f.read(),/workspace = "3"/);
  assert(!f.read().includes('address:0xb')); // closed windows dropped
}));
// A Hyprland that keeps the windows, the active one, the focused monitor and
// each monitor's open special workspace, and acts on moves, monitor focus and
// toggles as Hyprland does: a toggle acts on the focused monitor only.
function minimizedFixture(run) {
  const dir=fs.mkdtempSync(path.join(root,'tests/.reclaim-'));
  try {
    const bin=path.join(dir,'bin'); fs.mkdirSync(bin);
    const file=name=>path.join(dir,name+'.json'), calls=path.join(dir,'calls');
    fs.writeFileSync(path.join(bin,'hyprctl'),`#!/bin/bash
T=$TEST_DIR
monitors() { jq "$1" "$T/monitors.json" > "$T/m.tmp"; mv "$T/m.tmp" "$T/monitors.json"; }
case "$1" in
monitors) cat "$T/monitors.json" ;;
activewindow) cat "$T/active.json" ;;
clients) cat "$T/clients.json" ;;
dispatch) printf 'dispatch %s\\n' "$2" >> "$T/calls" ;;
--batch)
  printf 'batch %s\\n' "$2" >> "$T/calls"
  IFS=';' read -ra parts <<<"$2"
  for part in "\${parts[@]}"; do
    if [[ $part =~ window\\.move\\(\\{\\ workspace\\ =\\ \\"([0-9]+)\\".*address:(0x[0-9a-f]+) ]]; then
      jq --arg a "\${BASH_REMATCH[2]}" --argjson w "\${BASH_REMATCH[1]}" 'map(if .address == $a then .workspace = {id: $w, name: ($w | tostring)} else . end)' "$T/clients.json" > "$T/c.tmp"; mv "$T/c.tmp" "$T/clients.json"
      # The last window out closes the workspace.
      jq -e 'any(.[]; .workspace.name == "special:minimized")' "$T/clients.json" >/dev/null || monitors 'map(.specialWorkspace.name = "")'
    elif [[ $part =~ focus\\(\\{\\ monitor\\ =\\ \\"([^\\"]+)\\" ]]; then
      monitors "map(.focused = (.name == \\"\${BASH_REMATCH[1]}\\"))"
    elif [[ $part == *'toggle_special("minimized")'* ]]; then
      monitors 'map(if .focused then .specialWorkspace.name |= (if . == "special:minimized" then "" else "special:minimized" end) else . end)'
    fi
  done
  echo ok ;;
*) exit 1 ;;
esac
`); fs.chmodSync(path.join(bin,'hyprctl'),0o755);
    fs.writeFileSync(path.join(bin,'sleep'),'#!/bin/sh\nexit 0\n'); fs.chmodSync(path.join(bin,'sleep'),0o755);
    const env={...process.env,PATH:`${bin}:${process.env.PATH}`,TEST_DIR:dir};
    const minimized=(address,from)=>({address,monitor:0,workspace:{id:-97,name:'special:minimized'},tags:['omarchy-floating-workspace',`omarchy-minimized-from-${from}`]});
    const set=(name,value)=>fs.writeFileSync(file(name),JSON.stringify(value));
    const get=name=>JSON.parse(fs.readFileSync(file(name)));
    set('monitors',[{id:0,name:'DP-3',focused:true,activeWorkspace:{id:1},specialWorkspace:{name:'special:minimized'}}]);
    const read=()=>fs.existsSync(calls)?fs.readFileSync(calls,'utf8').trim().split('\n'):[];
    run({minimized,set,get,calls:read,
      reclaim:()=>{ const r=spawnSync('bash',['-c',W.reclaimScript,'test',W.mutationScript],{env,encoding:'utf8'}); assert.equal(r.status,0,r.stderr); },
      shown:()=>get('monitors').filter(m=>m.specialWorkspace.name==='special:minimized').map(m=>m.name),
      // Where the toggle and the restore batch fall among the calls.
      order:address=>{ const c=read(); return {toggle:c.findIndex(x=>x.includes('toggle_special')), restore:c.findIndex(x=>x.includes(`address:${address}" })`) && x.includes('window.move'))}; }});
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
test('a minimized window focused from outside the panel comes back alone; the others stay minimized out of sight', () => minimizedFixture(f => {
  // Show Desktop minimized both; a bar widget then focused 0xa where it waited.
  f.set('clients',[f.minimized('0xa',2),f.minimized('0xb',1)]); f.set('active',f.minimized('0xa',2));
  f.reclaim();
  const a=f.get('clients').find(c=>c.address==='0xa'), b=f.get('clients').find(c=>c.address==='0xb');
  assert.equal(a.workspace.name,'2','back where it was minimized from'); assert.equal(b.workspace.name,'special:minimized');
  deepEqual(f.shown(),[],'the minimized workspace is hidden again');
  const calls=f.calls(), all=calls.join('\n'), at=f.order('0xa');
  assert.match(all,/tag = "-omarchy-minimized-from-2", window = "address:0xa"/); assert(!all.includes('address:0xb'));
  assert.equal(calls.filter(c=>c.includes('toggle_special')).length,1); assert.match(all,/focus\(\{ monitor = "DP-3" \}\);dispatch hl\.dsp\.workspace\.toggle_special\("minimized"\)/);
  // Hidden while the window is still in it, then the window comes back and
  // takes the focus in that same batch: nothing focuses it again afterwards.
  assert(at.toggle>=0 && at.toggle<at.restore,calls.join('\n'));
  assert.match(calls[at.restore],/hl\.dsp\.focus\(\{ window = "address:0xa" \}\)/);
  assert(!calls.some(c=>c.startsWith('dispatch ')),'no focus after the restore');
}));
test('a single minimized window comes back and the workspace stays closed', () => minimizedFixture(f => {
  f.set('clients',[f.minimized('0xa',1)]); f.set('active',f.minimized('0xa',1));
  f.reclaim();
  assert.equal(f.get('clients')[0].workspace.name,'1'); deepEqual(f.shown(),[]);
  const at=f.order('0xa'); assert(at.toggle>=0 && at.toggle<at.restore);
  assert.equal(f.calls().filter(c=>c.includes('toggle_special')).length,1,'never toggled open again, empty');
}));
test('with two monitors the workspace is hidden where it shows, never opened on the other; an untagged window returns to its own monitor\'s workspace', () => minimizedFixture(f => {
  f.set('monitors',[{id:0,name:'DP-3',focused:false,activeWorkspace:{id:1},specialWorkspace:{name:'special:minimized'}},
    {id:1,name:'DP-4',focused:true,activeWorkspace:{id:5},specialWorkspace:{name:''}}]);
  const untagged={...f.minimized('0xa',1),tags:[]};
  f.set('clients',[untagged,f.minimized('0xb',1)]); f.set('active',untagged);
  f.reclaim();
  deepEqual(f.shown(),[]); assert.equal(f.get('clients')[0].workspace.name,'1','DP-3 shows workspace 1, DP-4 workspace 5');
  assert(!f.calls().some(c=>c.includes('monitor = "DP-4"')));
}));
test('the minimized workspace shown with no minimized window focused is only hidden; one not shown is left alone', () => minimizedFixture(f => {
  f.set('clients',[f.minimized('0xa',1)]); f.set('active',{});
  f.reclaim();
  deepEqual(f.shown(),[]); assert.equal(f.get('clients')[0].workspace.name,'special:minimized');
  deepEqual(f.calls(),['batch dispatch hl.dsp.focus({ monitor = "DP-3" });dispatch hl.dsp.workspace.toggle_special("minimized")']);
  f.set('active',f.minimized('0xa',1));
  const before=f.calls().length; f.reclaim(); assert.equal(f.calls().length,before,'not shown: nothing is touched');
  assert.equal(f.get('clients')[0].workspace.name,'special:minimized');
  // Wired to Hyprland's event, and run once at start.
  assert.match(fs.readFileSync(path.join(root,'Main.qml'),'utf8'),/event\.name === "activespecial" && String\(event\.data\)\.split\(","\)\[0\] === "special:minimized"\) windowActions\.reclaimMinimized\(\)/);
  assert.match(fs.readFileSync(path.join(root,'services/WindowActions.qml'),'utf8'),/Component\.onCompleted: reclaimMinimized\(\)/);
}));
test('fader journals before mutation, restores both exact values, retries errors and recovers crashes', () => compositorFixture(f => {
  const execute=(mode,owner,desired={})=>{ const r=f.execute(F.script,[f.home,mode,owner,JSON.stringify(desired)]); assert.equal(r.status,0,r.stderr); return r; };
  const journal=path.join(f.home,'.local/state/familiar-dock/faded.json');
  execute('init','first'); execute('step','first',{'0xa':0});
  assert.match(f.read(),/prop = "opacity", value = "0"/); assert.match(f.read(),/prop = "opacity_inactive", value = "0"/);
  const original=JSON.parse(fs.readFileSync(journal)).windows['0xa'];
  assert.equal(original.opacity,0.6); assert.equal(original.opacity_inactive,0.35);
  execute('step','first',{'0xa':0.4}); assert.equal(f.read().split('getprop').length-1,2);
  let current=JSON.parse(fs.readFileSync(journal)).windows['0xa'];
  assert.equal(current.current,0.4); assert.equal(current.current_inactive,0.4);
  // Interrupted exit blends back to each distinct original, never guessed 1/unset.
  const partial=f.execute(F.script,[f.home,'step','first',JSON.stringify({'0xa':0.7}),'{}']); assert.equal(partial.status,0,partial.stderr);
  current=JSON.parse(fs.readFileSync(journal)).windows['0xa'];
  assert(Math.abs(current.current-0.5)<1e-8); assert(Math.abs(current.current_inactive-0.375)<1e-8);
  execute('step','first',{}); assert.match(f.read(),/prop = "opacity", value = "0.6"/); assert.match(f.read(),/prop = "opacity_inactive", value = "0.35"/);
  assert(!fs.existsSync(journal));
  execute('step','first',{'0xa':0}); execute('init','second'); assert(!fs.existsSync(journal));
  execute('step','second',{'0xa':0.4}); const before=f.read(); execute('cleanup','first'); assert.equal(f.read(),before); // stale shell cannot restore over new owner
  fs.writeFileSync(f.env.TEST_FAIL,'');
  const failed=f.execute(F.script,[f.home,'step','second','{}']); assert.equal(failed.status,1);
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(journal)).windows).length,1);
  fs.rmSync(f.env.TEST_FAIL); execute('cleanup','second'); assert(!fs.existsSync(journal));
  execute('step','second',{'0xa':0}); fs.writeFileSync(f.clients,'[]'); execute('step','second',{}); assert(!fs.existsSync(journal));
}));
test('the fade journal is the user\'s alone under an open umask', () => compositorFixture(f => {
  const state=path.join(f.home,'.local/state/familiar-dock'), mode=file=>fs.statSync(file).mode&0o777;
  for(const [step,desired] of [['init','{}'],['step','{"0xa":0.2}']]) { const r=f.execute('umask 022\n'+F.script,[f.home,step,'owner',desired]); assert.equal(r.status,0,r.stderr); }
  assert.equal(mode(state),0o700);
  for(const name of ['faded.json','fader.lock','fader-owner']) assert.equal(mode(path.join(state,name)),0o600,name);
}));
test('removal cleanup restores a fade only while the plugin is still off', () => compositorFixture(f => {
  const journal=path.join(f.home,'.local/state/familiar-dock/faded.json'), cfg=path.join(f.home,'.config/omarchy/shell.json');
  fs.mkdirSync(path.dirname(cfg),{recursive:true});
  const execute=(mode,owner,desired={})=>{ const r=f.execute(F.script,[f.home,mode,owner,JSON.stringify(desired)]); assert.equal(r.status,0,r.stderr); };
  // Re-enabled before the cleanup took the lock: the new instance owns the fade.
  fs.writeFileSync(cfg,JSON.stringify({plugins:[{id:'rugobal.familiar-dock'}],disabledPlugins:[]}));
  execute('init','new'); execute('step','new',{'0xa':0.2});
  const before=f.read(); execute('removal','cleanup'); assert.equal(f.read(),before); assert(fs.existsSync(journal));
  execute('step','new',{'0xa':0.1}); assert.match(f.read(),/value = "0.1"/,'the new instance still fades');
  // Still off: the cleanup restores whoever faded the windows.
  fs.writeFileSync(cfg,JSON.stringify({plugins:[{id:'rugobal.familiar-dock'}],disabledPlugins:['rugobal.familiar-dock']}));
  execute('removal','cleanup'); assert(!fs.existsSync(journal)); assert.match(f.read(),/prop = "opacity", value = "0.6"/);
}));
test('dock setting false restores live only with ownership, and true hides again', () => {
  const dir=fs.mkdtempSync(path.join(root,'tests/.dock-live-'));
  try {
    const bin=path.join(dir,'bin'),home=path.join(dir,'home'),cfg=path.join(home,'.config/omarchy/shell.json'),marker=path.join(home,'.local/state/familiar-dock/dock-hidden');
    fs.mkdirSync(bin); fs.mkdirSync(path.dirname(cfg),{recursive:true});
    fakeOmarchy(bin);
    fs.writeFileSync(cfg,JSON.stringify({plugins:[{id:'rugobal.familiar-dock'}],disabledPlugins:[]}));
    const calls=path.join(dir,'calls'),env={...process.env,PATH:`${bin}:${process.env.PATH}`,TEST_CALLS:calls,TEST_SHELL_CONFIG:cfg};
    const run=script=>assert.equal(spawnSync('bash',['-c',script,'test',home],{env}).status,0);
    run(Dock.liveRestoreScript); assert(!fs.existsSync(calls));
    run(Dock.hideScript); assert(fs.existsSync(marker)); run(Dock.liveRestoreScript); assert(!fs.existsSync(marker));
    run(Dock.hideScript); assert(fs.existsSync(marker));
    deepEqual(fs.readFileSync(calls,'utf8').trim().split('\n'),['plugin disable omarchy.dock','plugin enable omarchy.dock','plugin disable omarchy.dock']);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('dynamic text sinks and animation durations follow plugin safety rules', () => {
  for (const dir of ['panel','services','settings','settings/ui']) {
    for(const name of fs.readdirSync(path.join(root,dir)).filter(n=>n.endsWith('.qml'))) {
      const source=fs.readFileSync(path.join(root,dir,name),'utf8');
      for(const match of source.matchAll(/\bText\s*\{/g)) {
        assert.match(source.slice(match.index,match.index+200),/textFormat:\s*Text\.PlainText/,name);
      }
      // Omarchy's motion: eased, never linear, and under 300ms.
      for(const match of source.matchAll(/\bduration:\s*([^;\n}]+)/g)) {
        assert.match(match[1],/Commons\.Style\.duration\(/,name);
        // A pause between movements is not motion.
        const pause=/PauseAnimation\s*\{\s*$/.test(source.slice(Math.max(0,match.index-40),match.index));
        assert(pause || !/\b(?:[3-9]\d\d|\d{4,})\b/.test(match[1]),name+': '+match[1]);
      }
      for(const match of source.matchAll(/\b(?:Number|Color)Animation\s*\{[^}]*\}/g)) assert.match(match[0],/easing\.type/,name);
    }
  }
  const cap=library('panel/Hover.js').maxMotion;
  assert(cap>0 && cap<300,String(cap));
  const source=fs.readFileSync(path.join(root,'panel/Tooltip.qml'),'utf8');
  assert.match(source,/textFormat:\s*Text\.PlainText/);
  assert.match(source,/text:\s*root\.text/);
  assert.match(source,/root\.text\.slice\(0, 512\)/);
  const button=fs.readFileSync(path.join(root,'panel/AppButton.qml'),'utf8');
  assert.match(button,/readonly property bool hovered: mouse\.containsMouse/);
});
test('new-window action replaces the generic row and is selected for new instances', () => {
  const action={id:'new-window',name:'New Window'};
  assert.equal(W.newWindowAction({actions:[{id:'other'},action]}),action);
  assert.equal(W.newWindowAction({actions:[]}),null);
  const settings=defaults({'secondarymenu-contains-appmenu':true,favorites:[]});
  const rows=M.appRows({appKey:'files',windows:[],desktopEntry:{actions:[action]}},settings,k=>k,'Quit');
  assert.equal(rows.filter(r=>r.kind==='new').length,0);
  assert.equal(rows.filter(r=>r.kind==='action').length,1);
});
test('transient FileView reads retry silently; persistent invalid JSON is rejected', () => {
  assert.equal(C.readResult('',0).status,'retry');
  assert.equal(C.readResult('{',1).status,'retry');
  assert.equal(C.readResult('{"favorites":[]}',2).status,'ok');
  for (const bad of ['', '{', '[]', 'null']) assert.equal(C.readResult(bad,2).status,'invalid');
});
const Sys = library('services/SystemDefaults.js');
test('system defaults distinguish absent/null favorites from explicit empty/user lists; first edit materializes', () => {
  for (const raw of [{},{favorites:null}]) deepEqual(C.effectiveFavorites(defaults(raw),['browser','files','term']),['browser','files','term']);
  deepEqual(C.effectiveFavorites(defaults({favorites:[]}),['browser']),[]);
  deepEqual(C.effectiveFavorites(defaults({favorites:['mine']}),['browser']),['mine']);
  const raw={unknown:{keep:true}}, pins=C.effectiveFavorites(defaults(raw),['browser','files','term']);
  deepEqual(C.withSettings(raw,{favorites:C.reorderFavorites(pins,'term','browser')}),{unknown:{keep:true},favorites:['term','browser','files']});
});
test('default resolver parses commands, terminal precedence/comments/actions, installed entries and dedupe', () => {
  const lookup=id=>['browser','files','term','specific'].includes(id)?{id}:null;
  deepEqual(Sys.listPaths('/cfg','Hyprland:GNOME'),['/cfg/hyprland-xdg-terminals.list','/cfg/gnome-xdg-terminals.list','/cfg/xdg-terminals.list']);
  deepEqual(Sys.terminalIds('\n# comment\nmissing.desktop\nspecific.desktop:new-window # tail\n'),['missing','specific']);
  deepEqual(Sys.resolve({browser:'browser.desktop\n',files:'files.desktop',lists:['# hi\nmissing.desktop\nspecific.desktop:act','term.desktop']},lookup),['browser','files','specific']);
  deepEqual(Sys.resolve({browser:'omarchy-browser.desktop',files:'files.desktop',lists:['missing.desktop','term.desktop']},lookup),['files','term']);
  deepEqual(Sys.resolve({browser:'files.desktop',files:'files.desktop',lists:['uninstalled.desktop']},lookup),['files']);
});
test('resolver command prefers Omarchy, falls back only when missing, and returns failure without replacement data', () => {
  const dir=fs.mkdtempSync(path.join(root,'tests/.defaults-'));
  try {
    const bin=path.join(dir,'bin'); fs.mkdirSync(bin);
    const commands={
      'omarchy-cmd-default-browser':'[[ ${TEST_BROWSER_FAIL:-0} != 1 ]] || exit 7; printf "browser.desktop\\n"',
      'xdg-settings':'printf "fallback.desktop\\n"',
      'xdg-mime':'printf "files.desktop\\n"'
    };
    for(const [name,body] of Object.entries(commands)) { const p=path.join(bin,name); fs.writeFileSync(p,'#!/bin/bash\n'+body+'\n'); fs.chmodSync(p,0o755); }
    const bashEnv=path.join(dir,'bash-env');
    fs.writeFileSync(bashEnv,'command() { if [[ ${TEST_BROWSER_MISSING:-0} == 1 && $* == "-v omarchy-cmd-default-browser" ]]; then return 1; fi; builtin command "$@"; }\n');
    const list=path.join(dir,'terminals with spaces'); fs.writeFileSync(list,'# comment\nterm.desktop:new-window\n');
    const run=extra=>spawnSync('bash',['-c',Sys.resolveScript,'test',list,path.join(dir,'missing')],{encoding:'utf8',env:{...process.env,PATH:`${bin}:${process.env.PATH}`,BASH_ENV:bashEnv,...extra}});
    let result=run({}); assert.equal(result.status,0,result.stderr);
    deepEqual(JSON.parse(result.stdout),{browser:'browser.desktop',files:'files.desktop',lists:['# comment\nterm.desktop:new-window','']});
    result=run({TEST_BROWSER_MISSING:'1'}); assert.equal(result.status,0,result.stderr); assert.equal(JSON.parse(result.stdout).browser,'fallback.desktop');
    result=run({TEST_BROWSER_FAIL:'1'}); assert.equal(result.status,7); assert.equal(result.stdout,'');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
const Clock = library('services/ClockLogic.js');
test('hosted clock settings are found in every bar section, including tray, and fallback is explicit', () => {
  for (const section of ['left','centerBegin','center','centerEnd','right','tray']) {
    const entry={id:'omarchy.clock',format:'ddd d MMM HH:mm'};
    deepEqual(Clock.findEntry({[section]:[{id:'other'},entry]}),{section,index:1,entry});
  }
  assert.equal(Clock.findEntry({tray:[]}),null);
  assert.equal(Clock.source(true),'omarchy'); assert.equal(Clock.source(false),'fallback');
  const s=defaults({'panel-element-positions':{'*':[{element:'dateMenu',visible:true}],other:[{element:'dateMenu',visible:true}]}});
  const changed=Clock.visibleLayout(s,'DP-3','DP-3',false);
  assert.equal(changed['*'].find(r=>r.element==='dateMenu').visible,false);
  assert.equal(changed.other.find(r=>r.element==='dateMenu').visible,true);
  s['panel-element-positions-monitors-sync']=false;
  assert.equal(Clock.visibleLayout(s,'DP-3','DP-3',false)['DP-3'].find(r=>r.element==='dateMenu').visible,false);
  s['panel-element-positions']=s['panel-element-positions']['*'];
  const fromArray=Clock.visibleLayout(s,'DP-3','DP-3',false);
  assert.equal(fromArray['*'].find(r=>r.element==='dateMenu').visible,true);
  assert.equal(fromArray['DP-3'].find(r=>r.element==='dateMenu').visible,false);
});
test('clock lifecycle decisions preserve unowned disables and hot reload ownership', () => {
  for (const shown of [false,true]) for(const disabled of [false,true]) for(const marker of [false,true]) for(const enabled of [false,true]) {
    const expected=marker&&(!shown||!enabled)?'restore':shown&&enabled&&!disabled&&!marker?'hide':'nothing';
    assert.equal(Clock.decision(shown,disabled,marker,enabled),expected);
  }
});
test('clock IPC elects one visible clock, yields to top bar and switches with focus or visibility', () => {
  const Ipc=library('services/ClockIpc.js');
  const make=()=>({target:'omarchy.clock',enabled:true,cycleFormat(){},toggleWeekStart(){}});
  const a=make(),b=make(),top=make(), records=[{monitor:'A',visible:true,handler:a},{monitor:'B',visible:true,handler:b}];
  assert.equal(Ipc.handler({data:[{},a]}),a); assert.equal(Ipc.handler({data:[{}]}),null);
  let r=Ipc.reconcile(records,'B','A',false,[top,a,b]);
  assert(!a.enabled && !b.enabled && top.enabled); assert(!r.pending);
  r=Ipc.reconcile(records,'B','A',true,[top,a,b]);
  assert(r.pending); assert(!b.enabled); // top bar still being destroyed
  top.enabled=false;
  r=Ipc.reconcile(records,'B','A',true,[top,a,b]);
  assert.equal(r.monitor,'B'); assert(b.enabled && !a.enabled); assert(!r.pending);
  r=Ipc.reconcile(records,'A','A',true,[a,b]); assert(a.enabled && !b.enabled);
  records[0].visible=false;
  r=Ipc.reconcile(records,'A','A',true,[a,b]); assert.equal(r.monitor,'B'); assert(!a.enabled && b.enabled);
  records[1].visible=false;
  r=Ipc.reconcile(records,'A','A',true,[a,b]); assert(!a.enabled && !b.enabled && !r.pending);
  records[0].visible=true; top.enabled=true;
  Ipc.reconcile(records,'A','A',false,[top,a,b]); assert(top.enabled && !a.enabled && !b.enabled);
  assert.match(fs.readFileSync(path.join(root,'panel/OmarchyClock.qml'),'utf8'),/root.ipcHandler.enabled = false/);
});
// A registry-like shell for the clock script. Its state lives in
// shell.json.memory: `omarchy-shell shell listShellConfig` answers from it,
// and it is saved to shell.json at once, or only on flush() while `late`
// exists. Disable takes the first clock off the bar; put adds one where none
// is, at the index given or the section's end; `bar set` refuses a section
// with no clock, or a bare id, as the registry does. While `stuck` exists
// removals and puts are lost, while `silent` exists the shell does not answer
// a read, and while `setfail` exists every `bar set` fails once the number
// of sets it holds, if any, have been made.
function clockFixture(run) {
  const dir=fs.mkdtempSync(path.join(root,'tests/.clock-live-'));
  try {
    const bin=path.join(dir,'bin'), stateHome=path.join(dir,'state-home'); fs.mkdirSync(bin);
    const config=path.join(stateHome,'.config/omarchy/shell.json'); fs.mkdirSync(path.dirname(config),{recursive:true});
    const calls=path.join(dir,'calls'), stuck=path.join(dir,'stuck'), late=path.join(dir,'late'), memory=config+'.memory';
    const silent=path.join(dir,'silent'), setfail=path.join(dir,'setfail');
    const memo=`cfg=$TEST_SHELL_CONFIG; mem=$cfg.memory
[[ -f $mem ]] || cp "$cfg" "$mem"`;
    for(const [name,body] of [['omarchy-shell',`printf '%s\\n' "$*" >> "$TEST_CALLS"
${memo}
[[ "$1 $2" == "shell listShellConfig" && ! -e $TEST_CLOCK_SILENT ]] || { echo 'omarchy-shell is not responding' >&2; exit 1; }
jq -c . "$mem"`],['omarchy',`printf '%s\\n' "$*" >> "$TEST_CALLS"
${memo}
save() { mv "$mem.tmp" "$mem"; [[ -e $TEST_CLOCK_LATE ]] || cp "$mem" "$cfg"; }
is='(. == "omarchy.clock" or (type == "object" and .id == "omarchy.clock"))'
count='([.bar.layout[]?[]? | select('"$is"')] | length)'
case "$1 $2" in
  "plugin disable")
    [[ $3 == omarchy.clock && ! -e $TEST_CLOCK_STUCK ]] || exit 0
    jq '([.bar.layout | to_entries[] | .key as $s | .value | to_entries[] | select(.value | '"$is"') | [$s, .key]][0]) as $at | if $at then .bar.layout[$at[0]] |= del(.[$at[1]]) else . end' "$mem" > "$mem.tmp"; save ;;
  "bar put")
    [[ ! -e $TEST_CLOCK_STUCK ]] || exit 0
    jq --arg s "$5" --argjson i "$7" 'if '"$count"' > 0 then . else .bar.layout[$s] |= ((. // []) as $r | ([$i, ($r | length)] | min) as $n | $r[:$n] + [{id: "omarchy.clock"}] + $r[$n:]) end' "$mem" > "$mem.tmp"; save ;;
  "bar set")
    if [[ -e $TEST_CLOCK_SETFAIL ]]; then
      left=$(<"$TEST_CLOCK_SETFAIL")
      [[ $left =~ ^[1-9][0-9]*$ ]] || { echo 'shell is not responding' >&2; exit 1; }
      echo $((left - 1)) > "$TEST_CLOCK_SETFAIL"
    fi
    jq --arg s "$8" --arg k "$4" --argjson v "$5" '(.bar.layout[$s] // []) as $r | ([$r | to_entries[] | select(.value | '"$is"') | .key][0]) as $n
      | if $n == null or ($r[$n] | type) != "object" then error("could not find widget omarchy.clock in " + $s) else .bar.layout[$s][$n][$k] = $v end' "$mem" > "$mem.tmp" || exit 1
    save ;;
  *) exit 3 ;;
esac`],['sleep',':']]) {
      const file=path.join(bin,name); fs.writeFileSync(file,'#!/bin/bash\n'+body+'\n'); fs.chmodSync(file,0o755);
    }
    const env={...process.env,PATH:`${bin}:${process.env.PATH}`,TEST_CALLS:calls,TEST_SHELL_CONFIG:config,TEST_CLOCK_STUCK:stuck,TEST_CLOCK_LATE:late,TEST_CLOCK_SILENT:silent,TEST_CLOCK_SETFAIL:setfail};
    // An open umask, as most users have: the scripts must not rely on it.
    const attempt=(mode,next)=>spawnSync('bash',['-c','umask 022\n'+Clock.script,'test',stateHome,mode,JSON.stringify(next??null)],{env,encoding:'utf8'});
    const exec=(mode,next)=> {const result=attempt(mode,next);assert.equal(result.status,0,result.stderr);};
    const marker=path.join(stateHome,'.local/state/familiar-dock/clock-hidden');
    const read=()=>fs.existsSync(calls)?fs.readFileSync(calls,'utf8').trim().split('\n'):[];
    run({config,stuck,late,silent,setfail,marker,exec,attempt,
      // What the user or a fresh shell has: memory and file agree.
      write:value=>{fs.writeFileSync(config,JSON.stringify(value)); fs.rmSync(memory,{force:true});},
      // A stash written by an earlier run.
      stashed:value=>{fs.mkdirSync(path.dirname(marker),{recursive:true}); fs.writeFileSync(marker,JSON.stringify(value));},
      flush:()=>fs.copyFileSync(memory,config),
      // The bar as the shell has it, and as shell.json has it.
      layout:()=>JSON.parse(fs.readFileSync(fs.existsSync(memory)?memory:config)).bar.layout,
      disk:()=>JSON.parse(fs.readFileSync(config)).bar.layout,
      stash:()=>JSON.parse(fs.readFileSync(marker)),
      // Every request, and the ones that change something.
      calls:read, acts:()=>read().filter(c=>c!=='shell listShellConfig')});
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
const dockOn={plugins:[{id:'rugobal.familiar-dock'}]};
test('clock lifecycle stashes exact placement/settings, restores them and updates the hidden format safely', () => clockFixture(f => {
  const entry={id:'omarchy.clock',format:'ddd d MMM HH:mm',formatAlt:"d MMMM 'W'ww yyyy",verticalFormat:'HH\n—\nmm'};
  f.write({...dockOn,bar:{layout:{tray:[{id:'other'},entry]}}});
  f.exec('show'); deepEqual(f.stash(),{section:'tray',index:1,entry}); deepEqual(f.layout().tray,[{id:'other'}]);
  f.exec('cleanup'); assert(fs.existsSync(f.marker)); // plugin enabled, no flap
  const changed={...entry,format:'HH:mm "$(bad)"'}; f.exec('update',changed);
  assert.equal(f.stash().entry.format,changed.format);
  f.exec('hide'); assert(!fs.existsSync(f.marker));
  const lines=f.calls().join('\n'); assert.match(lines,/bar put omarchy.clock --section tray --index 1/); assert.match(lines,/bar set omarchy.clock format .* --json --from-section tray$/m);
  deepEqual(f.layout().tray,[{id:'other'},changed],'put back where it was, with the settings it had');
  deepEqual(f.disk(),f.layout());
  const before=f.calls().length; f.exec('hide'); assert.equal(f.calls().length,before,'nothing stashed: nothing asked');
}));
test('a clock hide that never landed is tried again; a clock the user put back stays as they have it', () => clockFixture(f => {
  const entry={id:'omarchy.clock',format:'HH:mm'};
  f.write({...dockOn,bar:{layout:{center:[entry]}}});
  fs.writeFileSync(f.stuck,'');
  f.exec('show'); deepEqual(f.stash(),{section:'center',index:0,entry,pending:true}); assert.equal(f.layout().center.length,1);
  f.exec('show'); assert.equal(f.acts().filter(c=>c==='plugin disable omarchy.clock').length,2,'a pending hide is tried again');
  fs.unlinkSync(f.stuck);
  f.exec('show'); deepEqual(f.stash(),{section:'center',index:0,entry},'confirmed once the shell shows the clock gone'); deepEqual(f.layout().center,[]);
  // The user puts a clock of their own back while the plugin runs: it stays,
  // and the restore leaves it where and as it is.
  f.write({...dockOn,bar:{layout:{right:[{id:'omarchy.clock',format:'h:mm'}]}}});
  const before=f.calls().length;
  f.exec('show'); assert.equal(f.calls().length,before,'a confirmed stash never hides again');
  f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.calls().slice(before),['shell listShellConfig'],'nothing is put or set over it');
  deepEqual(f.layout(),{right:[{id:'omarchy.clock',format:'h:mm'}]});
  // One put back with nothing set (`omarchy plugin enable`) gets the
  // settings the stash kept, where the user put it.
  f.stashed({section:'center',index:0,entry});
  f.write({...dockOn,bar:{layout:{right:[{id:'omarchy.clock'}]}}});
  f.exec('show'); f.exec('hide'); assert(!fs.existsSync(f.marker));
  deepEqual(f.layout(),{right:[entry]}); assert(!f.acts().slice(-1)[0].startsWith('bar put'));
}));
test('two clocks on the bar are left alone, hidden or restored, bare ids included', () => clockFixture(f => {
  for (const layout of [{center:[{id:'omarchy.clock',format:'HH:mm'}],right:[{id:'omarchy.clock',format:'h:mm a'}]},
    {left:['omarchy.clock'],right:[{id:'omarchy.clock',format:'h:mm a'}]}]) {
    f.write({...dockOn,bar:{layout}});
    f.exec('show'); assert(!fs.existsSync(f.marker)); deepEqual(f.acts(),[]); deepEqual(f.layout(),layout);
    for (const extra of [{},{pending:true},{placed:true}]) {
      f.stashed({section:'center',index:0,entry:{id:'omarchy.clock',format:'H'},...extra});
      f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.acts(),[]); deepEqual(f.layout(),layout);
    }
  }
}));
test('a bare clock id is hidden and put back like an entry; the top bar knows it has a clock', () => clockFixture(f => {
  f.write({...dockOn,bar:{layout:{left:['other'],right:['omarchy.clock']}}});
  f.exec('show'); deepEqual(f.stash(),{section:'right',index:0,entry:{id:'omarchy.clock'}}); deepEqual(f.layout().right,[]);
  f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.layout().right,[{id:'omarchy.clock'}]);
  assert(!f.acts().some(c=>c.startsWith('bar set')),'a bare id has no settings to put back');
  deepEqual(Clock.findEntry({left:['other'],right:['omarchy.clock']}),{section:'right',index:0,entry:{id:'omarchy.clock'}});
  // A bare id the user put back takes no settings: it stays as it is.
  f.stashed({section:'right',index:0,entry:{id:'omarchy.clock',format:'HH:mm'}});
  f.write({...dockOn,bar:{layout:{right:['omarchy.clock']}}});
  f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.layout(),{right:['omarchy.clock']});
}));
test('the shell, not a late shell.json, says where the clock is; a hide that never landed leaves the clock as the user has it', () => clockFixture(f => {
  const entry={id:'omarchy.clock',format:'HH:mm'};
  // The shell takes the clock away but saves shell.json late: the hide is
  // confirmed by the shell's answer, and the restore that follows puts the
  // clock back once.
  f.write({...dockOn,bar:{layout:{left:['other'],center:[entry]}}});
  fs.writeFileSync(f.late,''); f.exec('show');
  deepEqual(f.stash(),{section:'center',index:0,entry}); deepEqual(f.disk().center,[entry]); deepEqual(f.layout().center,[]);
  f.exec('hide'); assert(!fs.existsSync(f.marker));
  fs.unlinkSync(f.late); f.flush();
  deepEqual(f.disk(),{left:['other'],center:[entry]});
  assert.equal(f.acts().filter(c=>c.startsWith('bar put')).length,1);
  // The removal is lost and nothing has changed: the restore has nothing to do.
  f.write({...dockOn,bar:{layout:{left:['other'],center:[entry]}}});
  fs.writeFileSync(f.stuck,''); f.exec('show'); assert.equal(f.stash().pending,true); fs.unlinkSync(f.stuck);
  let before=f.acts().length;
  f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.acts().slice(before),[]); deepEqual(f.layout().center,[entry]);
  // The removal is lost; meanwhile the user moves and changes the clock.
  // Restoring leaves it as the user has it.
  fs.writeFileSync(f.stuck,''); f.exec('show'); assert.equal(f.stash().pending,true); fs.unlinkSync(f.stuck);
  const moved={left:['other'],right:[{id:'omarchy.clock',format:'h:mm a'}]};
  f.write({...dockOn,bar:{layout:moved}});
  before=f.acts().length;
  f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.acts().slice(before),[]); deepEqual(f.layout(),moved);
  // Hidden again before then, the changed clock is what is stashed.
  fs.writeFileSync(f.stuck,''); f.write({...dockOn,bar:{layout:{center:[entry]}}}); f.exec('show'); fs.unlinkSync(f.stuck);
  f.write({...dockOn,bar:{layout:moved}}); f.exec('show');
  deepEqual(f.stash(),{section:'right',index:0,entry:{id:'omarchy.clock',format:'h:mm a'}}); deepEqual(f.layout().right,[]);
}));
test('a clock put the shell never made keeps its stash, and owns no clock the user adds later', () => clockFixture(f => {
  const stash={section:'right',index:0,entry:{id:'omarchy.clock',format:'HH:mm'}};
  f.write({...dockOn,bar:{layout:{right:[]}}}); f.stashed(stash); fs.writeFileSync(f.stuck,'');
  assert.notEqual(f.attempt('hide').status,0); deepEqual(f.stash(),{...stash,placed:true},'kept to try again');
  fs.unlinkSync(f.stuck); f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.layout().right,[stash.entry]);
  // Failed again, then the dock comes back with no clock on the bar: nothing
  // of the stash is there, so it owns nothing.
  f.write({...dockOn,bar:{layout:{right:[]}}}); f.stashed(stash); fs.writeFileSync(f.stuck,'');
  assert.notEqual(f.attempt('hide').status,0); fs.unlinkSync(f.stuck);
  f.exec('show'); deepEqual(f.stash(),stash);
  // Hours later the user adds a clock of their own: neither a show nor the
  // restore touches it.
  const theirs={right:[{id:'omarchy.clock',format:'h:mm a'}]};
  f.write({...dockOn,bar:{layout:theirs}});
  const before=f.acts().length;
  f.exec('show'); f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.acts().slice(before),[]); deepEqual(f.layout(),theirs);
}));
test('a restore waits while the shell does not answer', () => clockFixture(f => {
  const layout={right:[{id:'omarchy.clock',format:'h:mm a'}]};
  const stash={section:'right',index:0,entry:{id:'omarchy.clock',format:'HH:mm'}};
  f.write({...dockOn,bar:{layout}}); f.stashed(stash); fs.writeFileSync(f.silent,'');
  assert.notEqual(f.attempt('hide').status,0); deepEqual(f.stash(),stash);
  deepEqual(f.acts(),[],'nothing is put or set without an answer'); deepEqual(f.layout(),layout);
  fs.unlinkSync(f.marker);
  assert.notEqual(f.attempt('show').status,0,'nor hidden'); assert(!fs.existsSync(f.marker)); deepEqual(f.acts(),[]);
  fs.unlinkSync(f.silent); f.stashed(stash); f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.layout(),layout,'then the clock on the bar stays');
}));
test('a restore cut short finishes its settings next time, or is hidden again with them', () => clockFixture(f => {
  const entry={id:'omarchy.clock',format:'HH:mm',formatAlt:'d MMMM'};
  for (const next of ['hide','show','late show','show twice','changed']) {
    f.write({...dockOn,bar:{layout:{right:[]}}}); f.stashed({section:'right',index:0,entry});
    // shell.json may not show the clock yet: the shell's answer counts.
    if (next==='late show') fs.writeFileSync(f.late,'');
    // The clock is put back, then its settings fail.
    fs.writeFileSync(f.setfail,''); assert.notEqual(f.attempt('hide').status,0); fs.unlinkSync(f.setfail);
    deepEqual(f.stash(),{section:'right',index:0,entry,placed:true}); deepEqual(f.layout().right,[{id:'omarchy.clock'}]);
    if (next==='hide') {
      // The clock it put there is its own: the settings are finished, not left.
      f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.layout().right,[entry]);
    } else if (next==='changed') {
      // The user sets that clock by hand before then: it is theirs now.
      const mine={id:'omarchy.clock',format:'h:mm a'};
      f.write({...dockOn,bar:{layout:{right:[mine]}}});
      f.exec('show'); assert(fs.existsSync(f.marker)); deepEqual(f.layout().right,[mine]);
      f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.layout().right,[mine]);
    } else {
      // Hidden again: the stash keeps every setting, not the half-set clock's,
      // even when the first try to hide it is lost.
      if (next==='show twice') { fs.writeFileSync(f.stuck,''); f.exec('show'); fs.unlinkSync(f.stuck); deepEqual(f.stash(),{section:'right',index:0,entry,pending:true}); }
      f.exec('show'); deepEqual(f.stash(),{section:'right',index:0,entry}); deepEqual(f.layout().right,[]);
      f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.layout().right,[entry]);
    }
    if (fs.existsSync(f.late)) fs.unlinkSync(f.late);
  }
}));
test('a settings change while the clock may still be on the bar keeps that clock known as the stash\'s', () => clockFixture(f => {
  const entry={id:'omarchy.clock',format:'HH:mm',formatAlt:'d MMMM'}, updated={...entry,format:'h:mm a'};
  for (const next of ['hide','show']) {
    // A restore sets the format, then fails on the next setting.
    f.write({...dockOn,bar:{layout:{right:[]}}}); f.stashed({section:'right',index:0,entry});
    fs.writeFileSync(f.setfail,'1'); assert.notEqual(f.attempt('hide').status,0); fs.unlinkSync(f.setfail);
    deepEqual(f.layout().right,[{id:'omarchy.clock',format:'HH:mm'}]);
    f.exec('update',updated); deepEqual(f.stash(),{section:'right',index:0,entry:updated,placed:true,prior:[entry]});
    f.exec(next);
    if (next==='hide') { assert(!fs.existsSync(f.marker)); deepEqual(f.layout().right,[updated]); }
    else {
      deepEqual(f.stash(),{section:'right',index:0,entry:updated}); deepEqual(f.layout().right,[]);
      f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.layout().right,[updated]);
    }
  }
  // A hide that never landed, then a change: the clock still there is the
  // stash's, and is hidden or given the change.
  for (const next of ['hide','show']) {
    f.write({...dockOn,bar:{layout:{right:[entry]}}});
    fs.writeFileSync(f.stuck,''); f.exec('show'); fs.unlinkSync(f.stuck); assert.equal(f.stash().pending,true);
    f.exec('update',updated); deepEqual(f.stash().prior,[entry]);
    f.exec(next);
    if (next==='hide') { assert(!fs.existsSync(f.marker)); deepEqual(f.layout().right,[updated]); }
    else { deepEqual(f.stash(),{section:'right',index:0,entry:updated}); deepEqual(f.layout().right,[]); }
  }
  // Once the clock is seen gone, a change keeps no earlier settings.
  f.exec('update',entry); deepEqual(f.stash(),{section:'right',index:0,entry});
  // The half-set clock goes before the restore runs again: the clock put in
  // its place owes nothing to the settings the old one held, so a format the
  // user then gives it, even one of those, stays.
  f.write({...dockOn,bar:{layout:{right:[]}}}); f.stashed({section:'right',index:0,entry});
  fs.writeFileSync(f.setfail,'1'); assert.notEqual(f.attempt('hide').status,0); fs.unlinkSync(f.setfail);
  f.exec('update',updated); deepEqual(f.stash().prior,[entry]);
  f.write({...dockOn,bar:{layout:{right:[]}}});
  fs.writeFileSync(f.setfail,''); assert.notEqual(f.attempt('hide').status,0); fs.unlinkSync(f.setfail);
  deepEqual(f.stash(),{section:'right',index:0,entry:updated,placed:true}); deepEqual(f.layout().right,[{id:'omarchy.clock'}]);
  const mine={id:'omarchy.clock',format:'HH:mm'};
  f.write({...dockOn,bar:{layout:{right:[mine]}}});
  f.exec('hide'); assert(!fs.existsSync(f.marker)); deepEqual(f.layout().right,[mine]);
}));
test('a clock whose section has shrunk is put back at its end with its settings', () => clockFixture(f => {
  f.write({...dockOn,bar:{layout:{center:[]}}});
  f.stashed({section:'center',index:3,entry:{id:'omarchy.clock',format:'HH:mm'}});
  f.exec('hide'); assert(!fs.existsSync(f.marker));
  deepEqual(f.layout(),{center:[{id:'omarchy.clock',format:'HH:mm'}]});
}));
const modeOf=file=>fs.statSync(file).mode&0o777;
test('the clock stash is the user\'s alone, also in a state directory an earlier version left open', () => clockFixture(f => {
  const entry={id:'omarchy.clock',format:'HH:mm',birthYear:1990,lifeExpectancy:80}, state=path.dirname(f.marker);
  f.write({...dockOn,bar:{layout:{right:[entry]}}});
  fs.mkdirSync(state,{recursive:true}); fs.chmodSync(state,0o755);
  f.exec('show'); deepEqual(f.stash().entry,entry);
  assert.equal(modeOf(state),0o700); assert.equal(modeOf(f.marker),0o600); assert.equal(modeOf(path.join(state,'clock.lock')),0o600);
  f.exec('update',{...entry,format:'H:mm'}); assert.equal(f.stash().entry.format,'H:mm'); assert.equal(modeOf(f.marker),0o600);
  // A confirmed stash is not rewritten. An earlier 0644 file, and its temp
  // file, are still closed, and the birth year in it is left byte for byte.
  const kept=fs.readFileSync(f.marker);
  fs.chmodSync(state,0o755); fs.chmodSync(f.marker,0o644); fs.chmodSync(path.join(state,'clock.lock'),0o644);
  fs.writeFileSync(f.marker+'.tmp',kept); fs.chmodSync(f.marker+'.tmp',0o644);
  f.exec('show');
  assert.equal(modeOf(state),0o700); assert.equal(modeOf(f.marker),0o600); assert.equal(modeOf(f.marker+'.tmp'),0o600);
  assert.equal(modeOf(path.join(state,'clock.lock')),0o600);
  assert.deepEqual(fs.readFileSync(f.marker),kept);
}));
const Lifecycle = library('services/Lifecycle.js');
test('the state directory is made private; its parents keep the user\'s umask; one it cannot make stops the script', () => {
  const dir=fs.mkdtempSync(path.join(root,'tests/.private-'));
  try {
    const state=path.join(dir,'parent/familiar-dock');
    const run=target=>spawnSync('bash',['-c','umask 022; state=$1; '+Lifecycle.privateState+'; : > "$state/file"; echo went on','test',target],{encoding:'utf8'});
    let r=run(state); assert.equal(r.status,0,r.stderr);
    assert.equal(modeOf(state),0o700); assert.equal(modeOf(path.join(state,'file')),0o600); assert.equal(modeOf(path.dirname(state)),0o755);
    // A file created after the helper returns is already 0600, so the helper's
    // chmod of existing files is not what made it private.
    fs.chmodSync(state,0o755); r=run(state); assert.equal(r.status,0,r.stderr); assert.equal(modeOf(state),0o700);
    const prior=path.join(state,'clock-hidden'), outside=path.join(dir,'outside');
    fs.writeFileSync(prior,'{"birthYear":1990,"lifeExpectancy":80}\n'); fs.chmodSync(prior,0o644); fs.chmodSync(state,0o755);
    fs.writeFileSync(outside,'secret\n'); fs.chmodSync(outside,0o644); fs.symlinkSync(outside,path.join(state,'linked'));
    r=run(state); assert.equal(r.status,0,r.stderr);
    assert.equal(modeOf(state),0o700); assert.equal(modeOf(prior),0o600);
    assert.equal(fs.readFileSync(prior,'utf8'),'{"birthYear":1990,"lifeExpectancy":80}\n');
    assert.equal(modeOf(outside),0o644);
    fs.writeFileSync(path.join(dir,'blocked'),''); r=run(path.join(dir,'blocked/familiar-dock'));
    assert.equal(r.status,1); assert(!r.stdout.includes('went on'));
    // Mode at the mkdir syscall, before chmod: a new directory is 0700, not
    // 0755 with a later chmod. The parent stays the user's umask.
    const bin=path.join(dir,'bin'), modes=path.join(dir,'mkdir-modes'); fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin,'mkdir'),`#!/bin/bash
/usr/bin/mkdir "$@"
st=$?
last=""
for arg in "$@"; do last=$arg; done
if [[ -n \${TEST_MKDIR_MODES:-} && -d \$last ]]; then stat -c %a -- "\$last" >> "\$TEST_MKDIR_MODES"; fi
exit $st
`); fs.chmodSync(path.join(bin,'mkdir'),0o755);
    const fresh=path.join(dir,'fresh/familiar-dock');
    const envMk={...process.env,PATH:`${bin}:${process.env.PATH}`,TEST_MKDIR_MODES:modes};
    r=spawnSync('bash',['-c','umask 022; state=$1; '+Lifecycle.privateState,'test',fresh],{env:envMk,encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);
    assert.equal(fs.readFileSync(modes,'utf8'),'755\n700\n');
    assert.equal(modeOf(fresh),0o700); assert.equal(modeOf(path.dirname(fresh)),0o755);
    // A cleanup that removes the directory between mkdir and chmod: the lock
    // starts over (and a cleanup waiter finds nothing left to do). A chmod
    // refused on a directory that is still there stops it.
    const once=path.join(dir,'once'), refuse=path.join(dir,'refuse');
    fs.writeFileSync(path.join(bin,'chmod'),`#!/bin/bash
[[ ! -e $TEST_REFUSE ]] || { echo 'chmod: operation not permitted' >&2; exit 1; }
if [[ ! -e $TEST_ONCE ]]; then : > "$TEST_ONCE"; rm -rf -- "\${@: -1}"; echo 'chmod: cannot access' >&2; exit 1; fi
exec /usr/bin/chmod "$@"
`); fs.chmodSync(path.join(bin,'chmod'),0o755);
    const env={...process.env,PATH:`${bin}:${process.env.PATH}`,TEST_ONCE:once,TEST_REFUSE:refuse};
    const locked=mode=>spawnSync('bash',['-c','umask 022; state=$1; mode=$2\n'+Lifecycle.lock+'\necho locked','test',state,mode],{env,encoding:'utf8'});
    r=locked('hide'); assert.equal(r.status,0,r.stderr); assert.equal(r.stdout.trim(),'locked'); assert(fs.existsSync(once)); assert.equal(modeOf(state),0o700);
    fs.rmSync(once); r=locked('cleanup'); assert.equal(r.status,0,r.stderr); assert.equal(r.stdout,''); assert(!fs.existsSync(state));
    fs.mkdirSync(state); fs.writeFileSync(refuse,''); r=locked('hide'); assert.equal(r.status,1); assert.equal(r.stdout,'');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
  // Every script that makes the directory goes through privateState.
  const sources=[];
  const walk=d=>{ for(const e of fs.readdirSync(d,{withFileTypes:true})) {
    if(e.isDirectory()) { if(!['tests','docs','node_modules'].includes(e.name) && !e.name.startsWith('.')) walk(path.join(d,e.name)); }
    else if(/\.(js|qml)$/.test(e.name)) sources.push(path.join(d,e.name)); } };
  walk(root);
  for(const file of sources) if(!file.endsWith('services/Lifecycle.js')) assert(!/mkdir/.test(fs.readFileSync(file,'utf8')),path.relative(root,file)+' makes a directory without privateState');
  assert.match(fs.readFileSync(path.join(root,'services/Intellihide.qml'),'utf8'),/state=\$\(dirname "\$1"\); ' \+ Lifecycle\.privateState \+ '; printf/);
});
const Colors = library('services/IconColors.js');
test('WCAG channel conversion and contrast ratios have known endpoints', () => {
  assert.equal(Colors.luminance([0,0,0]),0);
  assert.equal(Colors.luminance([1,1,1]),1);
  assert.equal(Colors.contrast(0,1),21);
  assert.equal(Colors.contrast(0.2,0.2),1);
  assert(Math.abs(Colors.luminance(Colors.rgb('#808080')) - 0.21586) < 0.00001);
  assert.equal(Colors.rgb('not-a-color'),null);
});
test('silhouette extraction uses alpha threshold and four neighbours; dominant color is retained', () => {
  const pixels = Array(5*5*4).fill(0);
  for(let y=1;y<4;y++) for(let x=1;x<4;x++) pixels.splice((y*5+x)*4,4,255,0,0,128);
  let result=Colors.analyze(pixels,5,5);
  assert.equal(result.edges.length,8); assert.equal(result.dominant,'#ff0000');
  assert(result.edges.every(l=>l===Colors.luminance([1,0,0])));
  pixels[(2*5+2)*4+3]=127;
  assert.equal(Colors.analyze(pixels,5,5).edges.length,8);
  assert.throws(()=>Colors.analyze([0,0,0,0],1,1));
  deepEqual(Colors.grayscale([255,0,0,255]),[54,54,54,255]);
});
test('auto background rejects text failures, scores icons and breaks ties by bar then theme brightness', () => {
  let result=Colors.choose({bar:'#000000',lighter_background:'#eeeeee'},'#ffffff',[{edges:[0]}],true);
  assert.equal(result.best.role,'bar'); assert.equal(result.scores[1].eligible,false);
  result=Colors.choose({bar:'#222222',dark_background:'#000000'},'#ffffff',[{edges:[0.115]}],true);
  assert.equal(result.best.role,'dark_background');
  result=Colors.choose({bar:'#222222',dark_background:'#000000'},'#ffffff',[{edges:[1]}],true);
  assert.equal(result.best.role,'bar');
  result=Colors.choose({dark_background:'#111111',darker_background:'#000000'},'#ffffff',[],true);
  assert.equal(result.best.role,'darker_background');
  result=Colors.choose({background:'#dddddd',lighter_background:'#ffffff'},'#000000',[],false);
  assert.equal(result.best.role,'lighter_background');
  assert.equal(Colors.choose({bar:'#888888'},'#888888',[],true).best,null);
});
test('outline affects only failing icons and finds the minimum text-color alpha reaching 3:1', () => {
  assert.equal(Colors.legibility([0,1],'#000000'),0.5);
  assert.equal(Colors.outlineAlpha([0,1],'#000000','#ffffff'),0);
  assert.equal(Colors.outlineAlpha(null,'#000000','#ffffff'),0);
  const alpha=Colors.outlineAlpha([0,0,1],'#000000','#ffffff');
  assert(alpha>0 && alpha<1);
  assert(Colors.contrast(Colors.luminance([alpha,alpha,alpha]),0)>=3);
  assert(Colors.contrast(Colors.luminance([alpha-0.0001,alpha-0.0001,alpha-0.0001]),0)<3);
  assert.equal(Colors.outlineAlpha([0],'#000000','#111111'),0);
});
test('theme role settings are validated; every installed stock theme chooses text contrast >= 4.5', () => {
  assert.equal(defaults({'theme-bg-color':'unknown'})['theme-bg-color'],'auto');
  assert.equal(defaults({'theme-bg-color':'darker_background'})['theme-bg-color'],'darker_background');
  assert.equal(defaults()['icon-contrast-outline'],false);
  const rows=stockThemeTable();
  if(fs.existsSync('/usr/share/omarchy/themes')) assert(rows.length>=23);
  for(const row of rows) assert(row.textContrast>=4.5,`${row.theme}: ${row.textContrast}`);
  const tokyo=rows.find(row=>row.theme==='tokyo-night');
  if(tokyo) {assert.equal(tokyo.score,7); assert.equal(tokyo.barScore,6);}
});
test('IPC boolean strings reject invalid inputs and clock source distinguishes hidden', () => {
  const ipc = library('services/Ipc.js');
  for (const value of ['true','TRUE','1','on',' Yes ']) assert.equal(ipc.boolean(value),true);
  for (const value of ['false','FALSE','0','off',' No ']) assert.equal(ipc.boolean(value),false);
  for (const value of ['', 'truthy', '2', null]) assert.equal(ipc.boolean(value),null);
  const clock = library('services/ClockLogic.js');
  assert.equal(clock.source(false,false),'hidden'); assert.equal(clock.source(true,false),'hidden');
});
test('proximity filters visible workspaces, monitor, focused app and maximized geometry', () => {
  const P=library('services/Proximity.js');
  const rect={x:100,y:900,width:500,height:40}, context={monitor:'A',workspaces:[1,2]};
  const w={rect:{x:120,y:800,width:50,height:99},workspaceId:1,monitor:'A',appKey:'a',activated:true};
  assert(!P.near([w],rect,context,'ALL_WINDOWS',0,true));
  assert(P.near([w],rect,context,'ALL_WINDOWS',2,true));
  assert(!P.near([{...w,minimized:true}],rect,context,'ALL_WINDOWS',20,true));
  assert(!P.near([{...w,monitor:'B'}],rect,context,'ALL_WINDOWS',20,true));
  assert(!P.near([{...w,workspaceId:3}],rect,context,'ALL_WINDOWS',20,false));
  assert(!P.near([w],rect,context,'MAXIMIZED_WINDOWS',20,true));
  assert(P.near([{...w,maximized:true}],rect,context,'MAXIMIZED_WINDOWS',20,true));
  assert(!P.near([{...w,activated:false}],rect,context,'FOCUSED_WINDOWS',20,true));
  assert(P.near([w,{...w,appKey:'b',activated:false}],rect,context,'FOCUSED_WINDOWS',20,true));
});
test('intellihide state machine deadlines, popup hold, fullscreen, secondary and pointer release', () => {
  const H=library('services/Intellihide.js');
  const s=defaults({intellihide:true,'intellihide-enable-start-delay':0,'intellihide-close-delay':100,'intellihide-reveal-delay':50});
  const input={primary:false,fullscreen:false,overlap:true}; let st=H.initial(0);
  st=H.step(st,input,s,0); assert(st.shown); assert.equal(st.deadline,100);
  st=H.step(st,input,s,100); assert(!st.shown);
  st=H.step(st,{...input,popup:true},s,110); assert(!st.shown);
  st=H.step(st,{...input,popup:true},s,160); assert(st.shown);
  st=H.step(st,{...input,fullscreen:true},s,170); assert(!st.shown);
  st=H.step(st,input,{...s,'intellihide-only-secondary':true},180); assert(!st.shown);
  st=H.step(st,{...input,primary:true},{...s,'intellihide-only-secondary':true},181); assert(st.shown);
  st=H.step(st,{...input,held:true},s,200); assert(st.shown);
  st=H.step(st,{...input,fullscreen:true,held:true},{...s,'intellihide-show-in-fullscreen':true},210); assert(st.shown);
});
test('hover SIMPLE RIPPLE PLANK tuning follows the pointer as Dash to Panel does, and a click lands on the icon drawn there', () => {
  const H=library('panel/Hover.js'); let s=defaults({'animate-appicon-hover':true});
  const near=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
  // SIMPLE: only the hovered icon moves, wherever the pointer is.
  assert.equal(H.level(s,false,0,40),0); assert.equal(H.level(s,true,null,40),1);
  assert.equal(H.transform(s,1,40,1).travel,12); assert.equal(H.transform(s,0,40,1).zoom,1);
  assert.equal(H.stretch(s,10,40),0);
  s={...s,'animate-appicon-hover-animation-type':'PLANK'};
  // Extent 4 reaches two slots: full under the pointer, half a slot away, gone at two.
  assert.equal(H.level(s,false,0,40),1); near(H.level(s,false,40,40),0.5); assert.equal(H.level(s,false,-80,40),0);
  assert.equal(H.level(s,true,null,40),0,'off the taskbar nothing magnifies');
  assert.equal(H.transform(s,1,40,1).zoom,2); assert.equal(H.transform(s,0.5,40,1).zoom,1.5);
  // Upstream's spread: away from the pointer, zoom * d/(2+8d/reach), and
  // zoom * reach/10 for every icon beyond the reach, so those keep still.
  assert.equal(H.stretch(s,0,40),0);
  near(H.stretch(s,40,40),-2*40/6); near(H.stretch(s,-40,40),2*40/6);
  near(H.stretch(s,80,40),-16); assert.equal(H.stretch(s,200,40),-16); assert.equal(H.stretch(s,-500,40),16);
  for (let d=0; d<200; d+=5) assert(H.stretch(s,-(d+5),40)>=H.stretch(s,-d,40),'icons farther right never move less');
  const ripple={...s,'animate-appicon-hover-animation-type':'RIPPLE'};
  assert.equal(H.stretch(ripple,40,40),0,'RIPPLE magnifies in place');
  assert(H.level(ripple,false,40,40)>0);
  assert(H.transform(ripple,1,40,-1).rotation<0); assert(H.transform(ripple,1,40,1).rotation>0);
  const off={...s,'animate-appicon-hover':false};
  assert.equal(H.level(off,true,0,40),0); assert.equal(H.stretch(off,40,40),0); assert.equal(H.transform(off,1,40,1).zoom,1);
  assert.equal(H.limitOffset(-30,10,40,100),10);
  assert.equal(H.limitOffset(30,90,40,100),-10);
  assert.equal(H.limitOffset(8,50,40,100),8);
  // The spread moves whole buttons, and their pointer areas meet halfway
  // across the gaps it opens, so a click lands on the icon drawn there.
  const button=fs.readFileSync(path.join(root,'panel/AppButton.qml'),'utf8'), bar=fs.readFileSync(path.join(root,'panel/Taskbar.qml'),'utf8');
  assert.match(button,/\n    transform: Translate \{ x: root.vertical \? 0 : root.neighborPosition/);
  assert.match(button,/readonly property var reach: root.taskbar.hitReach\(root.slotIndex\)/);
  assert.doesNotMatch(button,/id: mouse\n\s*anchors.fill/);
  assert.match(bar,/HoverHandler \{ id: pointer \}/);
  assert.match(bar,/before = \(own.shift - previous.shift\) \/ 2 \+ \(own.growth - previous.growth\) \/ 4/);
  assert.match(bar,/after = \(next.shift - own.shift\) \/ 2 \+ \(own.growth - next.growth\) \/ 4/);
});
test('macOS-style Plank makes exactly the room its icons grow by, around the pointer, and widens the panel', () => {
  const H=library('panel/Hover.js');
  const near=(a,b,m)=>assert(Math.abs(a-b)<1e-9,`${m||''} ${a} != ${b}`);
  const s=defaults({'animate-appicon-hover':true,'animate-appicon-hover-animation-type':'PLANK','animate-appicon-hover-macos':true});
  const slots=[0,1,2,3].map(i=>({start:i*50,size:50,icon:30}));
  // Off unless Plank and the option are both on, and with no pointer.
  for (const off of [{...s,'animate-appicon-hover-macos':false},{...s,'animate-appicon-hover-animation-type':'RIPPLE'},{...s,'animate-appicon-hover':false}]) {
    assert(!H.macos(off)); const d=H.dock(off,slots,125); deepEqual([d.shift,d.growth,d.before,d.after],[[0,0,0,0],[0,0,0,0],0,0]);
  }
  assert(H.macos(s)); deepEqual(H.dock(s,slots,null).shift,[0,0,0,0]);
  // Over c's center: c doubles in place, b and d grow half as much, a not at
  // all, and every icon makes room for the growth between it and c.
  let d=H.dock(s,slots,125);
  deepEqual(d.growth,[0,15,30,15]); deepEqual(d.shift,[-30,-22.5,0,22.5]); near(d.before,30); near(d.after,30);
  const tiles=(d)=>{ for(let i=0;i+1<slots.length;i++) near(slots[i].start+slots[i].size+d.shift[i]+d.growth[i]/2, slots[i+1].start+d.shift[i+1]-d.growth[i+1]/2,'boxes meet'); };
  for (const p of [-20,0,10,49.9,50,63,99,100,140,150.1,199,200,230]) {
    d=H.dock(s,slots,p); tiles(d);
    near(d.before+d.after,d.growth.reduce((a,b)=>a+b,0),'the row grows by exactly its growth');
    assert(d.before>=-1e-9 && d.after>=-1e-9);
    // The spot under the pointer stays under it.
    const k=slots.findIndex(x=>p>=x.start && p<x.start+x.size);
    if (k>=0) { const at=slots[k].start+d.shift[k]-d.growth[k]/2, f=(p-slots[k].start)/slots[k].size; near(at+f*(slots[k].size+d.growth[k]),p,'pointer fixed at '+p); }
  }
  // It glides: moving the pointer a hair never jumps a box.
  for (let p=-10;p<210;p+=0.5) { const a=H.dock(s,slots,p), b=H.dock(s,slots,p+0.01); a.shift.forEach((x,i)=>assert(Math.abs(x-b.shift[i])<0.05,'continuous at '+p)); }
  // Off the row's ends the row grows away from the pointer only.
  near(H.dock(s,slots,-20).before,0); near(H.dock(s,slots,230).after,0);
  // A gap between slots (Show Apps a little apart) keeps its width.
  const gapped=[{start:-40,size:36,icon:30},...slots];
  d=H.dock(s,gapped,25);
  near((gapped[1].start+d.shift[1]-d.growth[1]/2)-(gapped[0].start+gapped[0].size+d.shift[0]+d.growth[0]/2),4,'gap kept');
  // The panel side: Show Apps joins when it touches the taskbar, the panel
  // widens with the row and its content stays put, elements outside step aside.
  const panel=fs.readFileSync(path.join(root,'panel/Panel.qml'),'utf8'), bar=fs.readFileSync(path.join(root,'panel/Taskbar.qml'),'utf8');
  assert.match(panel,/readonly property bool dockFits: dockMode && percent === -1/);
  assert.match(panel,/Math.abs\(a.start \+ a.length - t.start\) < 1\) return Object.assign\(row, \{side: "before"\}\)/);
  assert.match(panel,/panelHover.point.scenePosition.x\) - longMargins.start - alongPadding/);
  assert.match(panel,/root.longMargins.start - root.dockBefore\n/);
  assert.match(panel,/x: root.vertical \? root.acrossPadding : root.alongPadding \+ root.dockBefore/);
  for (const el of ['dateMenu','desktopButton','rightBox']) assert(panel.includes(`root.dockSlide("${el}")`),el);
  assert.match(bar,/var home = button.mapToItem\(null, face.x, face.y\), grab = press/);
});
test('vertical title span uses independent text metrics and height has no parent feedback', () => {
  const source=fs.readFileSync(path.join(root,'panel/AppButton.qml'),'utf8');
  assert.match(source,/labelLength:.*titleMetrics.advanceWidth/);
  assert.match(source,/TextMetrics \{ id: titleMetrics; font: title.font; text: title.text \}/);
  assert.match(source,/height: root.vertical \? root.labelLength \+ root.geometry.padding : implicitHeight/);
  assert(!source.includes('title.implicitWidth'));
  assert(!source.includes('body.height - y'));
});
test('preview and tooltip gaps clear maximum hover travel, zoom and rotation on every edge', () => {
  const H=library('panel/Hover.js'), G=library('panel/PopupGeometry.js');
  for (const type of ['SIMPLE','RIPPLE','PLANK']) {
    const settings=defaults({'animate-appicon-hover':true,'animate-appicon-hover-animation-type':type});
    const gap=H.clearance(settings,45,37,45);
    assert(gap>0);
    for (const weight of [0,0.25,0.5,0.75,1]) {
      const motion=H.transform(settings,1,45,1), zoom=1+(Math.max(1,motion.zoom)-1)*weight;
      const angle=(Math.abs(motion.rotation)*weight+10)*Math.PI/180;
      const extent=37*zoom*(Math.abs(Math.cos(angle))+Math.abs(Math.sin(angle)))/2+
        motion.travel*weight+37*(zoom-1)/2-45/2;
      assert(gap>=extent);
    }
    for(const edge of ['TOP','BOTTOM','LEFT','RIGHT']) {
      const p=G.position(edge,45,45,200,100,4+gap);
      if(edge==='TOP') assert(p.y>=45+gap+4);
      if(edge==='BOTTOM') assert(p.y+100<=-gap-4);
      if(edge==='LEFT') assert(p.x>=45+gap+4);
      if(edge==='RIGHT') assert(p.x+200<=-gap-4);
    }
  }
  assert.equal(H.clearance(defaults({'animate-appicon-hover':false}),45,37,45),0);
  deepEqual(G.position('BOTTOM',45,45,200,100,4),{x:-77.5,y:-104});
  assert.match(fs.readFileSync(path.join(root,'panel/PreviewPopup.qml'),'utf8'),/reserveHover: true/);
  for(const file of ['panel/PopupFrame.qml','panel/Tooltip.qml'])
    assert.match(fs.readFileSync(path.join(root,file),'utf8'),/Geometry.position.*root.hoverClearance/);
});
test('the panel takes hover, not clicks, through the open Settings overlay', () => {
  // Hyprland routes every pointer event to a surface holding exclusive
  // keyboard focus. Settings primes with Exclusive, then holds on demand.
  const source=name=>fs.readFileSync(path.join(root,name),'utf8');
  const window=source('settings/SettingsWindow.qml'),panel=source('panel/Panel.qml'),tray=source('panel/Tray.qml');
  assert.match(window,/shownKeyboardFocus: focusPrimed \? WlrKeyboardFocus\.OnDemand : WlrKeyboardFocus\.Exclusive/);
  assert.match(window,/onBackingWindowVisibleChanged: \{\s*focusPrimed = false\s*if \(backingWindowVisible\) focusPrime\.restart\(\)/);
  assert.match(window,/Timer \{ id: focusPrime; interval: 75; onTriggered: overlay\.focusPrimed = overlay\.shown \}/);
  // Only the panel's own input area is let through, where Hyprland put its
  // layer (asked, not assumed), shrunk to whole pixels; nothing until known.
  assert.match(window,/x: root\.hole\.x; y: root\.hole\.y; width: root\.hole\.width; height: root\.hole\.height/);
  assert.match(window,/var a = livePanel \? livePanel\.inputArea : null, o = panelOrigin\s*if \(!a \|\| !o\) return \{x: 0, y: 0, width: 0, height: 0\}/);
  assert.match(window,/Math\.max\(0, Math\.floor\(left \+ a\.width\) - x\)/);
  assert.match(window,/command: \["hyprctl", "layers", "-j"\]/);
  assert.match(window,/onPanelPlacementChanged: \{ panelOrigin = null; layerProbe\.again\(\) \}/);
  assert.match(window,/if \(asked !== root\.panelPlacement\) \{ again\(\); return \}/);
  assert.match(window,/event\.name === "openlayer" \|\| event\.name === "closelayer"/);
  assert.match(window,/livePanel\.hoverClearance \+ Commons\.Style\.space\(12\)/);
  // Every other screen gets a pointer catcher that never takes the keys.
  assert.match(window,/model: root\.opened \? Quickshell\.screens : \[\][\s\S]{0,400}modelData\.name !== overlay\.targetScreen\.name[\s\S]{0,300}WlrLayershell\.keyboardFocus: WlrKeyboardFocus\.None/);
  assert.match(panel,/readonly property var inputArea: !visible \|\| fullscreenBlocked \|\| !hide\.shown \? null\s*: Proximity\.clip\(/);
  // Clicks close Settings; hover-switching never does; no preview, desktop
  // peek or drag happens behind it.
  assert.match(panel,/objectName: "settings-click-guard"[\s\S]{0,80}anchors\.fill: parent\s*z: 1000\s*visible: root\.host\.settingsOpen\s*acceptedButtons: Qt\.AllButtons\s*onClicked: root\.host\.toggleSettings\(""\)/);
  const guard=panel.slice(panel.indexOf('objectName: "settings-click-guard"'));
  assert.doesNotMatch(guard.slice(0,guard.indexOf('}\n    }')),/hoverEnabled/);
  assert.match(panel,/clock\.opened \|\| host\.settingsOpen\) return/);
  assert.match(panel,/function fadeDesktop\(hovered\) \{[\s\S]{0,120}if \(hovered && host\.settingsOpen\) return/);
  assert.match(tray,/root\.panel\.popupOpen && !root\.panel\.host\.settingsOpen && slot\.modelData\.hasMenu/);
  assert.match(source('panel/AppButton.qml'),/id: reorderDrag[\s\S]{0,200}enabled: [^\n]*!root\.panelWindow\.host\.settingsOpen/);
  assert.match(source('panel/Taskbar.qml'),/function beginDrag\(button, press, point\) \{\s*if \(dragging \|\| config\.get\("taskbar-locked"\) \|\| panelWindow\.host\.settingsOpen\) return/);
  const P=library('services/Proximity.js');
  // Mid-slide the face reaches past its window; input stops at the window.
  deepEqual(P.clip({x:900,y:135,width:760,height:45},2560,180),{x:900,y:135,width:760,height:45});
  deepEqual(P.clip({x:0,y:-6,width:2560,height:45},2560,45),{x:0,y:0,width:2560,height:39});
  deepEqual(P.clip({x:-20,y:0,width:45,height:600},45,1440),{x:0,y:0,width:25,height:600});
  assert.equal(P.clip({x:0,y:45,width:2560,height:45},2560,45),null);
  // Hyprland's positions are global; a top bar's reservation moves a vertical panel down.
  const layers={'DP-3':{levels:{'0':[],'2':[{namespace:'omarchy-bar',x:2560,y:-200,w:1920,h:32},{namespace:'familiar-dock',x:2568,y:-168,w:45,h:1048},{namespace:'familiar-dock-reveal',x:2560,y:-168,w:2,h:1048}]}},'HDMI-A-1':{levels:{'2':[{namespace:'familiar-dock',x:0,y:1035,w:1920,h:45}]}}};
  deepEqual(P.layerOrigin(layers,'DP-3','familiar-dock',45,1048,{x:2560,y:-200}),{x:8,y:32});
  deepEqual(P.layerOrigin(layers,'HDMI-A-1','familiar-dock',1920,45,{x:0,y:0}),{x:0,y:1035});
  // A stale size, a missing monitor or junk never yields a place.
  assert.equal(P.layerOrigin(layers,'DP-3','familiar-dock',45,1080,{x:2560,y:-200}),null);
  assert.equal(P.layerOrigin(layers,'DP-1','familiar-dock',45,1048,{x:0,y:0}),null);
  for(const junk of [null,{},{'DP-3':{levels:null}},{'DP-3':{levels:{'2':'x'}}}]) assert.equal(P.layerOrigin(junk,'DP-3','familiar-dock',45,1048,{x:0,y:0}),null);
  const twice={'DP-3':{levels:{'2':[{namespace:'familiar-dock',x:0,y:0,w:45,h:45},{namespace:'familiar-dock',x:9,y:9,w:45,h:45}]}}};
  assert.equal(P.layerOrigin(twice,'DP-3','familiar-dock',45,45,{x:0,y:0}),null);
});
test('floating panel proximity uses actual screen origin, edge margins and vertical geometry', () => {
  const P=library('services/Proximity.js'), screen={x:2560,y:-200,width:1920,height:1080};
  deepEqual(P.panelRect(screen,'BOTTOM',1000,100,48,12),{x:2660,y:820,width:1000,height:48});
  deepEqual(P.panelRect(screen,'RIGHT',800,20,48,12),{x:4420,y:-180,width:48,height:800});
  deepEqual(P.panelRect(screen,'TOP',1000,100,48,12),{x:2660,y:-188,width:1000,height:48});
  deepEqual(P.panelRect(screen,'LEFT',800,20,48,12),{x:2572,y:-180,width:48,height:800});
});
test('coverage inventories each schema key once and review fixtures change only their own tab', () => {
  const schema=JSON.parse(fs.readFileSync(path.join(root,'tests/schema-keys.json')));
  const tabs=JSON.parse(fs.readFileSync(path.join(root,'tests/settings-tabs.json')));
  const rows=fs.readFileSync(path.join(root,'docs/settings-coverage.md'),'utf8').split('\n').filter(l=>l.startsWith('| `'));
  assert.equal(rows.length,247); assert.equal(new Set(rows.map(r=>r.split('`')[1])).size,247);
  for(const row of rows) {
    const key=row.split('`')[1]; assert(Object.hasOwn(schema,key));
    assert.match(row.split('|')[2].trim(),/^(Yes|Partial|No|Drop)/,key);
    assert.match(row.split('|')[3],/implemented|inert by design/,key);
  }
  for(const tab of ['Position','Style','Behavior','Action','Intellihide','Fine-Tune']) {
    const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/settings',tab+'.json')));
    const valid=defaults(fixture);
    for(const [key,value] of Object.entries(fixture)) {
      if (JSON.stringify(value)!==JSON.stringify(seed[key])) assert.equal(tabs[key],tab,`${tab}: outside-tab change ${key}`);
      deepEqual(valid[key],value,`${tab}: invalid fixture value ${key}`);
    }
    for(const key of Object.keys(seed)) assert(Object.hasOwn(fixture,key),`${tab}: missing seed ${key}`);
  }
});
test('all pinned schema keys including Drop are validated; inert values never create behavior', () => {
  const keys=JSON.parse(fs.readFileSync(path.join(root,'tests/schema-keys.json')));
  const settings=defaults(); for(const key of Object.keys(keys)) assert(Object.hasOwn(settings,key),key);
  assert.equal(defaults({'panel-size':'bad'})['panel-size'],48);
  assert.equal(defaults({'intellihide-use-pressure':'false'})['intellihide-use-pressure'],false);
});
test('review settings tool backs up once and restores exact bytes, including an absent original', () => {
  const home=fs.mkdtempSync(path.join(root,'tests/.settings-home-'));
  const file=path.join(home,'.config/omarchy/familiar-dock.json'); fs.mkdirSync(path.dirname(file),{recursive:true});
  const original='  {"private":true}\n\n'; fs.writeFileSync(file,original);
  const run=mode=>{const r=spawnSync('bash',[path.join(root,'tools/try-settings.sh'),mode],{env:{...process.env,HOME:home},encoding:'utf8'}); assert.equal(r.status,0,r.stderr)};
  try {
    const stateDir=path.join(home,'.local/state/familiar-dock');
    fs.mkdirSync(stateDir,{recursive:true}); fs.chmodSync(stateDir,0o755);
    const leftover=path.join(stateDir,'clock-hidden');
    fs.writeFileSync(leftover,'{"birthYear":1990}\n'); fs.chmodSync(leftover,0o644);
    run('Style');
    assert.equal(fs.statSync(stateDir).mode&0o777,0o700);
    assert.equal(fs.statSync(leftover).mode&0o777,0o600);
    assert.equal(fs.readFileSync(leftover,'utf8'),'{"birthYear":1990}\n');
    const backup=path.join(stateDir,'settings-under-test.bak');
    assert.equal(fs.statSync(backup).mode&0o777,0o600);
    assert.equal(fs.statSync(path.join(stateDir,'settings-test-active')).mode&0o777,0o600);
    assert.equal(fs.statSync(path.join(stateDir,'settings-test.lock')).mode&0o777,0o600);
    // A second run does not rewrite the backup; a mode an earlier run left open is still closed.
    fs.chmodSync(stateDir,0o755); fs.chmodSync(backup,0o644);
    const backupBytes=fs.readFileSync(backup);
    run('Behavior');
    assert.equal(fs.statSync(stateDir).mode&0o777,0o700);
    assert.equal(fs.statSync(backup).mode&0o777,0o600);
    assert.deepEqual(fs.readFileSync(backup),backupBytes);
    run('restore'); assert.equal(fs.readFileSync(file,'utf8'),original);
    assert(!fs.existsSync(backup));
    fs.unlinkSync(file); run('Position'); run('restore'); assert(!fs.existsSync(file));
    for(const tab of ['Position','Style','Behavior','Action','Intellihide','Fine-Tune']) {
      const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/settings',tab+'.json')));
      for(const [key,value] of Object.entries(seed)) assert(Object.hasOwn(fixture,key),`${tab}: ${key}`);
    }
  } finally { fs.rmSync(home,{recursive:true,force:true}) }
});
test('Unity monitor transcript parses typed fields and bounded incremental updates', () => {
  const B=library('services/Badges.js');
  const sample=fs.readFileSync(path.join(root,'tests/fixtures/unity-update.txt'),'utf8');
  const update=B.parse(sample); assert.equal(update.id,'org.gnome.Nautilus');
  deepEqual(update.fields,{count:7,'count-visible':true,progress:0.42,'progress-visible':true,urgent:false});
  const merged=B.merge(B.merge({},update),{id:update.id,fields:{'count-visible':false}});
  assert.equal(merged[update.id].count,7); assert.equal(merged[update.id]['count-visible'],false);
  assert.equal(B.parse(sample.replace('interface=com.canonical.Unity.LauncherEntry','interface=unrelated')),null);
  assert.equal(B.parse('x'.repeat(65537)),null);
  assert.equal(B.parse(sample.replace('double 0.42','double 4.2e-3')).fields.progress,0.0042);
  const special=B.merge({}, {id:'__proto__',fields:{count:1}}); assert.equal(special.__proto__.count,1);
  assert.equal(Object.getPrototypeOf(special),null);
});
test('badges off create no listener; progress is separately opt in', () => {
  const B=library('services/Badges.js'); assert(!B.enabled(defaults()));
  assert(B.enabled(defaults({'progress-show-bar':true})));
  const main=fs.readFileSync(path.join(root,'Main.qml'),'utf8');
  assert.match(main,/active: BadgeLogic.enabled\(pluginConfig.settings\)/);
  assert.match(main,/sourceComponent: Services.Badges/);
});
test('hotkeys and overlays off reject every binding path; source and secondary gates apply', () => {
  const H=library('services/Hotkeys.js'); let s=defaults();
  for(const modifier of ['', 'shift','ctrl','kp:ctrl']) assert.equal(H.activation(s,'1',modifier),null);
  assert(!H.overlay(s,true,true));
  s={...s,'hot-keys':true}; assert.equal(H.activation(s,'10','ctrl').index,9);
  assert.equal(H.activation(s,'0',''),null); assert.equal(H.activation(s,'1','invalid'),null);
  assert.equal(H.activation({...s,'shortcut-num-keys':'NUM_ROW'},'1','kp:'),null);
  assert(!H.overlay(s,false,true)); assert(H.overlay(s,true,true));
  assert(!H.overlay({...s,'hotkeys-overlay-combo':'NEVER'},true,true));
  assert(H.overlay({...s,'hotkeys-overlay-combo':'ALWAYS'},true,false));
  const main=fs.readFileSync(path.join(root,'Main.qml'),'utf8');
  for(const name of ['showOverlay','toggleIntellihide']) assert.match(main,new RegExp('function '+name+'\\(\\): void \\{\\s*if \\(!pluginConfig.get\\("hot-keys"\\)\\) return'));
});
test('hidden tray creates no tray service delegates or menus; blur has no runtime behavior', () => {
  const panel=fs.readFileSync(path.join(root,'panel/Panel.qml'),'utf8');
  assert.match(panel,/active: root.visible && root.elements.some/);
  assert.match(panel,/row.element === "rightBox" && row.visible/);
  assert.equal(seed['panel-element-positions']['*'].find(r=>r.element==='rightBox').visible,false);
  assert(!fs.existsSync(path.join(root,'services/Blur.qml')));
  assert.match(fs.readFileSync(path.join(root,'docs/blur.md'),'utf8'),/\^familiar-dock\$/);
});
test('detached removal cleanup restores owned clock, dock and exact opacity without plugin files', () => compositorFixture(f => {
  const Cleanup=library('services/Cleanup.js'), bin=f.env.PATH.split(':')[0];
  for(const [name,body] of [['sleep',':'],['omarchy','printf \'%s\\n\' "$*" >> "$TEST_CALLS"']]) {
    fs.writeFileSync(path.join(bin,name),'#!/bin/bash\n'+body+'\n'); fs.chmodSync(path.join(bin,name),0o755);
  }
  const config=path.join(f.home,'.config/omarchy/shell.json'); fs.mkdirSync(path.dirname(config),{recursive:true});
  fakeOmarchy(bin); f.env.TEST_SHELL_CONFIG=config;
  fs.writeFileSync(config,JSON.stringify({plugins:[],disabledPlugins:['omarchy.dock'],bar:{layout:{right:[]}}}));
  const state=path.join(f.home,'.local/state/familiar-dock'); fs.mkdirSync(state,{recursive:true});
  fs.writeFileSync(path.join(state,'dock-hidden'),'');
  fs.writeFileSync(path.join(state,'clock-hidden'),JSON.stringify({section:'right',index:0,entry:{id:'omarchy.clock',format:'HH:mm'}}));
  fs.writeFileSync(path.join(state,'intellihide-A.json'),'{}');
  let r=f.execute(F.script,[f.home,'init','owner','{}']); assert.equal(r.status,0,r.stderr);
  r=f.execute(F.script,[f.home,'step','owner','{"0xa":0.2}']); assert.equal(r.status,0,r.stderr);
  r=f.execute(Cleanup.script,[f.home]); assert.equal(r.status,0,r.stderr);
  assert(!fs.existsSync(state)); assert.match(f.read(),/plugin enable omarchy.dock/);
  assert.match(f.read(),/bar put omarchy.clock --section right --index 0/);
  assert.match(f.read(),/bar set omarchy.clock format "HH:mm" --json --from-section right/);
  assert.match(f.read(),/value = "0.6"/); assert.match(f.read(),/value = "0.35"/);
  deepEqual(JSON.parse(fs.readFileSync(config)).bar.layout.right,[{id:'omarchy.clock',format:'HH:mm'}]);
}));
test('cleanup keeps active fixture backup, preserves failed restoration and does nothing on hot reload', () => compositorFixture(f => {
  const Cleanup=library('services/Cleanup.js'), bin=f.env.PATH.split(':')[0];
  for(const [name,body] of [['sleep',':'],['omarchy','exit 1']]) {
    fs.writeFileSync(path.join(bin,name),'#!/bin/bash\n'+body+'\n'); fs.chmodSync(path.join(bin,name),0o755);
  }
  const config=path.join(f.home,'.config/omarchy/shell.json'); fs.mkdirSync(path.dirname(config),{recursive:true});
  const state=path.join(f.home,'.local/state/familiar-dock'); fs.mkdirSync(state,{recursive:true});
  fs.writeFileSync(path.join(state,'dock-hidden'),'');
  fs.writeFileSync(config,JSON.stringify({plugins:[{id:'rugobal.familiar-dock'}]}));
  let r=f.execute(Cleanup.script,[f.home]); assert.equal(r.status,0,r.stderr); assert(fs.existsSync(path.join(state,'dock-hidden')));
  fs.writeFileSync(config,JSON.stringify({plugins:[],disabledPlugins:['omarchy.dock']}));
  r=f.execute(Cleanup.script,[f.home]); assert.equal(r.status,1); assert(fs.existsSync(path.join(state,'dock-hidden')));
  fs.unlinkSync(path.join(state,'dock-hidden'));
  fs.writeFileSync(path.join(state,'settings-test-active'),''); fs.writeFileSync(path.join(state,'settings-under-test.bak'),'exact original');
  fs.writeFileSync(path.join(state,'intellihide-A.json'),'{}');
  r=f.execute(Cleanup.script,[f.home]); assert.equal(r.status,0,r.stderr);
  assert.equal(fs.readFileSync(path.join(state,'settings-under-test.bak'),'utf8'),'exact original');
  assert(!fs.existsSync(path.join(state,'intellihide-A.json')));
}));
test('drawer keybinding: a chosen key is bound when free or only Omarchy\'s, in the compositor only, once per change, and cleanup reloads it back', () => {
  const AK=library('services/AppsKey.js'), K=library('services/Chord.js');
  // Combinations: any spelling in, one canonical form out.
  assert.equal(K.canonical('super+tab'),'SUPER + TAB'); assert.equal(K.canonical('Alt + Super + space'),'SUPER + ALT + SPACE');
  assert.equal(K.canonical('ctrl+shift+meta+F12'),'SUPER + CTRL + SHIFT + F12'); assert.equal(K.canonical('SUPER + ENTER'),'SUPER + RETURN');
  assert.equal(K.canonical(''),'');
  for (const bad of ['TAB','SHIFT + A','SUPER + SUPER + A','SUPER + ESCAPE','SUPER + PRIOR','HYPER + A','SUPER +','SUPER + A + B',7,null]) assert.equal(K.canonical(bad),null,String(bad));
  deepEqual(K.caps('SUPER + ALT + SPACE'),['Super','Alt','Space']); deepEqual(K.caps('SUPER + SHIFT + COMMA'),['Super','Shift',',']);
  deepEqual(plain(C.validate({'show-apps-hotkey':'super+tab'}))['show-apps-hotkey'],'SUPER + TAB');
  assert.equal(C.validate({'show-apps-hotkey':'TAB'})['show-apps-hotkey'],'SUPER + ALT + SPACE');
  assert.equal(C.validate({'show-apps-hotkey':''})['show-apps-hotkey'],'');
  const F=library('settings/FormModel.js'), field=F.controls.find(c=>c.key==='show-apps-hotkey');
  assert.equal(field.type,'Hotkey'); assert(F.validValue(field,'SUPER + TAB')); assert(!F.validValue(field,'super+tab')); assert(F.validValue(field,''));
  // Recording from Qt key events: modifiers held, Backtab, and Shift, whose
  // symbols differ by layout: the digit row is read by its keycode, other symbols are refused.
  const Q={meta:0x10000000,ctrl:0x04000000,alt:0x08000000,shift:0x02000000};
  deepEqual(K.fromQt(0x01000001,Q.meta),{chord:'SUPER + TAB',reason:''});
  deepEqual(K.fromQt(0x01000002,Q.meta|Q.shift),{chord:'SUPER + SHIFT + TAB',reason:''});
  deepEqual(K.fromQt(0x20,Q.meta|Q.alt),{chord:'SUPER + ALT + SPACE',reason:''});
  deepEqual(K.fromQt(0x41,Q.ctrl|Q.alt),{chord:'CTRL + ALT + A',reason:''});
  deepEqual(K.fromQt(0x21,Q.meta|Q.shift,10),{chord:'SUPER + SHIFT + 1',reason:''}); // US Shift+1 is "!"
  deepEqual(K.fromQt(0x2f,Q.meta|Q.shift,16),{chord:'SUPER + SHIFT + 7',reason:''}); // German Shift+7 is "/", not Slash
  deepEqual(K.fromQt(0x31,Q.meta|Q.shift,10),{chord:'SUPER + SHIFT + 1',reason:''}); // AZERTY Shift+& is "1"
  deepEqual(K.fromQt(0x41,Q.meta|Q.shift,38),{chord:'SUPER + SHIFT + A',reason:''});
  deepEqual(K.fromQt(0x20,Q.meta|Q.shift,65),{chord:'SUPER + SHIFT + SPACE',reason:''});
  for (const [qt,code] of [[0x21,0],[0x3c,59],[0x22,48],[0x2f,61],[0x7c,51]]) assert.equal(K.fromQt(qt,Q.meta|Q.shift,code).reason,'unsupported',`shifted ${qt}`);
  deepEqual(K.fromQt(0x2f,Q.meta,61),{chord:'SUPER + SLASH',reason:''}); // without Shift the symbol is the key's name
  deepEqual(K.fromQt(0x01000032,Q.meta),{chord:'SUPER + F3',reason:''});
  assert.equal(K.fromQt(0x01000022,Q.meta).reason,'modifier'); assert.equal(K.fromQt(0x01000053,Q.meta).reason,'modifier');
  assert.equal(K.fromQt(0x41,Q.shift).reason,'hold'); assert.equal(K.fromQt(0x41,0).reason,'hold');
  assert.equal(K.fromQt(0x01000016,Q.meta).reason,'unsupported'); // Page Up
  for (const [qt,mods] of [[0x01000001,Q.meta],[0x2e,Q.ctrl|Q.alt],[0x5d,Q.meta]]) { const c=K.fromQt(qt,mods).chord; assert.equal(K.canonical(c),c); }

  // Keycode bindings ("SUPER + code:10") are on the key at that place on a US keyboard.
  assert(K.matches({modmask:'64',key:'SUPER + code:10'},K.parse('SUPER + 1'))); assert(!K.matches({modmask:'64',key:'SUPER + code:10'},K.parse('SUPER + 2')));
  assert(K.matches({modmask:'72',key:'SUPER + ALT + code:34'},K.parse('SUPER + ALT + BRACKETLEFT')));
  assert.equal(K.ofRecord({modmask:'73',key:'SUPER + SHIFT + ALT + code:10'}),'SUPER + ALT + SHIFT + 1');
  assert.equal(K.ofRecord({modmask:'65',key:'SUPER + SHIFT + code:201'}),''); assert(!K.matches({modmask:'64',key:'SUPER + code:9'},K.parse('SUPER + 1')));
  deepEqual(plain(K.parse('super + code:24',true)),{mask:64,key:'Q'}); assert.equal(K.canonical('SUPER + code:10'),null); // the setting itself names keys
  const record=(modmask,key,description,submap='')=>`bindd\n\tmodmask: ${modmask}\n\tsubmap: ${submap}\n\tkey: ${key}\n\tkeycode: 0\n\tcatchall: false\n\tdescription: ${description}\n\tdispatcher: __lua\n\targ: 1\n`;
  const listing=(...extra)=>[record(8,'SPACE','Toggle dictation'),record(72,'R','Resize','resize'),record(64,'SPACE','Launcher'),...extra].join('\n');
  deepEqual(AK.parse(record(72,'SPACE','Apps')),[{flags:'d',modmask:'72',submap:'',key:'SPACE',keycode:'0',catchall:'false',description:'Apps',dispatcher:'__lua',arg:'1'}]);
  const omarchyApps=[{file:'/o/default/hypr/bindings/utilities.lua',strings:['SUPER + ALT + SPACE','Apps','omarchy-shell omarchy.dock apps']}];
  const omarchyTab=[{file:'/o/tiling.lua',strings:['SUPER + TAB','Next workspace']}];
  const def='SUPER + ALT + SPACE', tab='SUPER + TAB';
  const state=(text,chord=def,userFile='',owned=omarchyApps)=>AK.state(AK.parse(text),chord,userFile,owned);
  assert.equal(state(listing(record(72,'SPACE','Apps'))),'omarchy');
  assert.equal(state(listing(record(72,'SUPER + ALT + SPACE','Apps'))),'omarchy'); // Lua binds may report the whole chord
  assert.equal(state(listing(record(72,'space','Apps'))),'omarchy'); // key names are not case-sensitive
  assert.equal(state(listing(record(72,'SPACE','Apps (Familiar Dock)'))),'plugin');
  assert.equal(state(listing(record(72,'SPACE','Apps (Familiar Dock)'),record(72,'SPACE','Mine','resize'))),'plugin'); // a reload gives it back safely
  assert.equal(state(listing(record(72,'SPACE','My launcher'))),'custom');
  assert.equal(state(listing(record(72,'SPACE','Apps'),record(72,'SPACE','My launcher'))),'custom'); // unbinding would drop the user's too
  assert.equal(state(listing(record(72,'SPACE','Apps'),record(72,'SPACE','Apps'))),'custom'); // a second Apps is not Omarchy's
  assert.equal(state(listing(record(72,'SPACE','Apps'),record(72,'SPACE','Mine','resize'))),'custom'); // hl.unbind clears every submap
  assert.equal(state(listing(record(72,'SPACE','Apps','resize'))),'custom');
  assert.equal(state(listing(record(72,'SPACE','Apps')),def,'/home/u/.config/hypr/bindings.lua'),'custom'); // the user's file names the chord
  assert.equal(state(listing(record(72,'SPACE','Apps')),def,'',[]),'custom'); // no Omarchy line names it
  assert.equal(state(listing()),'none'); assert.equal(state(''),'none');
  // Another key: Omarchy's own binding on it is taken over, the user's never.
  assert.equal(state(listing(record(64,'TAB','Next workspace')),tab,'',omarchyTab),'omarchy');
  assert.equal(state(listing(record(64,'TAB','Altscape: next window')),tab,'',omarchyTab),'custom');
  assert.equal(state(listing(record(64,'TAB','Next workspace')),tab,'/h/.config/hypr/hyprland.lua',omarchyTab),'custom');
  assert.equal(state(listing(record(65,'TAB','Next workspace')),tab,'',omarchyTab),'none'); // Super+Shift+Tab is another key
  // Keycode bindings are bindings: Omarchy's workspace keys are generated, so no line of its names them.
  assert.equal(state(listing(record(64,'SUPER + code:10','Switch to workspace 1')),'SUPER + 1','',[]),'custom');
  assert.equal(state(listing(record(72,'SUPER + ALT + code:34','Pick')),'SUPER + ALT + BRACKETLEFT','',[{file:'/o/a.lua',strings:['SUPER + ALT + code:34','Pick']}]),'omarchy');
  // Omarchy binds some keys twice: both of its lines count.
  const altTab=[{file:'/o/t.lua',strings:['ALT + TAB','Focus on next window']},{file:'/o/t.lua',strings:['ALT + TAB','Reveal active window on top']}];
  const twice=listing(record(8,'TAB','Focus on next window'),record(8,'TAB','Reveal active window on top'));
  assert.equal(AK.state(AK.parse(twice),'ALT + TAB','',altTab),'omarchy');
  assert.equal(AK.state(AK.parse(twice),'ALT + TAB','',altTab.slice(0,1)),'custom');
  // Where the plugin's binding is now, whatever key is wanted.
  assert.equal(AK.pluginKey(AK.parse(listing(record(64,'TAB','Apps (Familiar Dock)')))),'SUPER + TAB');
  assert.equal(AK.pluginKey(AK.parse(listing())),'');
  const seen=(state,plugin='')=>({state,plugin});
  const states=['omarchy','plugin','custom','none','unknown'];
  deepEqual(states.map(s=>AK.action(def,seen(s,s==='plugin'?def:''),false)),['take','none','none','none','none']); // the default key stays unbound when Omarchy's is off
  deepEqual(states.map(s=>AK.action(tab,seen(s,s==='plugin'?tab:''),false)),['take','none','none','take','none']); // a chosen key is bound when free
  deepEqual(states.map(s=>AK.action('',seen(s,s==='plugin'?def:''),false)),['none','restore','none','none','none']);
  deepEqual(states.map(s=>AK.action('',seen(s,s==='plugin'?def:''),true)),['none','none','none','none','none']); // a reload that kept it is not retried
  assert.equal(AK.action(tab,seen('omarchy',def),false),'restore'); // the old key goes back first
  assert.equal(AK.action(tab,seen('omarchy',def),true),'none');
  // Probe output: listing, the user's lines, Omarchy's lines.
  const out=(binds,user='',omarchy='')=>binds+'\n'+AK.marker+'\n'+user+AK.omarchyMarker+'\n'+omarchy;
  const omarchyText='/o/default/hypr/bindings/utilities.lua\to.bind("SUPER + ALT + SPACE", "Apps", "omarchy-shell omarchy.dock apps")\n/o/default/hypr/bindings/tiling.lua\to.bind("SUPER + TAB", "Next workspace", hl.dsp.focus({ workspace = "m+1" }))\n';
  deepEqual(AK.probe(out(listing(record(72,'SPACE','Apps')),'',omarchyText),def),{state:'omarchy',plugin:'',userFile:'',holder:'Apps',spellings:[]});
  deepEqual(AK.probe(out(listing(record(72,'SPACE','Apps')),'/h/.config/hypr/b.lua\to.bind("SUPER + ALT + SPACE", "Mine", "x")\n/h/.config/hypr/c.lua\thl.unbind("super+alt+space")\n',omarchyText),def),{state:'custom',plugin:'',userFile:'/h/.config/hypr/b.lua',holder:'Apps',spellings:[]});
  deepEqual(AK.probe(out(listing(record(64,'TAB','Next workspace'),record(72,'SPACE','Apps (Familiar Dock)')),'',omarchyText),tab),{state:'omarchy',plugin:def,userFile:'',holder:'Next workspace',spellings:[]});
  deepEqual(AK.probe(out(listing(record(64,'TAB','Altscape: next window')),"/h/.config/hypr/hyprland.lua\t  o.bind('SUPER + TAB', 'Altscape: next window', x)\n",omarchyText),tab),{state:'custom',plugin:'',userFile:'/h/.config/hypr/hyprland.lua',holder:'Altscape: next window',spellings:[]});
  deepEqual(AK.probe(out(listing(),'/h/x.lua\to.bind("SUPER + SHIFT + TAB", "Prev", x)\n',''),tab),{state:'none',plugin:'',userFile:'',holder:'',spellings:[]}); // near misses do not count
  assert.equal(AK.take(tab),'hl.unbind("SUPER + TAB"); hl.bind("SUPER + TAB", hl.dsp.exec_cmd("omarchy-shell rugobal.familiar-dock showApps || omarchy-shell omarchy.dock apps"), { description = "Apps (Familiar Dock)" })');
  // hl.unbind finds a binding by its words in their order: each spelling on the key is unbound, then the canonical one.
  const theme='SUPER + CTRL + SHIFT + SPACE', themeText='/o/default/hypr/bindings/utilities.lua\to.bind("SUPER + SHIFT + CTRL + SPACE", "Theme menu", x)\n';
  const themed=AK.probe(out(listing(record(69,'SUPER + SHIFT + CTRL + SPACE','Theme menu'),record(69,'SUPER + SHIFT + CTRL + SPACE','Theme menu','resize')),'',themeText),theme);
  deepEqual(themed,{state:'custom',plugin:'',userFile:'',holder:'Theme menu',spellings:['SUPER + SHIFT + CTRL + SPACE']}); // one spelling, listed once
  const theming=AK.probe(out(listing(record(69,'SUPER + SHIFT + CTRL + SPACE','Theme menu'),record(69,'SPACE','Odd')),'',themeText),theme);
  deepEqual(theming.spellings,['SUPER + SHIFT + CTRL + SPACE']); // a key that is not the whole chord is no spelling
  deepEqual(AK.probe(out(listing(record(69,'SUPER + SHIFT + CTRL + SPACE','Theme menu')),'',themeText),theme),{state:'omarchy',plugin:'',userFile:'',holder:'Theme menu',spellings:['SUPER + SHIFT + CTRL + SPACE']});
  assert.equal(AK.take(theme,['SUPER + SHIFT + CTRL + SPACE',theme]),'hl.unbind("SUPER + SHIFT + CTRL + SPACE"); hl.unbind("SUPER + CTRL + SHIFT + SPACE"); hl.bind("SUPER + CTRL + SHIFT + SPACE", hl.dsp.exec_cmd("omarchy-shell rugobal.familiar-dock showApps || omarchy-shell omarchy.dock apps"), { description = "Apps (Familiar Dock)" })');
  deepEqual(AK.probe(out(listing(record(64,'SUPER + code:10','Switch to workspace 1')),'',''),'SUPER + 1').spellings,['SUPER + code:10']);
  const luaRun=code=>spawnSync('lua',['-e',code],{encoding:'utf8'});
  const fake=`local log={} hl={unbind=function(k) log[#log+1]="unbind "..k end, bind=function(k,d,o) log[#log+1]="bind "..k.." "..tostring(d).." "..o.description..(o.non_consuming and " pass" or "") end, dsp={exec_cmd=function(c) return "exec:"..c end, submap=function(n) return "submap:"..n end}, dispatch=function(d) log[#log+1]="dispatch "..d end, define_submap=function(n,f) log[#log+1]="define "..n; f(); log[#log+1]="end" end, get_current_submap=function() return CURRENT end}`;
  const lua=luaRun(`${fake} ${AK.take(def)} print(table.concat(log,"|"))`);
  if (!lua.error) {
    assert.equal(lua.status,0,lua.stderr); assert.equal(lua.stdout.trim(),'unbind SUPER + ALT + SPACE|bind SUPER + ALT + SPACE exec:omarchy-shell rugobal.familiar-dock showApps || omarchy-shell omarchy.dock apps Apps (Familiar Dock)');
    // Recording: the submap is defined once per configuration, then entered; Escape leaves it and still reaches Settings.
    assert.equal(luaRun(`${fake} ${AK.pause(false)} print(table.concat(log,"|"))`).stdout.trim(),'define familiar-dock-record|bind ESCAPE submap:reset Stop recording (Familiar Dock) pass|end|dispatch submap:familiar-dock-record');
    assert.equal(luaRun(`${fake} ${AK.pause(true)} print(table.concat(log,"|"))`).stdout.trim(),'dispatch submap:familiar-dock-record');
    assert.equal(luaRun(`CURRENT="familiar-dock-record" ${fake} ${AK.resumeExpression} print(table.concat(log,"|"))`).stdout.trim(),'dispatch submap:reset');
    assert.equal(luaRun(`CURRENT="resize" ${fake} ${AK.resumeExpression} print(table.concat(log,"|"))`).stdout.trim(),''); // another submap is left as it is
  }
  const dir=fs.mkdtempSync(path.join(root,'tests/.apps-key-'));
  try {
    const bin=path.join(dir,'bin'), home=path.join(dir,'home'), calls=path.join(dir,'calls'), binds=path.join(dir,'binds'), omarchy=path.join(dir,'omarchy');
    const cfg=path.join(home,'.config/omarchy/shell.json'); fs.mkdirSync(bin); fs.mkdirSync(path.dirname(cfg),{recursive:true});
    fs.writeFileSync(path.join(bin,'hyprctl'),'#!/bin/bash\nif [[ $1 == binds ]]; then cat "$TEST_BINDS"; else printf "%s\\n" "$*" >> "$TEST_CALLS"; fi\n');
    fs.writeFileSync(path.join(bin,'sleep'),'#!/bin/sh\nexit 0\n');
    for (const name of ['omarchy','omarchy-shell']) fs.writeFileSync(path.join(bin,name),'#!/bin/sh\nexit 1\n');
    for (const name of ['hyprctl','sleep','omarchy','omarchy-shell']) fs.chmodSync(path.join(bin,name),0o755);
    const run=()=>{ const r=spawnSync('bash',['-c',Cleanup.script,'test',home],{env:{...process.env,PATH:`${bin}:${process.env.PATH}`,TEST_CALLS:calls,TEST_BINDS:binds},encoding:'utf8'}); assert.equal(r.status,0,r.stderr); };
    const read=()=>fs.existsSync(calls)?fs.readFileSync(calls,'utf8'):'';
    fs.writeFileSync(binds,listing(record(64,'TAB','Apps (Familiar Dock)')));
    fs.writeFileSync(cfg,JSON.stringify({plugins:[{id:'rugobal.familiar-dock'}]})); run(); assert.equal(read(),''); // shell restart: still enabled
    fs.writeFileSync(cfg,JSON.stringify({plugins:[{id:'rugobal.familiar-dock'}],disabledPlugins:['rugobal.familiar-dock']})); run();
    // The drawer click's kept functions are let go on every removal.
    const forget=`eval ${library('services/DrawerClick.js').forget}\n`;
    assert.equal(read(),'reload config-only\n'+forget); assert(!fs.existsSync(path.join(home,'.local/state/familiar-dock'))); // needs no state directory
    fs.writeFileSync(calls,''); fs.writeFileSync(binds,listing(record(72,'SPACE','Apps'))); run(); assert.equal(read(),forget); // not ours
    // The recording submap outlives a drawer key turned off, and goes with a reload.
    fs.writeFileSync(calls,''); fs.writeFileSync(binds,listing(record(0,'ESCAPE','Stop recording (Familiar Dock)','familiar-dock-record'))); run();
    assert.equal(read(),'reload config-only\n'+forget);
    fs.writeFileSync(calls,''); fs.rmSync(binds); run(); assert.equal(read(),forget); // no compositor
    // The probe lists the bindings, then the user's and Omarchy's lines that quote a combination.
    const hypr=path.join(home,'.config/hypr'); fs.mkdirSync(path.join(hypr,'extra'),{recursive:true});
    fs.mkdirSync(path.join(omarchy,'default/hypr/bindings'),{recursive:true});
    fs.writeFileSync(path.join(omarchy,'default/hypr/bindings/utilities.lua'),'o.bind("SUPER + ALT + SPACE", "Apps", "omarchy-shell omarchy.dock apps")\n-- o.bind("SUPER + TAB", "Old", x)\n');
    fs.writeFileSync(path.join(omarchy,'default/hypr/bindings/tiling.lua'),'o.bind("SUPER + TAB", "Next workspace", hl.dsp.focus({ workspace = "m+1" }))\n');
    fs.writeFileSync(binds,listing(record(72,'SPACE','Apps'),record(64,'TAB','Next workspace')));
    const probe=chord=>{ const r=spawnSync('bash',['-c',AK.probeScript,'test'],{env:{...process.env,HOME:home,OMARCHY_PATH:omarchy,PATH:`${bin}:${process.env.PATH}`,TEST_BINDS:binds},encoding:'utf8'}); assert.equal(r.status,0,r.stderr); return AK.probe(r.stdout,chord); };
    fs.writeFileSync(path.join(hypr,'bindings.lua'),'o.bind("SUPER + SPACE", "Alternative launcher", "walker")\n-- alt-tab and space\n-- o.bind("SUPER + ALT + SPACE", "Apps", "walker")\n');
    fs.writeFileSync(path.join(hypr,'bindings.lua.bak.1'),'o.bind("SUPER + ALT + SPACE", "Apps", "walker")\n');
    deepEqual(probe(def),{state:'omarchy',plugin:'',userFile:'',holder:'Apps',spellings:[]}); // near misses, comments and backups do not count
    deepEqual(probe(tab),{state:'omarchy',plugin:'',userFile:'',holder:'Next workspace',spellings:[]});
    fs.writeFileSync(path.join(hypr,'extra','keys.lua'),'o.rebind("super + alt + space", "Apps", "walker")\n');
    deepEqual(probe(def),{state:'custom',plugin:'',userFile:path.join(hypr,'extra','keys.lua'),holder:'Apps',spellings:[]});
    deepEqual(probe(tab).state,'omarchy');
    fs.rmSync(hypr,{recursive:true}); deepEqual(probe(def),{state:'omarchy',plugin:'',userFile:'',holder:'Apps',spellings:[]}); // no ~/.config/hypr at all
    fs.rmSync(omarchy,{recursive:true}); deepEqual(probe(def).state,'custom'); // nothing says it is Omarchy's
    fs.rmSync(binds); assert.equal(spawnSync('bash',['-c',AK.probeScript,'test'],{env:{...process.env,HOME:home,PATH:`${bin}:${process.env.PATH}`,TEST_BINDS:binds}}).status,1);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
  const qml=fs.readFileSync(path.join(root,'services/AppsKey.qml'),'utf8');
  assert.match(qml,/\["hyprctl", "eval", Logic\.take\(chord, seen\.spellings\)\]/); assert.match(qml,/\["hyprctl", "reload", "config-only"\]/);
  assert.match(qml,/command: \["bash", "-c", Logic\.probeScript/); assert.match(qml,/config\.get\("show-apps-hotkey"\)/);
  // Each reload makes a listing in flight stale; each change of key reloads at most once.
  assert.match(qml,/if \(event\.name !== "configreloaded"\) return\s+root\.generation\+\+/);
  assert.match(qml,/probe\.generation = generation/); assert.match(qml,/if \(generation !== root\.generation \|\| chord !== root\.wanted\) \{ root\.again = true; Qt\.callLater\(root\.settled\); return \}/);
  assert.match(qml,/Logic\.action\(chord, seen, root\.restoreTried\)/); assert.match(qml,/if \(next === "restore"\) root\.restoreTried = true/);
  assert.match(qml,/onWantedChanged: \{\s+restoreTried = false/);
  // Recording never leaves Hyprland's bindings paused: a reload, the submap changing or the plugin going away resumes them.
  assert.match(qml,/if \(root\.paused\) \{ root\.paused = false; root\.send\(Logic\.resumeExpression\) \}/);
  assert.match(qml,/if \(event\.data === Logic\.recordSubmap\) \{ if \(!root\.paused\) root\.send\(Logic\.resumeExpression\) \}\s+else if \(root\.paused\) root\.paused = false/);
  assert.match(qml,/Component\.onDestruction: if \(paused \|\| queue\.length \|\| submapCall\.running\)\s+Quickshell\.execDetached\(\["bash", "-c", 'hyprctl eval "\$1"; sleep 1; hyprctl eval "\$1"', "familiar-dock-resume", Logic\.resumeExpression\]\)/);
  // Pause and resume run one at a time, in order, so a resume never lands before its pause.
  assert.match(qml,/function next\(\) \{\s+if \(submapCall\.running \|\| !queue\.length\) return/); assert.match(qml,/onExited: Qt\.callLater\(root\.next\)/);
  assert.equal((qml.match(/execDetached/g)||[]).length,1,'only going away runs detached');
  const recorder=fs.readFileSync(path.join(root,'settings/HotkeyField.qml'),'utf8');
  assert.match(recorder,/Timer \{ id: stopTimer; interval: 10000; onTriggered: root\.stop\(\) \}/);
  assert.match(recorder,/onActiveFocusChanged: if \(!activeFocus && root\.armed\) root\.stop\(\)/);
  assert.match(recorder,/Component\.onDestruction: if \(armed && service\) service\.resume\(\)/);
  assert.match(recorder,/Chord\.fromQt\(event\.key, event\.modifiers, event\.nativeScanCode\)/);
  const main=fs.readFileSync(path.join(root,'Main.qml'),'utf8');
  assert.match(main,/Services\.AppsKey \{ id: appsKey; config: pluginConfig \}/); assert.match(main,/appsKey: appsKey\.status/); assert.match(main,/readonly property var appsKeyService: appsKey/);
  const sources=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?sources(path.join(dir,e.name)):/\.(qml|js)$/.test(e.name)?[path.join(dir,e.name)]:[]);
  // Only the probe reads the user's Hyprland files, and it cannot write anything.
  for (const file of ['Main.qml',...['panel','services','settings'].flatMap(sources)].filter(f=>f!==path.join('services','AppsKey.js'))) assert(!/\.config\/hypr|hypr\/bindings/.test(fs.readFileSync(path.join(root,file),'utf8')),`${file} must not touch Hyprland files`);
  assert(!/>|\bsed\b|\btee\b|\bmv\b|\bcp\b|\brm\b|\btouch\b|-delete|-exec(?! awk)/.test(AK.probeScript.replace(/2>\/dev\/null/g,'')),'the probe only reads');
});
test('drawer icon click: the drawer, an app, a command, or what a key does now, by running the functions Hyprland runs for it', () => {
  const DC=library('services/DrawerClick.js'), AK=library('services/AppsKey.js'), F=library('settings/FormModel.js'), M=library('panel/MenuModel.js');
  // The stored form keeps every field, in one order; anything else falls back.
  deepEqual(plain(DC.normalize(undefined)),{action:'drawer',app:'',keybinding:'',command:''});
  deepEqual(plain(DC.normalize({action:'keybinding',keybinding:'super+space',app:' org.telegram.desktop ',command:'echo hi'})),{action:'keybinding',app:'org.telegram.desktop',keybinding:'SUPER + SPACE',command:'echo hi'}); // an id may end in .desktop
  deepEqual(plain(DC.appIds('firefox.desktop')),['firefox.desktop','firefox']); deepEqual(plain(DC.appIds('firefox')),['firefox']); deepEqual(plain(DC.appIds('.desktop')),['.desktop']);
  deepEqual(plain(DC.normalize({action:'launch',app:'a/b',keybinding:'TAB',command:7})),{action:'drawer',app:'',keybinding:'',command:''});
  deepEqual(plain(DC.normalize([1])),plain(DC.defaults)); assert.equal(DC.normalize({command:'x'.repeat(4097)}).command,'');
  deepEqual(plain(C.validate({'show-apps-click':{action:'app',app:'org.gnome.Nautilus'}})['show-apps-click']),{action:'app',app:'org.gnome.Nautilus',keybinding:'',command:''});
  deepEqual(plain(C.validate({'show-apps-click':'app'})['show-apps-click']),plain(DC.defaults));
  // What a click does: an action with nothing picked opens the drawer.
  deepEqual(plain(DC.plan({action:'app',app:'firefox'})),{kind:'app',target:'firefox'});
  deepEqual(plain(DC.plan({action:'keybinding',keybinding:'SUPER + SPACE'})),{kind:'keybinding',target:'SUPER + SPACE'});
  deepEqual(plain(DC.plan({action:'command',command:'  '})),{kind:'drawer',target:'',unset:true});
  deepEqual(plain(DC.plan({action:'drawer',app:'firefox'})),{kind:'drawer',target:'',unset:false});
  // Settings: one row of its own kind; what is kept for the other actions is no change.
  const field=F.controls.find(c=>c.key==='show-apps-click');
  assert.equal(field.type,'DrawerClick'); assert.equal(field.tab,'Position'); assert.equal(field.group,'Show Applications');
  assert(F.validValue(field,plain(DC.normalize({action:'command',command:'ls'})))); assert(!F.validValue(field,{action:'command',command:'ls'}));
  const settings=v=>C.validate({'show-apps-click':v});
  assert(!F.changed(settings({action:'drawer',command:'kept'}),field,'*','DP-3')); assert(F.changed(settings({action:'app'}),field,'*','DP-3')); // an action, even with nothing picked yet
  assert(F.changed(settings({action:'command',command:'ls'}),field,'*','DP-3'));
  deepEqual(plain(F.defaultValue(field,'*','DP-3')),plain(DC.defaults));
  const Nv=library('settings/Nav.js'); deepEqual(plain(Nv.overviewDrawerKeys),['show-apps-click','show-apps-hotkey']);
  // Right-click keeps the drawer when a click does something else.
  const t=k=>k, kinds=(v,kind='showAppsButton')=>M.panelRows(kind,settings(v),false,t,true).map(r=>r.kind);
  assert.equal(kinds({action:'app',app:'firefox'})[0],'drawer'); assert(!kinds({action:'drawer'}).includes('drawer')); assert(!kinds({action:'app'}).includes('drawer'));
  assert(!kinds({action:'app',app:'firefox'},'panel').includes('drawer'));

  const record=(modmask,key,description,{submap='',flags='d',arg='7',dispatcher='__lua'}={})=>`bind${flags}\n\tmodmask: ${modmask}\n\tsubmap: ${submap}\n\tkey: ${key}\n\tkeycode: 0\n\tcatchall: false\n\tdescription: ${description}\n\tdispatcher: ${dispatcher}\n\targ: ${arg}\n`;
  const records=AK.parse([record(64,'SUPER + SPACE','Launcher: example.cast',{arg:'316'}),record(72,'SUPER + ALT + SPACE','Apps (Familiar Dock)',{arg:'20'}),
    record(64,'SUPER + code:10','Switch to workspace 1',{arg:'30'}),record(8,'ALT + TAB','Focus on next window',{arg:'40'}),record(8,'ALT + TAB','Reveal active window on top',{arg:'41'}),
    record(64,'SUPER + R','Resize mode',{arg:'50',submap:'resize'}),record(64,'SUPER + B','Push to talk',{arg:'60'}),record(64,'SUPER + B','Push to talk released',{arg:'61',flags:'rd'}),
    record(0,'XF86AudioMute','Mute',{arg:'70'}),record(64,'mouse:272','Move window',{arg:'80',flags:'md'}),record(64,'SUPER + P','',{arg:'90',flags:''})].join('\n'));
  // The keys Settings offers, by what they do: not the plugin's own, a submap's, a nameless one or one no chord names.
  deepEqual(plain(DC.choices(records)),[
    {value:'ALT + TAB',label:'Focus on next window · Reveal active window on top',description:'Alt+Tab'},
    {value:'SUPER + SPACE',label:'Launcher: example.cast',description:'Super+Space'},
    {value:'SUPER + B',label:'Push to talk · Push to talk released',description:'Super+B'},
    {value:'SUPER + 1',label:'Switch to workspace 1',description:'Super+1'}]);
  assert.equal(DC.naming(DC.choices(records),'SUPER + SPACE'),'Launcher: example.cast'); assert.equal(DC.naming(DC.choices(records),'SUPER + X'),'');
  // What a click runs: the functions the key runs, outside submaps, on press.
  deepEqual(plain(DC.slots(DC.presses(records,'SUPER + SPACE'))),[316]);
  deepEqual(plain(DC.slots(DC.presses(records,'ALT + TAB'))),[40,41]); // the key runs both
  deepEqual(plain(DC.slots(DC.presses(records,'SUPER + B'))),[60]); // the press, not the release
  deepEqual(plain(DC.slots(DC.presses(records,'SUPER + 1'))),[30]); // a keycode binding
  deepEqual(plain(DC.slots(DC.presses(AK.parse(record(64,'SUPER + Y','Up',{flags:'rd',arg:'99'})),'SUPER + Y'))),[99]); // only a release: that one
  for (const chord of ['SUPER + ALT + SPACE','SUPER + R','SUPER + X','']) assert.equal(DC.slots(DC.presses(records,chord)),null,chord); // the drawer key, a submap's, none
  assert.equal(DC.slots(DC.presses(AK.parse(record(64,'SUPER + X','Thing',{dispatcher:'exec',arg:'x'})),'SUPER + X')),null); // not a Lua function
  // In Lua: the listing keeps the functions it saw, in the same request (no ";" for --batch);
  // a click runs a slot only while it holds that very function, each on its own.
  assert(!DC.keep.includes(';')); assert.equal(DC.listing,'binds ; eval '+DC.keep);
  assert(DC.kept('bind\n\tkey: A\n\n\nok\n')); assert(!DC.kept('bind\n\tkey: A\nerror: [string]:1: boom')); assert(!DC.kept(''));
  const luaRun=code=>spawnSync('lua',['-e',code],{encoding:'utf8'});
  const registry='local calls={} local reg={[316]=function() calls[#calls+1]="cast" end,[40]=function() calls[#calls+1]="next" end,[41]=function() calls[#calls+1]="reveal" end,[42]=function() error("broke") end,[7]=7,name="x"} debug={getregistry=function() return reg end}';
  const ran=(code,between='')=>luaRun(`${registry} ${DC.keep} ${between} local ok,err=pcall(function() ${code} end) io.write(table.concat(calls,"|"),"\t",ok and "ok" or tostring(err),"\t",tostring(${DC.keptName}))`).stdout.split('\t');
  if (!luaRun('').error) {
    deepEqual(ran(DC.expression([316])),['cast','ok','nil']); // and the kept functions are let go
    deepEqual(ran(DC.expression([40,41])),['next|reveal','ok','nil']);
    const gone=ran(DC.expression([40,999])); assert.equal(gone[0],''); assert.match(gone[1],/the binding changed/); // nothing ran
    assert.match(ran(DC.expression([7]))[1],/the binding changed/);
    // A reload between the listing and the click: same slots, other functions.
    const swapped=ran(DC.expression([40,41]),'reg[40], reg[41] = reg[41], reg[40]'); assert.equal(swapped[0],''); assert.match(swapped[1],/the binding changed/);
    const fresh=ran(DC.expression([316]),'reg[316] = function() calls[#calls+1]="other" end'); assert.equal(fresh[0],''); assert.match(fresh[1],/the binding changed/);
    const unkept=luaRun(`${registry} local ok,err=pcall(function() ${DC.expression([316])} end) io.write(table.concat(calls,"|"),"\t",tostring(err))`).stdout.split('\t');
    assert.equal(unkept[0],''); assert.match(unkept[1],/the binding changed/); // never listed: nothing runs
    // One that fails does not stop the rest.
    const broke=ran(DC.expression([42,40])); assert.equal(broke[0],'next'); assert.match(broke[1],/familiar-dock: .*broke/);
    assert.equal(ran(DC.forget)[2],'nil');
  }
  // The service lists at each click, runs in Hyprland's Lua state, and falls back to the drawer.
  const qml=fs.readFileSync(path.join(root,'services/DrawerClick.qml'),'utf8');
  assert.match(qml,/command: \["hyprctl", "--batch", Logic\.listing\]/);
  // A failed listing still lets the kept functions go before reporting.
  assert.match(qml,/if \(code !== 0 \|\| !Logic\.kept\(text\)\) \{[^}]*release\.running = true\s+root\.fail\(/);
  assert.match(qml,/id: release; command: \["hyprctl", "eval", Logic\.forget\]/);
  assert.match(qml,/if \(clickList\.running \|\| run\.running \|\| release\.running\) return/);
  assert.match(qml,/var slots = Logic\.slots\(Logic\.presses\(root\.take\(text\), chord\)\)[\s\S]*?run\.command = \["hyprctl", "eval", slots \? Logic\.expression\(slots\) : Logic\.forget\]\s+run\.running = true\s+if \(!slots\) root\.drawerWanted\(\)/);
  assert.match(qml,/var ids = id \? Logic\.appIds\(id\) : \[\]/);
  // The tooltip names no key bound to nothing now.
  assert.match(qml,/\|\| \(listed && !runs\(plan\.target\) \? "" : Chord\.caps\(plan\.target\)\.join\("\+"\)\)/);
  assert.match(qml,/if \(app\) actions\.launch\(\{desktopEntry: app\}\)\s+else drawerWanted\(\)/); assert.match(qml,/else if \(next\.kind === "command"\) actions\.command\(next\.target\)/);
  assert.match(qml,/if \(event\.name === "configreloaded"\) root\.refresh\(\)/); assert(!/execDetached/.test(qml));
  const main=fs.readFileSync(path.join(root,'Main.qml'),'utf8'), panel=fs.readFileSync(path.join(root,'panel/Panel.qml'),'utf8');
  assert.match(main,/Services\.DrawerClick \{ id: drawerClick; config: pluginConfig; actions: windowActions; onDrawerWanted: root\.showApps\(\) \}/);
  assert.match(main,/if \(drawerClick\.plan\.kind === "drawer"\) \{ showApps\(\); return \}/); assert.match(main,/drawerClick: drawerClick\.status/);
  assert.match(main,/function showApps\(\): void \{ root\.showApps\(\) \}/); // IPC, and so the drawer keybinding, still open the drawer
  assert.match(panel,/if \(element === "showAppsButton"\) host\.clickShowApps\(\)/); assert.match(panel,/row\.kind === "drawer"\) host\.showApps\(\)/);
  assert.match(fs.readFileSync(path.join(root,'panel/ShowAppsButton.qml'),'utf8'),/drawerClickService\.label\s+\|\| root\.strings\.t\("apps\.show"\)/);
});
function dockRaceFixture(run) {
  const dir=fs.mkdtempSync(path.join(root,'tests/.dock-race-'));
  const home=path.join(dir,'home'), bin=path.join(dir,'bin'), state=path.join(home,'.local/state/familiar-dock');
  const config=path.join(home,'.config/omarchy/shell.json'), calls=path.join(dir,'calls');
  fs.mkdirSync(bin); fs.mkdirSync(path.dirname(config),{recursive:true}); fs.mkdirSync(state,{recursive:true});
  fs.writeFileSync(path.join(state,'dock-hidden'),'');
  fs.writeFileSync(config,JSON.stringify({plugins:[],disabledPlugins:['omarchy.dock']}));
  fakeOmarchy(bin);
  fs.writeFileSync(path.join(bin,'hyprctl'),'#!/bin/sh\nexit 1\n'); fs.chmodSync(path.join(bin,'hyprctl'),0o755);
  // Only the startup grace period is skipped; retry backoff/CLI timeouts are real.
  fs.writeFileSync(path.join(bin,'sleep'),'#!/bin/bash\nif [[ $1 != 3 ]]; then exec /usr/bin/sleep "$@"; fi\n');
  fs.chmodSync(path.join(bin,'sleep'),0o755);
  const env={...process.env,HOME:home,PATH:`${bin}:${process.env.PATH}`,TEST_SHELL_CONFIG:config,TEST_CALLS:calls,
    RESTORE_SCRIPT:Cleanup.script,HIDE_SCRIPT:Dock.hideScript};
  const execute=(script,mode='')=>spawnSync('bash',['-c',script],{env:{...env,TEST_DOCK_MODE:mode},encoding:'utf8',timeout:40000});
  try { run({home,state,config,calls,execute}); }
  finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
test('embedded cleanup serializes simultaneous restorers and removes state once', () => dockRaceFixture(f => {
  const r=f.execute('bash -c "$RESTORE_SCRIPT" test "$HOME" & a=$!; bash -c "$RESTORE_SCRIPT" test "$HOME" & b=$!; wait "$a"; x=$?; wait "$b"; y=$?; test "$x$y" = 00');
  assert.equal(r.status,0,r.stderr); assert(!fs.existsSync(f.state));
  assert.equal(fs.readFileSync(f.calls,'utf8').trim(),'plugin enable omarchy.dock');
}));
test('embedded cleanup retries a failed enable with backoff', () => dockRaceFixture(f => {
  const r=f.execute('bash -c "$RESTORE_SCRIPT" test "$HOME"','first-fail');
  assert.equal(r.status,0,r.stderr); assert(!fs.existsSync(f.state));
  assert.equal(fs.readFileSync(`${f.config}.attempts`,'utf8').trim(),'2');
}));
test('observed enabled dock clears ownership even when CLI exits nonzero', () => dockRaceFixture(f => {
  const r=f.execute('bash -c "$RESTORE_SCRIPT" test "$HOME"','nonzero');
  assert.equal(r.status,0,r.stderr); assert(!fs.existsSync(f.state));
  assert(!JSON.parse(fs.readFileSync(f.config)).disabledPlugins.includes('omarchy.dock'));
}));
test('disable then enable within one second beats a pending restore; final disable cleans up', () => dockRaceFixture(f => {
  const r=f.execute(`bash -c "$RESTORE_SCRIPT" test "$HOME" & restore=$!
for ((i=0; i<100; i++)); do [[ ! -e "$TEST_SHELL_CONFIG.ready" ]] || break; /usr/bin/sleep 0.005; done
[[ -e "$TEST_SHELL_CONFIG.ready" ]] || exit 1
jq '.plugins = [{id:"rugobal.familiar-dock"}]' "$TEST_SHELL_CONFIG" > "$TEST_SHELL_CONFIG.new"
mv "$TEST_SHELL_CONFIG.new" "$TEST_SHELL_CONFIG"
bash -c "$HIDE_SCRIPT" test "$HOME" & hide=$!
wait "$restore"; x=$?; wait "$hide"; y=$?; test "$x$y" = 00`,'slow');
  assert.equal(r.status,0,r.stderr); assert(fs.existsSync(path.join(f.state,'dock-hidden')));
  assert(JSON.parse(fs.readFileSync(f.config)).disabledPlugins.includes('omarchy.dock'));
  const config=JSON.parse(fs.readFileSync(f.config)); config.plugins=[]; fs.writeFileSync(f.config,JSON.stringify(config));
  const end=f.execute('bash -c "$RESTORE_SCRIPT" test "$HOME"');
  assert.equal(end.status,0,end.stderr); assert(!fs.existsSync(f.state));
  assert(!JSON.parse(fs.readFileSync(f.config)).disabledPlugins.includes('omarchy.dock'));
}));
test('hover exits only clear a hover they still own (Qt 6 sends the next enter before this exit)', () => {
  const source = name => fs.readFileSync(path.join(root, name), 'utf8');
  const exitOf = (name) => (source(name).match(/^\s*onExited:.*$/m) || [''])[0];
  const button = exitOf('panel/AppButton.qml');
  assert.match(button, /hoveredButton === root\.app\.key/, 'AppButton exit must check it still owns the hover');
  assert.match(exitOf('panel/ShowDesktop.qml'), /if \(root\.hovered\)/, 'ShowDesktop exit must check it is still hovered');
  const panel = source('panel/Panel.qml');
  assert.match(panel, /previewDelay\.interval = preview\.opened \? Math\.min\(100,/, 'an open preview switches within 100 ms');
  assert.doesNotMatch(panel, /id: previewDelay\s*\n\s*interval:/, 'the delay is set per hover, not bound');
  for (const dir of ['panel','settings']) for (const name of fs.readdirSync(path.join(root,dir)).filter(n=>n.endsWith('.qml'))) {
    if (['AppButton.qml','ShowDesktop.qml'].includes(name)) continue;
    assert.doesNotMatch(source(dir+'/'+name), /onExited:[^\n]*(?:unhover\(|hoveredButton\s*=)/, name+' must not clear another button hover');
  }
});
test('drag insertion uses visible slot centers, preserves pins, and reserves a constant replacement slot', () => {
  const drag = library('panel/DragLayout.js');
  const items = [{appKey:'a',isFavorite:true},{appKey:'b',isFavorite:true},{appKey:'c',isFavorite:false}];
  assert.equal(drag.insertion(items,[40,80,40],0,100,['a','hidden','b']).before,'');
  assert.equal(drag.insertion(items,[40,80,40],2,10,['a','b']).before,'a');
  assert.equal(drag.insertion(items,[40,80,40],2,65,['a','b']).before,'b');
  assert.equal(drag.insertion(items,[40,80,40],0,999,['a','b']).index,1);
  assert.equal(drag.insertion(items,[40,80,40],0,0,['a','hidden','b']).before,'hidden','no-op must preserve invisible pins');
  for (const mode of [{group:true,launchers:false},{group:false,launchers:false},{group:false,launchers:true}]) {
    const entries={a:{name:'A'},b:{name:'B'},c:{name:'C'}};
    const settings=defaults({'group-apps':mode.group,'group-apps-use-launchers':mode.launchers,'isolate-workspaces':true});
    const windows=[{appKey:'a',address:'1',workspaceId:1},{appKey:'a',address:'2',workspaceId:1},{appKey:'b',address:'3',workspaceId:1},{appKey:'c',address:'4',workspaceId:1},{appKey:'c',address:'5',workspaceId:2}];
    const visible=A.buildItems(['a','hidden','b'],windows,['a','b','c'],settings,{primary:true,panelCount:1,monitor:'DP-1',workspaceId:1},entries);
    const source=visible.findIndex(i=>i.appKey==='c'),sizes=visible.map(i=>i.windows.length?90:40);
    assert.equal(drag.insertion(visible,sizes,source,0,['a','hidden','b']).before,'a');
    assert(!visible.some(i=>i.windows.some(w=>w.workspaceId===2)));
    const a=visible.findIndex(i=>i.appKey==='a');
    assert.equal(drag.insertion(visible,sizes,a,999,['a','hidden','b']).before,'');
  }
  // Axis-independent geometry also handles vertical panels and wide ungrouped labels.
  const ungrouped = [...items.slice(0,2), {appKey:'a',isFavorite:false},items[2]];
  assert.equal(drag.insertion(ungrouped,[40,160,90,60],3,60,['a','b']).before,'b');
  const filtered = [items[1], items[2]];
  assert.equal(drag.insertion(filtered,[80,40],1,0,['a','hidden','b']).before,'b');
  // The library runs in its own realm: compare its results as JSON.
  const same=(a,b,message)=>assert.equal(JSON.stringify(a),JSON.stringify(b),message);
  const three=['a','b','c'].map(k=>({appKey:k,isFavorite:true}));
  for (const pointer of [0,60,100,999]) {
    const layout=drag.arrange([40,80,40],drag.insertion(three,[40,80,40],0,pointer,['a','b','c'],0).order,0);
    assert.equal(layout.length,160);
    assert.equal(new Set([...layout.starts.filter(v=>v!==undefined),layout.placeholder]).size,3);
  }
  same(drag.rest(three,1),{index:1,before:'',order:[0,1,2],stays:true});
  // Ungrouped, an app's windows sit together and move as one run, with the
  // dragged window's room at its own place inside it: [A1,A2,A3,B] at
  // 100 px, A2 dragged. Nothing moves until the run's center passes B's.
  const runs=[{appKey:'a',isFavorite:true},{appKey:'a',isFavorite:true},{appKey:'a',isFavorite:true},{appKey:'b',isFavorite:true}];
  const hundred=[100,100,100,100];
  same(drag.rest(runs,1),{index:0,before:'',order:[0,1,2,3],stays:true},'a run rests at its first slot');
  const nudged=drag.insertion(runs,hundred,1,160,['a','b'],0);
  same([nudged.index,nudged.order],[0,[0,1,2,3]],'a nudge leaves the room where the window is');
  assert.equal(drag.arrange(hundred,nudged.order,1).placeholder,100);
  assert.equal(drag.insertion(runs,hundred,1,349,['a','b'],0).index,0);
  const past=drag.insertion(runs,hundred,1,351,['a','b'],0);
  same([past.index,past.before,past.order],[1,'',[3,0,1,2]],'past B the whole run follows it');
  const moved=drag.arrange(hundred,past.order,1);
  same([moved.starts[3],moved.starts[0],moved.placeholder,moved.starts[2]],[0,100,200,300],'the room is where A2 lands');
  assert.equal(drag.insertion(runs,hundred,1,51,['a','b'],1).index,1,'coming back, B stays put until its center');
  assert.equal(drag.insertion(runs,hundred,1,49,['a','b'],1).index,0);
  // The run's center is the dragged window's rank further along.
  assert.equal(drag.insertion(runs,hundred,0,249,['a','b'],0).index,0);
  assert.equal(drag.insertion(runs,hundred,0,251,['a','b'],0).index,1);
  assert.equal(drag.insertion(runs,hundred,2,449,['a','b'],0).index,0);
  assert.equal(drag.insertion(runs,hundred,2,451,['a','b'],0).index,1);
  // B, dragged the other way, passes the whole run only at the run's
  // center; once past, the run is drawn at 100-400 and B goes back at 250.
  assert.equal(drag.insertion(runs,hundred,3,151,['a','b'],3).index,3);
  const ahead=drag.insertion(runs,hundred,3,149,['a','b'],3);
  same([ahead.index,ahead.before,ahead.order],[0,'a',[3,0,1,2]]);
  assert.equal(drag.insertion(runs,hundred,3,249,['a','b'],0).index,0,'over the run, after the swap, nothing moves');
  assert.equal(drag.insertion(runs,hundred,3,251,['a','b'],0).index,3);
  // With the room open, slots after it are seen one dragged slot further on:
  // a slot changes sides only once the point passes its center where it is
  // drawn, and over the room nothing moves. Four 50 px pins, b (1) dragged.
  const four=['a','b','c','d'].map(k=>({appKey:k,isFavorite:true})), w=[50,50,50,50];
  assert.equal(drag.insertion(four,w,1,124,['a','b','c','d'],1).index,1,'short of c, which is drawn at 100-150');
  assert.equal(drag.insertion(four,w,1,126,['a','b','c','d'],1).index,2,'past c');
  assert.equal(drag.insertion(four,w,1,76,['a','b','c','d'],1).index,1,'over its own room');
  assert.equal(drag.insertion(four,w,1,24,['a','b','c','d'],1).index,0,'past a');
  // Once past c the room is at 2, c is drawn at 50-100: coming back over
  // the room changes nothing until c's center is passed again.
  assert.equal(drag.insertion(four,w,1,110,['a','b','c','d'],2).index,2);
  assert.equal(drag.insertion(four,w,1,74,['a','b','c','d'],2).index,1);
  assert.equal(drag.insertion(four,w,1,999,['a','b','c','d'],2).index,3);
  assert.equal(drag.insertion(four,w,1,76,['a','b','c','d'],1).stays,true,'a pin back over its own room stays');
  assert.equal(drag.insertion(four,w,1,126,['a','b','c','d'],1).stays,false);
  // A running app that isn't pinned, f, after pins a-d and running e, all
  // 100 px. Among the pins it would be pinned there; among the running apps
  // it only moves, even right after the last pin, and it can always come
  // back to its own place, where nothing is written. Home is 5.
  const unpinned=[...four,{appKey:'e',isFavorite:false},{appKey:'f',isFavorite:false}];
  const pinned=['a','b','c','d'], sixes=[100,100,100,100,100,100];
  same(drag.rest(unpinned,5),{index:5,before:'',order:[0,1,2,3,4,5],stays:true});
  const stillF=drag.insertion(unpinned,sixes,5,550,pinned,5);
  same([stillF.index,stillF.before,stillF.order,stillF.stays],[5,'',[0,1,2,3,4,5],true],'a nudge leaves it at home');
  assert.equal(drag.insertion(unpinned,sixes,5,451,pinned,5).index,5,"short of e's center it stays home");
  const aheadOfE=drag.insertion(unpinned,sixes,5,449,pinned,5);
  same([aheadOfE.index,aheadOfE.pin,aheadOfE.runBefore,aheadOfE.before,aheadOfE.order,aheadOfE.stays],[4,false,'e','',[0,1,2,3,5,4],false],
    'past e it goes ahead of e, still unpinned, though that is right after the pins');
  const amongPins=drag.insertion(unpinned,sixes,5,349,pinned,5);
  same([amongPins.index,amongPins.pin,amongPins.before],[3,true,'d'],'among the pins it is pinned');
  // With the room ahead of e, e is drawn at 500-600: f goes back home once
  // its center passes e's again.
  assert.equal(drag.insertion(unpinned,sixes,5,549,pinned,4).index,4);
  const backF=drag.insertion(unpinned,sixes,5,551,pinned,4);
  same([backF.index,backF.before,backF.order,backF.stays],[5,'',[0,1,2,3,4,5],true],'back home it stays unpinned');
  assert.equal(drag.insertion(unpinned,sixes,5,999,pinned,4).index,5);
  assert.equal(drag.insertion(unpinned,sixes,5,349,pinned,4).before,'d');
  // e, the first running app, rests right after the pins and moves past f.
  const firstE=drag.insertion(unpinned,sixes,4,520,pinned,4);
  same([firstE.index,firstE.stays],[4,true]);
  const pastF=drag.insertion(unpinned,sixes,4,551,pinned,4);
  same([pastF.index,pastF.pin,pastF.runBefore,pastF.order,pastF.stays],[5,false,'',[0,1,2,3,5,4],false],'past f it goes last');
  assert.equal(drag.insertion(unpinned,sixes,4,349,pinned,4).before,'d');
  // A pin never goes among the running apps: past them it is the last pin.
  const lastPin=drag.insertion(unpinned,sixes,1,999,pinned,1);
  same([lastPin.index,lastPin.pin,lastPin.before,lastPin.runBefore],[3,true,'',''],'a pin stops after the last pin');
  // Ungrouped, a running app's windows are one block: g's two windows,
  // then h. h dragged left lands ahead of g's block, never between its windows.
  const split=[...four,{appKey:'g',isFavorite:false},{appKey:'g',isFavorite:false},{appKey:'h',isFavorite:false}];
  const sevens=[100,100,100,100,100,100,100];
  assert.equal(drag.insertion(split,sevens,6,551,pinned,6).index,6,"over g's second window it stays home");
  const aheadOfG=drag.insertion(split,sevens,6,499,pinned,6);
  same([aheadOfG.index,aheadOfG.runBefore],[4,'g']);
  // The model keeps the new running order; apps hidden here keep their places.
  same(A.moveBefore(['x','e','y','f'],'f','e'),['x','f','e','y']);
  same(A.moveBefore(['x','e','y','f'],'e',''),['x','y','f','e']);
  same(A.moveBefore(['e','f'],'f','gone'),['e','f']);
  const taskbar=fs.readFileSync(path.join(root,'panel/Taskbar.qml'),'utf8');
  assert.match(taskbar,/if \(state && state.accepted && !state.insertion.stays\)/);
  assert.match(taskbar,/root.reorder\(state.appKey, state.insertion.before\)/);
  assert.match(taskbar,/if \(!state.insertion.pin\) \{\n\s*root.dragState = Object.assign\(\{\}, state, \{committed: true\}\)\n\s*root.appModel.moveRunning\(state.appKey, state.insertion.runBefore\)/,'the running order moves only after the drag is committed');
  assert.match(taskbar,/interactive: !dragging/);
  // Taking keyboard focus mid-press makes Hyprland re-focus the panel, Qt
  // forgets the held button, and the drag ends as a drop the moment it starts.
  const panelQml=fs.readFileSync(path.join(root,'panel/Panel.qml'),'utf8');
  assert.match(panelQml,/^\s*WlrLayershell\.keyboardFocus: WlrKeyboardFocus\.None$/m);
  assert.doesNotMatch(taskbar,/forceActiveFocus|onActiveFocusChanged/);
});
test('drag ghost keeps its grab point in the panel row, arms a cancel when pulled off, and lands without a blank slot', () => {
  const drag = library('panel/DragLayout.js');
  // Grabbed 30 px into a button whose face rests at x=100: the ghost keeps
  // that offset, and only moves along the panel.
  deepEqual(drag.follow({x:100,y:0},{x:130,y:20},{x:210,y:-80},false),{x:180,y:0});
  deepEqual(drag.follow({x:0,y:100},{x:20,y:130},{x:-80,y:210},true),{x:0,y:180});
  // A 400x45 taskbar: overshooting by less than the limit still drops.
  for (const p of [{x:200,y:20},{x:-47,y:20},{x:447,y:20},{x:200,y:-47},{x:200,y:92}]) assert.equal(drag.pulledOff(p,400,45,48),false,JSON.stringify(p));
  for (const p of [{x:-48,y:20},{x:448,y:20},{x:200,y:-48},{x:200,y:93},{x:-60,y:-60}]) assert.equal(drag.pulledOff(p,400,45,48),true,JSON.stringify(p));
  const taskbar=fs.readFileSync(path.join(root,'panel/Taskbar.qml'),'utf8');
  const button=fs.readFileSync(path.join(root,'panel/AppButton.qml'),'utf8');
  const panel=fs.readFileSync(path.join(root,'panel/Panel.qml'),'utf8');
  assert.match(button,/beginDrag\(root, centroid\.scenePressPosition, centroid\.scenePosition\)/);
  // The dragged button hides without the launch fade, so it is back the
  // frame the ghost goes.
  assert.match(button,/^\s*opacity: appeared \? 1 :/m);
  assert.doesNotMatch(button,/^\s*opacity:.*dragState/m);
  assert.match(button,/id: body\s*\n\s*visible: !root\.dragHidden/);
  // Slides are switched off before the last layout and on after the first.
  assert.match(taskbar,/function endDrag\(\) \{\s*\n\s*settleTimer\.stop\(\); writeWait\.stop\(\)\s*\n\s*slotMotion = false\s*\n\s*dragState = null/);
  assert.match(taskbar,/moveDrag\(point\)\s*\n\s*slotMotion = true/);
  assert.doesNotMatch(taskbar,/Behavior on [xy] \{ enabled: root\.dragging/);
  assert.match(taskbar,/if \(!dragging \|\| dragState\.committed\) return/);
  // Crossing the clock mid-drag must not open it (that would cancel the drag).
  assert.match(panel,/!root\.popupOpen \|\| root\.host\.settingsOpen \|\| root\.dragging \|\| clock\.opened\) return/);
});
test('settings form maps every implemented key exactly once, with compatible controls, catalog labels and exact enums', () => {
  const form=library('settings/FormModel.js');
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'i18n/en.json')));
  const rows=fs.readFileSync(path.join(root,'docs/settings-coverage.md'),'utf8').split('\n').filter(r=>r.startsWith('| `'));
  const implemented=rows.filter(r=>r.split('|')[3].includes('implemented')).map(r=>r.split('`')[1]);
  const expected=[...implemented,'theme-bg-color','icon-contrast-outline','hide-omarchy-dock','show-scratchpad-windows','animate-appicon-hover-macos','show-apps-hotkey','show-apps-click','favorites'];
  assert.equal(form.controls.length,170);
  deepEqual(form.controls.map(c=>c.key).sort(),expected.sort());
  assert.equal(new Set(form.controls.map(c=>c.key)).size,expected.length);
  for (const f of form.controls) {
    assert(Object.hasOwn(catalog,f.label),f.key);
    if(f.help) assert(typeof catalog[f.help]==='string' && catalog[f.help].trim().length>0,f.key+' help resolves');
    assert.equal(form.helpText({t:key=>catalog[key]||key},f),f.help?catalog[f.help]:'',f.key+' help');
    assert(Object.hasOwn(catalog,'settings.group.'+f.group),f.group);
    const def=Object.hasOwn(D.values,f.key)?D.values[f.key]:D.inertValues[f.key];
    if(typeof def==='boolean') assert.equal(f.type,'Toggle',f.key);
    if(typeof def==='number') assert(['NumberField','PanelSlider'].includes(f.type),f.key);
    if(typeof def==='string') assert(['TextField','ColorField','Dropdown','Monitor','Hotkey'].includes(f.type),f.key);
    if(Array.isArray(def)) assert.equal(f.type,'ListEditor',f.key);
    if(def===null) assert.equal(f.type,'Pins',f.key);
    if(D.enums[f.key]) deepEqual(f.options,D.enums[f.key],f.key);
    for(const o of f.options) assert(Object.hasOwn(catalog,'settings.option.'+o),f.key+':'+o);
    if(f.key!=='favorites') assert(form.validValue(f, f.perMonitor ? C.monitorDefaults[f.key] : def),f.key+' accepts default');
    assert(rows.find(r=>r.split('`')[1]===f.key)?.includes(' / '+f.key+'`') || !implemented.includes(f.key));
  }
  for (const r of rows.filter(r=>!r.split('|')[3].includes('implemented'))) assert(!form.controls.some(c=>c.key===r.split('`')[1]),r);
});
test('settings form rejects invalid inputs, keeps monitor overrides, and neutralizes shared control text', () => {
  const form=library('settings/FormModel.js'),field=k=>form.controls.find(c=>c.key===k);
  const raw={'panel-sizes':48,unknown:42};
  deepEqual(form.change(raw,field('panel-sizes'),64,'DP-1',false),{'*':48,'DP-1':64});
  deepEqual(form.change({'panel-sizes':{'DP-1':48}},field('panel-sizes'),64,'DP-2',true),{'*':64});
  assert(!Object.hasOwn(form.change(raw,field('panel-sizes'),64,'DP-1',false),'favorites'));
  assert(!form.validValue(field('panel-lengths'),0));assert(!form.validValue(field('panel-lengths'),19));
  assert(form.validValue(field('panel-lengths'),-1));
  assert(!form.validValue(field('panel-element-positions'),Array(9).fill({element:'bad'})));
  assert.throws(()=>form.parseInput(field('trans-bg-color'),'not a color'));
  assert.throws(()=>form.parseInput(field('panel-context-menu-commands'),'[true]'));
  assert(form.validValue(field('trans-bg-color'),'#11223344'));
  assert(form.validValue(field('animate-appicon-hover-animation-zoom'),{SIMPLE:1.4,RIPPLE:1.2,PLANK:2}));
  assert(!form.validValue(field('animate-appicon-hover-animation-duration'),{PLANK:301}));
  const attack='<img src="https://example.invalid/tracker">&';
  assert(!/[<>&]/.test(form.safe(attack)));assert.equal(form.safe('x'.repeat(5000)).length,4096);
});
test('Config writer changes one key under private HOME, keeps unknown keys and never materializes favorites', () => {
  writerFixture(root,C,library('settings/WritePlan.js'), f=>{
    const before={unknown:{nested:'keep'},'panel-sizes':{'*':48}};
    fs.writeFileSync(f.target,JSON.stringify(before));f.load();assert.equal(f.writes.length,0);
    f.config.setSetting('show-tooltip',false);f.drain();
    const after=JSON.parse(fs.readFileSync(f.target));deepEqual(after,{...before,'show-tooltip':false});
    assert(!Object.hasOwn(after,'favorites'));assert.equal(f.writes.length,1);
    // An external edit between the click and the disk read must survive.
    f.config.setSetting('appicon-margin',6);
    after.external='latest';fs.writeFileSync(f.target,JSON.stringify(after));f.drain();
    assert.equal(JSON.parse(fs.readFileSync(f.target)).external,'latest');
  });
});
test('Config writer drops listed keys back to their defaults in the same atomic write, never pins, and a later change wins', () => {
  writerFixture(root,C,library('settings/WritePlan.js'), f=>{
    const before={unknown:1,favorites:['a'],'show-tooltip':false,'appicon-margin':6,'dot-size':5};
    fs.writeFileSync(f.target,JSON.stringify(before));f.load();
    f.config.setSettings({'dot-position':'TOP'},['show-tooltip','favorites','not-a-key']);f.drain();
    deepEqual(JSON.parse(fs.readFileSync(f.target)),{unknown:1,favorites:['a'],'appicon-margin':6,'dot-size':5,'dot-position':'TOP'});
    assert.equal(f.writes.length,1);
    // Removals alone still write; pending edits merge in call order.
    f.config.setSettings({},['appicon-margin']);f.config.setSettings({'appicon-margin':8},[]);
    f.config.setSettings({'dot-size':7});f.config.setSettings({},['dot-size']);f.drain();
    deepEqual(JSON.parse(fs.readFileSync(f.target)),{unknown:1,favorites:['a'],'appicon-margin':8,'dot-position':'TOP'});
    assert.equal(f.writes.length,2);
    deepEqual(f.config.pendingRemovals,[]);
  });
  // The pure merge keeps a key that is both changed and listed.
  deepEqual(C.withSettings({a:1,'dot-size':5},{'dot-size':6},['dot-size','favorites']),{a:1,'dot-size':6});
  // Every path that abandons queued changes abandons queued removals with them.
  const qml=fs.readFileSync(path.join(root,'services/Config.qml'),'utf8');
  const drops=qml.split('\n').filter(l=>/pendingSettings = null/.test(l));
  assert.equal(drops.length,3);
  for(const line of drops) assert.match(line,/pendingRemovals = \[\]/,line.trim());
});
test('looks: each sets the same keys, the macOS look magnifies at 1.3 and never hides, detection reads every monitor and ignores unseen values', () => {
  const Lk=library('settings/Looks.js'), keys=[...Lk.keys], F=library('settings/FormModel.js');
  deepEqual(Lk.ids,['windows','macos']);
  assert.equal(new Set(keys).size,keys.length);
  for(const key of keys) assert(Object.hasOwn(D.values,key),key);
  for(const look of Lk.looks) for(const key of Object.keys(look.values)) assert(keys.includes(key),look.id+':'+key);
  // Never a look's to change: pins, edge, size, monitors, previews, menus, hotkeys.
  for(const key of ['favorites','panel-positions','panel-sizes','multi-monitors','primary-monitor','show-window-previews','context-menu-entries','hot-keys','look-custom']) assert(!keys.includes(key),key);
  const mac=Lk.find('macos').values;
  assert.equal(mac['animate-appicon-hover'],true,'a gentle magnification');
  deepEqual(mac['animate-appicon-hover-animation-zoom'],{...plain(D.values['animate-appicon-hover-animation-zoom']),PLANK:1.3});
  assert.equal(Object.hasOwn(mac,'intellihide'),false,'no autohide');
  assert.equal(mac['animate-appicon-hover-animation-type'],'PLANK');assert.equal(mac['animate-appicon-hover-macos'],true);
  for(const look of Lk.looks) {
    const layout=look.values['panel-element-positions'];
    if(layout) { assert(F.validValue(F.controls.find(c=>c.key==='panel-element-positions'),layout),look.id); deepEqual(layout.map(r=>r.element),D.elementLayout.map(r=>r.element)); }
    const fields=F.controls;
    for(const [key,value] of Object.entries(look.values)) if(key!=='panel-element-positions') assert(F.validValue(fields.find(c=>c.key===key),value),look.id+':'+key);
  }
  const at=(raw,monitors=['DP-3'])=>Lk.current(C.validate(raw),monitors,'DP-3');
  assert.equal(at({}),'windows','the plugin defaults are the Windows look');
  // The seed's layout with dashes is Windows, opacity off and a stray value notwithstanding.
  const windows={'panel-element-positions':{'*':Lk.find('windows').values['panel-element-positions']},'panel-lengths':{'*':100},'panel-anchors':{'*':'MIDDLE'},
    'dot-style-focused':'DASHES','trans-panel-opacity':0.398,'trans-bg-color':'#123456','animate-appicon-hover-animation-type':'RIPPLE'};
  assert.equal(at(windows),'windows');
  assert.equal(at({...windows,'trans-use-custom-opacity':true}),'custom','an opacity that shows counts');
  assert.equal(at({...windows,intellihide:true}),'custom');
  // Colours compare by value; per-monitor values compare on every connected monitor.
  const applied=raw=>{const p=Lk.plan('macos',raw,C.validate(raw),['DP-3'],'DP-3');return plain(C.withSettings(raw,p.changes,p.removals));};
  const macRaw=applied({});
  assert.equal(at(macRaw),'macos');
  assert.equal(at({...macRaw,'trans-bg-color':'rgb(255,255,255)'}),'macos');
  assert.equal(at({...macRaw,'panel-lengths':{'*':-1,'DP-4':100}},['DP-3','DP-4']),'custom');
  assert.equal(at({...macRaw,'panel-lengths':{'*':-1,'DP-4':100}},['DP-3']),'custom','a value for a monitor not connected counts: a look would drop it');
  assert.equal(at({'panel-lengths':{'DP-3':70}},[]),'custom','no monitor list still reads the named values');
  assert.equal(at({...windows,'panel-lengths':{'DP-3':100}},['DP-3']),'windows');
  assert.equal(at({...macRaw,'animate-appicon-hover':false}),'custom','no magnification is a change');
  assert.equal(at({...macRaw,'animate-appicon-hover-animation-zoom':{SIMPLE:1,RIPPLE:1.25,PLANK:2}}),'custom','nor the zoom in use');
  assert.equal(at({...macRaw,'animate-appicon-hover-animation-zoom':{SIMPLE:1.5,RIPPLE:1.25,PLANK:1.3}}),'macos','only the zoom in use counts');
  assert.equal(at({...windows,'animate-appicon-hover-animation-zoom':{SIMPLE:1,RIPPLE:1.25,PLANK:1.3}}),'windows','a zoom with hover off is unseen');
  deepEqual(Lk.choices('macos',false),['windows','macos']);
  deepEqual(Lk.choices('custom',false),['windows','macos','custom']);
  deepEqual(Lk.choices('windows',true),['windows','macos','custom']);
});
test('looks: switching writes all monitors and drops defaults, leaving Custom saves it, and Custom brings back exactly what the file held', () => {
  const Lk=library('settings/Looks.js');
  const go=(id,raw,monitors=['DP-3'])=>{const p=Lk.plan(id,raw,C.validate(raw),monitors,'DP-3');return p?plain(C.withSettings(raw,p.changes,p.removals)):null;};
  const mine={favorites:['x'],'panel-sizes':{'*':45},'appicon-margin':4,future:{keep:1},
    'panel-lengths':{'*':-1,'DP-4':70},'intellihide':true,'animate-appicon-hover':true,'trans-panel-opacity':0.3};
  const mac=go('macos',mine);
  assert.equal(Lk.current(C.validate(mac),['DP-3'],'DP-3'),'macos');
  deepEqual(mac['panel-lengths'],{'*':-1},'a look sets every monitor');
  for(const key of ['intellihide','panel-anchors']) assert(!Object.hasOwn(mac,key),key+' at its default leaves the file');
  assert.equal(mac['animate-appicon-hover'],true);
  for(const key of ['favorites','panel-sizes','appicon-margin','future']) deepEqual(mac[key],mine[key],key+' is not a look key');
  deepEqual(mac['look-custom'],{'panel-lengths':{'*':-1,'DP-4':70},intellihide:true,'animate-appicon-hover':true,'trans-panel-opacity':0.3});
  // Look to look keeps the saved Custom; the same look again is no write.
  const win=go('windows',mac);
  deepEqual(win['look-custom'],mac['look-custom']);
  assert.equal(go('windows',win),null);
  deepEqual(Object.keys(win).filter(k=>Lk.keys.includes(k)),[],'the Windows look is the defaults, so none of its keys stays in the file');
  const back=go('custom',win);
  for(const key of Lk.keys) assert.equal(JSON.stringify(back[key]),JSON.stringify(mine[key]),key);
  assert.equal(Lk.current(C.validate(back),['DP-3','DP-4'],'DP-3'),'custom');
  assert.equal(go('custom',{}),null,'nothing saved, nothing to bring back');
  // The saved Custom is validated like the keys themselves; strays are dropped.
  deepEqual(C.validate({'look-custom':{'dot-size':99,favorites:['a'],'look-custom':{},bogus:1,'panel-lengths':{'*':5}}})['look-custom'],{'dot-size':16,'panel-lengths':{'*':20}});
  assert.equal(C.validate({'look-custom':[1]})['look-custom'],null);
  // Export/import keeps a saved Custom as it is.
  deepEqual(library('settings/WritePlan.js').importChanges(JSON.stringify({'look-custom':mac['look-custom']}))['look-custom'],mac['look-custom']);
});
test('Config writer blocks malformed-file edits and reset, preserving exact bytes', () => {
  writerFixture(root,C,library('settings/WritePlan.js'), f=>{
    const broken='{ "favorites": [ unfinished';fs.writeFileSync(f.target,broken);f.load();
    assert.equal(f.config.valid,false);f.config.setSetting('show-tooltip',false);f.config.resetDefaults();f.drain();
    assert.equal(f.writes.length,0);assert.equal(fs.readFileSync(f.target,'utf8'),broken);
  });
});
test('Config reset backs up exact bytes before atomic save and keeps explicit or absent favorites and unknown keys', () => {
  for(const pins of [undefined,['a','b'],[]]) writerFixture(root,C,library('settings/WritePlan.js'),f=>{
    const raw={'show-tooltip':false,'panel-sizes':{'*':88},'context-menu-entries':[{title:'Custom',cmd:'custom-command'}],future:{keep:true}};
    if(pins!==undefined)raw.favorites=pins;
    const bytes=JSON.stringify(raw,null,4)+'\n';fs.writeFileSync(f.target,bytes);f.load();
    f.config.resetDefaults();f.drain();
    const after=JSON.parse(fs.readFileSync(f.target));
    assert.equal(fs.readFileSync(f.config.backupPath,'utf8'),bytes);
    deepEqual(after,pins===undefined?{future:{keep:true}}:{future:{keep:true},favorites:pins});
    deepEqual(f.config.settings['context-menu-entries'],seed['context-menu-entries'],'reset restores the Omarchy command defaults');
    deepEqual(f.writes,[f.config.backupPath,f.target]);
  });
});
test('an import that adds commands shows them and waits; skip keeps the menus, all takes them', () => {
  // The window cannot load under the test runner: its wiring is read instead.
  // The answers map in the order the buttons are drawn, the safe one first,
  // and closing Settings with the question open cancels the import.
  const window=fs.readFileSync(path.join(root,'settings/SettingsWindow.qml'),'utf8');
  const dialog=window.slice(window.indexOf('id: importDialog'),window.indexOf('onChosen',window.indexOf('id: importDialog'))+120);
  assert.match(dialog,/opened: !!root\.config\.importReview/);
  assert.match(dialog,/choices: \[\{text: root\.strings\.t\("settings\.cancel"\)\}, \{text: root\.strings\.t\("settings\.importCommands\.skip"\)\},\s+\{text: root\.strings\.t\("settings\.importCommands\.all"\), destructive: true\}\]/);
  assert.match(dialog,/finishImport\(\["cancel", "skip", "all"\]\[index\]\)/);
  assert.match(window,/onOpenedChanged: if \(!opened && config\.importReview\) config\.finishImport\("cancel"\)/);
  assert.match(window,/if \(importDialog\.opened\) \{ event\.accepted = importDialog\.handleKey\(event\); return \}/);
  const writes=library('settings/WritePlan.js'), current=C.validate({});
  const evil={'context-menu-entries':[{title:'Terminal',cmd:'TERMINALSETTINGS'},{title:'Files',cmd:'curl x | sh'}],
    'panel-context-menu-commands':['notify-send hi'],'panel-context-menu-titles':['Hi'],
    'show-apps-click':{action:'command',app:'',keybinding:'',command:'echo a\nrm -rf b'},'show-tooltip':false};
  const found=writes.importCommands(evil,current);
  deepEqual(found.map(c=>[c.key,c.title,c.command]),[['context-menu-entries','Files','curl x | sh'],['panel-context-menu-commands','Hi','notify-send hi'],
    ['show-apps-click','','echo a\nrm -rf b']],'defaults and current commands are not asked about');
  deepEqual(writes.withoutCommands(evil,found),{'show-tooltip':false},'titles go with their commands');
  const {'context-menu-entries':dropped,...rest}=evil;
  deepEqual(writes.withoutCommands(evil,found.slice(0,1)),rest,'only the groups that brought new commands are left out');
  deepEqual(writes.importCommands({'show-tooltip':false},current),[]);
  deepEqual(writes.importCommands({'context-menu-entries':current['context-menu-entries']},current),[],'an export of the defaults asks nothing');
  // A command kept but not run now is not trusted: the drawer's remembered
  // command turned on, or a title given to a command the menu hid.
  const kept=C.validate({'show-apps-click':{action:'drawer',app:'',keybinding:'',command:'curl y | sh'},
    'panel-context-menu-commands':['rm -rf ~/x'],'panel-context-menu-titles':['']});
  deepEqual(writes.importCommands({'show-apps-click':{...kept['show-apps-click'],action:'command'}},kept).map(c=>c.command),['curl y | sh']);
  deepEqual(writes.importCommands({'panel-context-menu-titles':['Clean up']},kept).map(c=>[c.title,c.command]),[['Clean up','rm -rf ~/x']]);
  // Nor is one past the 64 a menu shows, moved into view.
  const many=C.validate({'context-menu-entries':Array.from({length:65},(_,i)=>({title:'T'+i,cmd:'c'+i}))});
  deepEqual(writes.importCommands({'context-menu-entries':[{title:'T64',cmd:'c64'}]},many).map(c=>c.command),['c64']);
  // Re-importing your own export asks nothing, kept commands included.
  deepEqual(writes.importCommands({'show-apps-click':kept['show-apps-click'],'panel-context-menu-commands':kept['panel-context-menu-commands'],
    'panel-context-menu-titles':kept['panel-context-menu-titles']},kept),[]);
  // The review shows every command whole: nothing is cut, and nothing can
  // hide, push away or reorder what follows it.
  const t=k=>({'settings.importCommands.drawer':'Drawer icon click','settings.importCommands.untitled':'Untitled entry'})[k];
  const long='printf safe'+' '.repeat(1100)+'; curl z | sh';
  deepEqual(writes.reviewEntries([...found,{key:'panel-context-menu-commands',title:' ',command:'a\tb\x1bc'},
    {key:'context-menu-entries',title:'Files\u202e',command:long},{key:'context-menu-entries',title:'x',command:'a\u200bb\u2028c'}],t),
    [{title:'Files',text:'curl x | sh'},{title:'Hi',text:'notify-send hi'},{title:'Drawer icon click',text:'echo a ⏎ rm -rf b'},
     {title:'Untitled entry',text:'a⇥b⟨U+001B⟩c'},{title:'Files⟨U+202E⟩',text:'printf safe ␣×1100 ; curl z | sh'},{title:'x',text:'a⟨U+200B⟩b ⏎ c'}]);
  assert.equal(writes.reviewEntries([{key:'context-menu-entries',title:'',command:'x'.repeat(4096)}],t)[0].text.length,4096,'never cut short');
  for(const [choice,expect] of [['cancel',{future:1}],['skip',{future:1,'show-tooltip':false}],['all',null]]) writerFixture(root,C,writes,f=>{
    fs.writeFileSync(f.target,'{"future":1}'); f.load();
    f.config.importText(JSON.stringify(evil)); f.drain();
    deepEqual(JSON.parse(fs.readFileSync(f.target)),{future:1},'nothing is written while the question is open');
    assert.equal(f.config.importReview.commands.length,3);
    f.config.importText('{"show-tooltip":true}'); assert.equal(f.config.importReview.commands.length,3,'one question at a time');
    f.config.finishImport(choice); f.drain(); assert.equal(f.config.importReview,null);
    const after=JSON.parse(fs.readFileSync(f.target));
    if(expect) deepEqual(after,expect); else { assert.equal(after['show-apps-click'].command,'echo a\nrm -rf b'); assert.equal(after['context-menu-entries'][1].cmd,'curl x | sh'); }
    if(choice==='cancel') assert.equal(f.config.message,'settings.importCanceled');
  });
  writerFixture(root,C,writes,f=>{
    fs.writeFileSync(f.target,'{}'); f.load();
    f.config.importText(JSON.stringify({'panel-context-menu-commands':['x'],'panel-context-menu-titles':['X']})); f.drain();
    f.config.finishImport('skip'); f.drain(); assert.equal(f.config.message,'settings.importOnlyCommands');
  });
});
test('settings import validates supplied values and paths, merges without replacing unknown keys', () => {
  const writes=library('settings/WritePlan.js');
  assert.throws(()=>writes.importChanges('{bad'));
  assert.throws(()=>writes.importChanges('{"trans-bg-color":"bogus"}'));
  assert.throws(()=>writes.importChanges('{"panel-lengths":{"*":12}}'));
  assert.equal(writes.chosenPath('relative','/private','/private/config'),'');
  assert.equal(writes.chosenPath('/private/config','/private','/private/config'),'');
  assert.equal(writes.chosenPath('/private//config','/private','/private/config'),'');
  assert.equal(writes.chosenPath('/private/export/..','/private','/private/config'),'');
  assert.equal(writes.chosenPath('~/export.json','/private','/private/config'),'/private/export.json');
  writerFixture(root,C,writes,f=>{
    fs.writeFileSync(f.target,'{"future":42}');f.load();
    f.config.importText('{"show-tooltip":false}');f.drain();
    deepEqual(JSON.parse(fs.readFileSync(f.target)),{future:42,'show-tooltip':false});
    f.config.importText('{"show-tooltip":"bad"}');f.drain();assert.equal(f.writes.length,1);
  });
});
test('settings overlay uses shell controls, lazy forms, guarded writes, string IPC and preserved preview handoff', () => {
  const source=name=>fs.readFileSync(path.join(root,name),'utf8');
  const window=source('settings/SettingsWindow.qml'),field=source('settings/SettingField.qml');
  assert.match(window,/Ui\.OverlayWindow/);assert.match(window,/mask: Region \{\s*width: overlay\.width; height: overlay\.height\s*Region \{\s*intersection: Intersection\.Subtract/);
  assert.match(window,/Qt.Key_Escape/);assert.match(window,/onClicked: root.close\(\)/);
  assert.match(window,/SettingsTabContent/);assert.match(window,/Ui.ConfirmDialog/);
  const content=source('settings/SettingsTabContent.qml');
  assert.match(content,/active: opened/);assert.match(content,/height: item \? item.implicitHeight : 0/);
  assert.match(content,/sourceComponent: tab === "About" \? about : tab === "Overview" \? overview : form/);
  // One keyboard cursor: rows register with the window, a field being typed
  // into or an open list keeps the keys, and Escape in the search box only
  // leaves the search.
  assert.match(window,/function registerNavRow\(row\)/);assert.match(window,/function setNavBlocked\(row, blocking\)/);
  assert.match(window,/if \(root\.navBlocked \|\| root\.searchFocused\) return/);
  assert.match(window,/if \(root\.typing\) \{/);
  assert.match(window,/active: root\.opened\n/,'the search field exists only while open');
  assert.match(source('settings/ui/NavRow.qml'),/Component\.onDestruction: if \(nav\) nav\.unregisterNavRow\(row\)/);
  assert.equal(library('settings/FormModel.js').tabs[0],'Overview');
  const nav=library('settings/Nav.js');
  assert.equal(JSON.stringify(nav.order),JSON.stringify(library('settings/FormModel.js').tabs),'the sidebar lists every page once, in tab order');
  // Search counts come from the same rows the pages show, About and the
  // monitor rows included; a key on a row that became disabled does nothing.
  const navCatalog=JSON.parse(fs.readFileSync(path.join(root,'i18n/en.json'))),navStrings={t:key=>navCatalog[key]||key};
  assert.equal(nav.matchCount('About',navStrings,1,'file path'),1);
  assert.equal(nav.matchCount('About',navStrings,1,'start over'),1,'group headings count');
  assert.equal(nav.matchCount('Position',navStrings,2,'apply changes'),1);
  assert.equal(nav.matchCount('Position',navStrings,1,'apply changes'),0,'monitor rows only with a second monitor');
  assert.match(window,/function navUsable\(row\) \{ return !!row && row\.visible && row\.enabled \}/);
  for(const call of ['navStep(delta)','navActivate()','navReset()']) assert.match(window,new RegExp('function '+call.replace(/[()]/g,'\\$&')+' \\{ if \\(navUsable\\(cursor\\)'),call);
  assert.match(field,/interval: 200/);assert.match(field,/onTextEdited:/);assert.doesNotMatch(field,/onTextChanged:/);
  // The kit Dropdown writes value imperatively; selections must restore the
  // binding or external edits stop updating an already-open form.
  assert.match(field,/selection.value = Qt.binding/);
  assert.match(source('settings/MonitorControls.qml'),/monitorPicker.value = Qt.binding/);
  assert.match(source('settings/ElementEditor.qml'),/placement.value = Qt.binding/);
  assert.match(source('Main.qml'),/function showSettings\(tab: string\): void/);
  assert.match(source('Main.qml'),/config: pluginConfig; strings: pluginStrings/);
  assert.match(source('services/Config.qml'),/atomicWrites: true/);
  // Settings reads the same in the panel's menu and Show Apps'.
  const menus=library('panel/MenuModel.js'), menuSettings={...C.validate({}),'context-menu-entries':[]};
  for(const kind of ['panel','showAppsButton']) assert.equal(menus.panelRows(kind,menuSettings,false,k=>k,true).find(r=>r.kind==='settings').text,'menu.settings',kind);
  assert.doesNotMatch(source('panel/MenuModel.js'),/dashSettings/);
});
test('reset aborts on failed backup or an external edit while backing up', () => {
  writerFixture(root,C,library('settings/WritePlan.js'),f=>{
    const bytes='{ "show-tooltip": false }\n';fs.writeFileSync(f.target,bytes);f.load();
    f.config.failBackup=true;f.config.resetDefaults();f.drain();
    assert.equal(fs.readFileSync(f.target,'utf8'),bytes);assert.equal(f.writes.length,0);
    assert.equal(f.config.message,'settings.backupFailed');
    f.config.failBackup=false;const changed='{ "show-tooltip": true, "external": 1 }\n';
    f.config.afterBackup=()=>fs.writeFileSync(f.target,changed);
    f.config.resetDefaults();f.drain();
    assert.equal(fs.readFileSync(f.target,'utf8'),changed);assert.equal(f.config.message,'settings.resetChanged');
    assert.equal(f.writes.length,1);assert.equal(fs.readFileSync(f.writes[0],'utf8'),bytes);
  });
});
test('settings help resolves or is omitted, adds detail, and describes the implemented hot corner', () => {
  const form=library('settings/FormModel.js'), catalog=JSON.parse(fs.readFileSync(path.join(root,'i18n/en.json')));
  const strings={t:key=>catalog[key]||key};
  assert.equal(form.helpText(strings,{help:'settings.help.missing'}),'');
  assert.equal(form.helpText({t:()=>''},{help:'empty'}),'');
  assert.equal(form.helpText(strings,{help:''}),'');
  for(const field of form.controls) {
    const text=form.helpText(strings,field);
    if(!text) continue;
    assert.notEqual(text.toLowerCase().replace(/\W/g,''),catalog[field.label].toLowerCase().replace(/\W/g,''),field.key);
    assert.doesNotMatch(text,/\bJSON\b|AppWell|\n|<[^>]+>/i,field.key);
    assert(text.length<180,field.key+' has concise help');
  }
  for(const key of ['panel-top-bottom-margins','panel-side-margins','panel-top-bottom-padding','panel-side-padding',
    'global-border-radius','isolate-monitors-with-single-panel','animate-app-switch','animate-window-launch']) {
    const help=form.helpText(strings,form.controls.find(c=>c.key===key));
    assert(!help.startsWith('settings.'),key);
  }
  assert.match(catalog['settings.label.stockgs-force-hotcorner'],/top-left screen corner/);
  assert.match(catalog['settings.help.stockgs-force-hotcorner'],/primary screen’s top-left corner.*half a second.*app grid/);
  const panel=fs.readFileSync(path.join(root,'panel/Panel.qml'),'utf8');
  assert.match(panel,/visible: root.visible && root.isPrimary && root.config.get\("stockgs-force-hotcorner"\)/);
  assert.match(panel,/interval: 500/);
});
test('menu row edits pair arrays in a single atomic write and retain existing validation limits', () => {
  const menus=library('settings/MenuList.js'), form=library('settings/FormModel.js');
  for(const key of Object.keys(menus.pairs)) {
    const titles=menus.pairs[key];
    const rows=menus.rows(defaults({[key]:['a','b'],[titles]:['A']}),key);
    deepEqual(rows,[{title:'A',cmd:'a'},{title:'',cmd:'b'}]);
    const edits=[rows[1],{title:'C',cmd:'c'}];
    const changes=menus.changes(key,edits);
    deepEqual(changes,{[key]:['b','c'],[titles]:['','C']});
    assert.equal(form.controls.find(c=>c.key===titles).editorKey,key);
    assert.equal(form.controls.filter(c=>c.editorKey===key).length,2);
    writerFixture(root,C,library('settings/WritePlan.js'),f=>{
      const original={unknown:{keep:1},favorites:['a'],[key]:['a'],[titles]:['A']};
      fs.writeFileSync(f.target,JSON.stringify(original)); f.load();
      f.config.setSettings(changes);
      const external={...original,external:'latest'};
      fs.writeFileSync(f.target,JSON.stringify(external)); f.drain();
      assert.equal(f.writes.length,1);
      deepEqual(JSON.parse(fs.readFileSync(f.target)),{...external,...changes});
      f.config.setSettings(menus.changes(key,[]));f.drain();
      const empty=JSON.parse(fs.readFileSync(f.target));deepEqual(empty[key],[]);deepEqual(empty[titles],[]);
    });
  }
  const longTitle=[{title:'t'.repeat(4096),cmd:'c'.repeat(4096)}];
  assert(menus.valid(longTitle,'panel-context-menu-commands'));
  assert(!menus.valid(longTitle,'context-menu-entries'));
  for(const rows of [[{title:1,cmd:'c'}],[{title:'t',cmd:false}],[{title:'t',cmd:'c'.repeat(4097)}],Array(65).fill({title:'t',cmd:'c'})]) {
    assert(!menus.valid(rows,'panel-context-menu-commands'));
    assert.throws(()=>menus.changes('panel-context-menu-commands',rows));
  }
  deepEqual(menus.changes('context-menu-entries',[{title:'<b>title</b>',cmd:'printf "$HOME"'}]),
    {'context-menu-entries':[{title:'<b>title</b>',cmd:'printf "$HOME"'}]});
  writerFixture(root,C,library('settings/WritePlan.js'),f=>{
    const bytes='{broken'; fs.writeFileSync(f.target,bytes);f.load();
    f.config.setSettings(menus.changes('panel-context-menu-commands',[{title:'t',cmd:'c'}]));f.drain();
    assert.equal(f.writes.length,0);assert.equal(fs.readFileSync(f.target,'utf8'),bytes);
  });
});
test('element editor omits inactive compatibility entries and preserves their contents and positions', () => {
  const elements=library('settings/ElementLayout.js');
  const original=plain(C.monitorDefaults['panel-element-positions']);
  original.forEach((row,i)=>{
    if(elements.omitted.includes(row.element)) {row.visible=!row.visible;row.position=i%2?'centerMonitor':'stackedBR';}
  });
  const visible=plain(elements.indices(original)); assert.equal(visible.length,5);
  const hidden=original.map((r,i)=>elements.omitted.includes(r.element)?i:-1).filter(i=>i>=0);
  let changed=elements.update(original,visible[0],'visible',!original[visible[0]].visible);
  changed=elements.move(changed,visible[0],1);
  changed=elements.move(changed,visible[1],1);
  for(const i of hidden) deepEqual(changed[i],original[i]);
  assert.notDeepEqual(plain(changed),original);
  deepEqual(elements.move(original,visible[0],-1),original);
  deepEqual(elements.move(original,visible.at(-1),1),original);
  for(const i of hidden) {
    deepEqual(elements.update(original,i,'visible',!original[i].visible),original);
    deepEqual(elements.move(original,i,1),original);
  }
  writerFixture(root,C,library('settings/WritePlan.js'),f=>{
    const raw={'panel-element-positions':{'DP-3':original,'DP-4':original},unknown:1};
    fs.writeFileSync(f.target,JSON.stringify(raw));f.load();
    const field=library('settings/FormModel.js').controls.find(c=>c.key==='panel-element-positions');
    f.config.setSetting(field.key,library('settings/FormModel.js').change(raw,field,changed,'DP-3',false));f.drain();
    const saved=JSON.parse(fs.readFileSync(f.target))[field.key];
    deepEqual(saved['DP-4'],original);deepEqual(saved['DP-3'],changed);
    for(const i of hidden) deepEqual(saved['DP-3'][i],original[i]);
  });
});
test('monitor options distinguish edit targets from persistent layout synchronization', () => {
  const form=library('settings/FormModel.js'),catalog=JSON.parse(fs.readFileSync(path.join(root,'i18n/en.json')));
  assert.equal(catalog['settings.allMonitors'],'Apply changes to all monitors');
  assert.equal(catalog['settings.label.panel-element-positions-monitors-sync'],'Sync element positions');
  assert.match(catalog['settings.allMonitorsHelp'],/instead of only the selected monitor/);
  assert.match(catalog['settings.help.panel-element-positions-monitors-sync'],/including when editing one monitor/);
  for(const n of [0,1]) assert(!form.fields('Position','Position',n).some(c=>c.key==='panel-element-positions-monitors-sync'));
  assert(form.fields('Position','Position',2).some(c=>c.key==='panel-element-positions-monitors-sync'));
  const visible=form.tabs.flatMap(tab=>form.groups(tab).flatMap(group=>form.fields(tab,group,2)));
  assert.equal(visible.length,168,'two title arrays share their paired editor');
  assert.equal(new Set(visible.map(c=>c.key)).size,168);
});
test('no QML method, property or signal takes a JavaScript global name, which QML refuses to load', () => {
  // The QML compiler rejects these (Illegal method/property name) and the
  // whole plugin then fails to load; the Qt harness never builds every file.
  const globals=['isNaN','parseFloat','parseInt','isFinite','String','Number','Boolean','Object','Array','Function','Symbol','Date','RegExp','Math','JSON',
    'Error','EvalError','RangeError','ReferenceError','SyntaxError','TypeError','URIError','eval','escape','unescape','encodeURI','encodeURIComponent',
    'decodeURI','decodeURIComponent','Infinity','NaN','undefined','ArrayBuffer','SharedArrayBuffer','DataView','Map','Set','WeakMap','WeakSet','Promise','Reflect','Proxy','Atomics'];
  const files=[]; const walk=dir=>{ for(const e of fs.readdirSync(dir,{withFileTypes:true})) { if(e.name.startsWith('.')||e.name==='node_modules') continue; const f=path.join(dir,e.name); if(e.isDirectory()) walk(f); else if(f.endsWith('.qml')) files.push(f) } };
  walk(root); assert(files.length>30);
  const bad=[];
  for(const f of files) {
    const text=fs.readFileSync(f,'utf8');
    for(const m of text.matchAll(/^\s*(?:function\s+(\w+)\s*\(|(?:readonly\s+|required\s+|default\s+)*property\s+[\w.<>]+\s+(\w+)|signal\s+(\w+))/gm)) {
      const name=m[1]||m[2]||m[3]; if(globals.includes(name)) bad.push(path.relative(root,f)+': '+name);
    }
  }
  deepEqual(bad,[]);
});
test('the changed view lists only changed settings, on their pages, and keeps a reset row until it is left', () => {
  const F=library('settings/FormModel.js'), nav=library('settings/Nav.js'), Lk=library('settings/Looks.js');
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'i18n/en.json'))), strings={t:key=>catalog[key]||key};
  const settings=C.validate({intellihide:true,'show-apps-click':{action:'command',command:'ls'},'dot-position':'TOP'});
  // What changed, in page order, one key per setting; the count is its length.
  deepEqual(plain(F.changedKeys(settings,1,'*','DP-3')),['show-apps-click','dot-position','intellihide']); // Position, Style, Behavior
  assert.equal(F.changedCount(settings,1,'*','DP-3'),3); deepEqual(plain(F.changedKeys(C.validate({}),1,'*','DP-3')),[]);
  // Each page counts the changed settings it shows: Overview its tile and drawer row, not the look.
  const shown=nav.grown({},F.changedKeys(settings,1,'*','DP-3'));
  const counts=Object.fromEntries(nav.order.map(tab=>[tab,nav.matchCount(tab,strings,2,'',shown)]));
  deepEqual(counts,{Overview:2,Position:1,Style:1,Behavior:1,Action:0,'Fine-Tune':0,About:0});
  assert.equal(nav.matchCount('Position',strings,2,'',{}),0,'monitor rows are no change');
  // With a search too, both must match.
  assert.equal(nav.matchCount('Behavior',strings,1,'intellihide',shown),1); assert.equal(nav.matchCount('Behavior',strings,1,'isolate',shown),0);
  assert.equal(nav.matchCount('Behavior',strings,1,'',null),0,'neither: no counts');
  // The view only grows, and an unchanged one is the same object, so its bindings settle.
  assert.equal(nav.grown(shown,['intellihide']),shown);
  const more=nav.grown(shown,['intellihide','panel-sizes']); assert.notEqual(more,shown); assert(more['panel-sizes']&&more.intellihide&&!shown['panel-sizes']);
  assert(nav.shows(shown,['show-apps-click'])); assert(!nav.shows(shown,['panel-sizes'])); assert(!nav.shows(shown,[]));
  assert(nav.shows(shown,Lk.keys),'the look shows with intellihide, a look key'); assert(!nav.shows({'show-apps-click':true},Lk.keys));
  // c goes in while something is changed; in the view Escape comes back out.
  const last=state=>nav.legend(null,state).slice(-2).map(k=>k.keys.join('')+':'+k.label);
  deepEqual(last({changed:false}),['/:settings.key.search','esc:settings.key.close']);
  deepEqual(last({changed:true}),['c:settings.key.changed','esc:settings.key.close']);
  deepEqual(last({changed:true,changedOnly:true}),['/:settings.key.search','esc:settings.key.showAll']);
  for(const k of ['settings.key.changed','settings.key.showAll','settings.showingOne','settings.showingMany','settings.showingNone','settings.changedNoneNote']) assert(catalog[k],k);
  // Rows: a setting row, a tile and the look name what they edit; parts of a row and monitor rows name nothing.
  const src=f=>fs.readFileSync(path.join(root,f),'utf8'), window=src('settings/SettingsWindow.qml');
  assert.match(src('settings/SettingField.qml'),/changeKeys: \[field\.key\]/); assert.match(src('settings/SettingsOverview.qml'),/changeKeys: \[modelData\.key\]/);
  assert.match(src('settings/LookField.qml'),/changeKeys: Looks\.keys/);
  assert.match(src('settings/ui/NavRow.qml'),/nav\.changedOnly === true && changeKeys\.length > 0 && !nav\.changedShows\(changeKeys\)/);
  assert.match(src('settings/MonitorControls.qml'),/root\.nav\.searching === true \|\| root\.nav\.changedOnly === true/);
  assert.match(window,/visible: root\.tab === "Position" && !searchEmpty && !\(root\.changedOnly && root\.monitors\.length <= 1\)/,'one monitor: no Monitors group in the view');
  // The window: taken on entry from what changed, grown meanwhile, gone on leaving or reopening.
  assert.match(window,/onChangedKeysChanged: if \(changedOnly\) changedShown = Nav\.grown\(changedShown, changedKeys\)/);
  assert.match(window,/if \(on === changedOnly \|\| \(on && changedCount === 0\)\) return\s+changedShown = on \? Nav\.grown\(\{\}, changedKeys\) : \(\{\}\)/);
  assert.match(window,/function backOut\(\) \{ if \(changedOnly\) showChanged\(false\); else close\(\) \}/);
  assert.match(window,/event\.key === Qt\.Key_Escape\) \{ root\.backOut\(\)/); assert.match(window,/event\.text === "c" && !ctrl && !alt\) \{ root\.showChanged\(!root\.changedOnly\)/);
  assert.match(window,/changedOnly = false; changedShown = \(\{\}\)\n\s+cursor = null/,'opening starts on every setting');
  assert.match(window,/readonly property bool filtering: searching \|\| changedOnly/); assert.match(window,/function pageShows\(name\) \{ return !filtering/);
  assert.match(window,/Nav\.matchCount\(name, strings, monitors\.length, term, changedOnly \? changedShown : null\)/);
  assert.match(window,/onClicked: \{ root\.showChanged\(!root\.changedOnly\); root\.navTakeFocus\(\) \}/);
  assert.match(window,/visible: root\.changedCount > 0 \|\| on/,'the pill stays while the view is open');
});
test('settings IPC closes and toggles the window and debugState exposes nested open/tab state', () => {
  const source=fs.readFileSync(path.join(root,'Main.qml'),'utf8');
  for(const signature of ['closeSettings\\(\\): void','toggleSettings\\(tab: string\\): void']) assert.match(source,new RegExp('function '+signature));
  const preferences={opened:false,tab:'Position',show(tab){this.tab=tab||this.tab;this.opened=true;},close(){this.opened=false;}};
  const context={preferences,closePanelPopups(){},appGrid:null,root:{panels:[],appGrid:null,badges:{}},windowFader:{fadedWindows:[]},
    pluginConfig:{get:()=>false},defaultPins:{defaults:[]},clockLifecycle:{hidden:false},appsKey:{status:{enabled:true,state:'plugin',error:''}},drawerClick:{status:{action:'drawer',plan:'drawer'}},badgeLoader:{item:null},themeSurface:{}};
  vm.createContext(context);
  for(const name of ['showSettings','toggleSettings','closeSettings']) {
    const match=source.match(new RegExp('^    function '+name+'\\([^\\n]*?(?:\\{[^\\n]*\\}|\\{[\\s\\S]*?^    \\})','m'));
    assert(match,name);vm.runInContext(match[0],context);
  }
  context.toggleSettings('About');assert.equal(preferences.opened,true);assert.equal(preferences.tab,'About');
  context.toggleSettings('Style');assert.equal(preferences.opened,false);assert.equal(preferences.tab,'About');
  context.toggleSettings('');assert.equal(preferences.opened,true);assert.equal(preferences.tab,'About');
  context.closeSettings();context.closeSettings();assert.equal(preferences.opened,false);
  const debug=source.match(/function debugState\(\): string \{([\s\S]*?)^        \}/m); assert(debug);
  vm.runInContext('function debugState() {'+debug[1]+'}',context);
  deepEqual(JSON.parse(context.debugState()).settings,{open:false,tab:'About',changedOnly:false,keyboard:false});
  deepEqual(JSON.parse(context.debugState()).appsKey,{enabled:true,state:'plugin',error:''});
  context.showSettings('Fine-Tune');deepEqual(JSON.parse(context.debugState()).settings,{open:true,tab:'Fine-Tune',changedOnly:false,keyboard:false});
  preferences.changedOnly=true; assert.equal(JSON.parse(context.debugState()).settings.changedOnly,true);
});
test('every settings tab builds real Qt controls; About, menu edits and monitor changes work without writes on open', () => {
  const output=settingsUiFixture(root);
  for(const tab of library('settings/FormModel.js').tabs) assert(output.includes(`test_tabs(${tab})`),tab+' was constructed');
});
test('a real taskbar drag keeps its grab point, opens the room under the ghost, cancels when pulled off and lands without a blank slot', () => {
  const output=dragUiFixture(root);
  for(const name of ['grab_offset_row_and_drop','pulled_off_cancels','overshoot_still_drops','with_motion_landing_does_not_slide_or_fade','new_drag_right_after_landing_survives','ungrouped_window_moves_its_app','running_app_goes_back_unpinned'])
    assert.match(output,new RegExp('PASS.*test_\\d_'+name),name);
});
console.log(`\n${count} tests passed`);
