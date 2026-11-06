import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Run tests/drag-ui/tst_drag.qml against the real taskbar files, offscreen,
// with stand-in Commons tokens and a stand-in tooltip (no Quickshell).
export function dragUiFixture(repo) {
  const dir = fs.mkdtempSync(path.join(repo, 'tests/.drag-ui-'));
  const copy = (source, target) => {
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.copyFileSync(source, target);
  };
  try {
    for (const file of ['Taskbar.qml','AppButton.qml','Indicator.qml','Indicator.js','Layout.js','Hover.js','DragLayout.js'])
      copy(path.join(repo,'panel',file),path.join(dir,'panel',file));
    copy(path.join(repo,'tests/drag-ui/Tooltip.qml'),path.join(dir,'panel/Tooltip.qml'));
    for (const file of ['AppModel.js','Config.js','Defaults.js','Chord.js','AppsKey.js','DrawerClick.js']) copy(path.join(repo,'services',file),path.join(dir,'services',file));
    const commons = path.join(dir,'imports/qs/Commons');
    for (const file of ['Style.qml','Color.qml']) copy(path.join(repo,'tests/drag-ui',file),path.join(commons,file));
    fs.writeFileSync(path.join(commons,'qmldir'),'module qs.Commons\nsingleton Style 1.0 Style.qml\nsingleton Color 1.0 Color.qml\n');
    for (const file of fs.readdirSync(path.join(repo,'tests/drag-ui')).filter(n=>n.startsWith('tst_')||n.startsWith('icon-')))
      copy(path.join(repo,'tests/drag-ui',file),path.join(dir,file));
    const home=path.join(dir,'home'); fs.mkdirSync(home);
    const result=spawnSync('/usr/lib/qt6/bin/qmltestrunner',['-input',dir,'-import',path.join(dir,'imports')],{
      env:{...process.env,HOME:home,XDG_CONFIG_HOME:path.join(home,'.config'),XDG_CACHE_HOME:path.join(home,'.cache'),
        QT_QPA_PLATFORM:'offscreen',QT_QPA_PLATFORMTHEME:'generic',QT_QUICK_BACKEND:'software'},
      encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024
    });
    const output=(result.stdout||'')+(result.stderr||'');
    assert.equal(result.status,0,output || String(result.error));
    assert.doesNotMatch(output,/QWARN|TypeError|ReferenceError|Unable to assign|Binding loop/i);
    return output;
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
