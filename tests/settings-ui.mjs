import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Build the actual tab components and installed UI controls without loading
// Quickshell or any desktop services. Theme/locale tokens are deterministic.
// All writable Qt state is isolated inside a disposable, private HOME.
export function settingsUiFixture(repo) {
  const dir = fs.mkdtempSync(path.join(repo, 'tests/.settings-home-ui-'));
  const copy = (source, target) => {
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.copyFileSync(source, target);
  };
  try {
    // The pages and their row kit (settings/ui); the window itself needs a
    // compositor and is checked by source assertions instead.
    for (const file of fs.readdirSync(path.join(repo,'settings'),{recursive:true})) {
      const source=path.join(repo,'settings',file);
      if (file !== 'SettingsWindow.qml' && fs.statSync(source).isFile()) copy(source,path.join(dir,'settings',file));
    }
    for (const file of ['Config.js','Defaults.js','Chord.js','AppsKey.js','DrawerClick.js']) copy(path.join(repo,'services',file),path.join(dir,'services',file));
    const commons = path.join(dir,'imports/qs/Commons'), ui = path.join(dir,'imports/qs/Ui');
    for (const file of ['Style.qml','Color.qml','Util.qml','I18n.qml']) copy(path.join(repo,'tests/settings-ui',file),path.join(commons,file));
    for (const file of ['Border.qml','BorderGeometry.js']) copy(path.join('/usr/share/omarchy/shell/Commons',file),path.join(commons,file));
    fs.writeFileSync(path.join(commons,'qmldir'),'module qs.Commons\n'+['Style','Color','Util','I18n','Border'].map(n=>`singleton ${n} 1.0 ${n}.qml`).join('\n')+'\n');
    const types = ['Button','ButtonGroup','Dropdown','SearchableDropdown','Toggle','ToggleSwitch','NumberField','PanelSlider','TextField',
      'BorderSurface','BorderOverlay','PanelSectionHeader','PanelSeparator'];
    for (const type of types) copy(`/usr/share/omarchy/shell/Ui/${type}.qml`,path.join(ui,`${type}.qml`));
    fs.writeFileSync(path.join(ui,'qmldir'),'module qs.Ui\n'+types.map(n=>`${n} 1.0 ${n}.qml`).join('\n')+'\n');
    fs.writeFileSync(path.join(dir,'Catalog.js'),'.pragma library\nvar entries = '+fs.readFileSync(path.join(repo,'i18n/en.json'),'utf8'));
    copy(path.join(repo,'tests/settings-ui/tst_settings.qml'),path.join(dir,'tst_settings.qml'));
    const home=path.join(dir,'home'); fs.mkdirSync(home);
    const result=spawnSync('/usr/lib/qt6/bin/qmltestrunner',['-input',dir,'-import',path.join(dir,'imports')],{
      env:{...process.env,HOME:home,XDG_CONFIG_HOME:path.join(home,'.config'),XDG_CACHE_HOME:path.join(home,'.cache'),
        QT_QPA_PLATFORM:'offscreen',QT_QPA_PLATFORMTHEME:'generic',QT_QUICK_CONTROLS_STYLE:'Basic',QT_QUICK_BACKEND:'software'},
      encoding:'utf8',timeout:20000,maxBuffer:4*1024*1024
    });
    const output=(result.stdout||'')+(result.stderr||'');
    assert.equal(result.status,0,output || String(result.error));
    assert.doesNotMatch(output,/QWARN|TypeError|ReferenceError|Unable to assign|Binding loop/i);
    return output;
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
