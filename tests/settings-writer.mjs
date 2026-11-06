import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';

// Exercise Config.qml's actual JavaScript entry points and signal handlers.
// Only FileView's IO is adapted to Node: temp + rename, under a private HOME.
// This deliberately does not launch a second shell or touch the session HOME.
export function writerFixture(repo, Config, Writes, run) {
  const home = fs.mkdtempSync(path.join(repo, 'tests/.settings-home-form-'));
  const target = path.join(home, '.config/omarchy/familiar-dock.json');
  fs.mkdirSync(path.dirname(target), {recursive:true});
  const source = fs.readFileSync(path.join(repo,'services/Config.qml'),'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    s=>s.replace(/[^\n]/g,' '));
  function block(start) {
    let i=code.indexOf('{',start), depth=1, end=i+1;
    while(depth && end<code.length) { if(code[end]==='{') depth++; if(code[end]==='}') depth--; end++; }
    return source.slice(i+1,end-1);
  }
  const queue=[], writes=[];
  const context={Logic:Config,Writes,console,path:target,settings:Config.validate({}),raw:{},valid:true,
    sourceText:'{}',message:'',messageDetail:'',pendingOperation:'change',resetSnapshot:null,
    backupPath:'',transferPath:'',transferMode:'',warned:false,pendingSettings:null,pendingRemovals:[],readAttempt:0,systemDefaults:[],importReview:null};
  context.root=context;
  context.Quickshell={env:key=>key==='HOME'?home:''};
  context.Qt={callLater:fn=>queue.push(fn)};
  const atomic=(file,text)=>{ assert(file.startsWith(home+path.sep),'test IO must stay inside private HOME'); fs.writeFileSync(file+'.tmp',text,{mode:0o600}); fs.renameSync(file+'.tmp',file); writes.push(file); };
  const load=()=>context.accept(fs.existsSync(target)?fs.readFileSync(target,'utf8'):'{}');
  context.file={reload:()=>queue.push(load),setText:text=>atomic(target,text)};
  context.retryRead={restart:()=>queue.push(load)};
  vm.createContext(context);
  for(const match of source.matchAll(/^    function ([\w]+)\([^\n]*/gm)) {
    const body=block(match.index);
    vm.runInContext(match[0].slice(4).replace(/\{.*$/,'')+'{'+body+'}',context);
  }
  const savedStart=source.indexOf('onSaved:',source.indexOf('id: backupFile'));
  const failedStart=source.indexOf('onSaveFailed:',source.indexOf('id: backupFile'));
  context.backupFile={setText:text=>{
    if(context.failBackup) {vm.runInContext("(function(){"+block(failedStart)+"})()",context);return;}
    atomic(context.backupPath,text);
    if(context.afterBackup)context.afterBackup();
    vm.runInContext("(function(){"+block(savedStart)+"})()",context);
  }};
  const drain=()=>{let limit=100;while(queue.length) {if(--limit===0) throw Error('writer queue loop');queue.shift()();}};
  try {run({home,target,config:context,writes,drain,load:()=>{load();drain();}});}
  finally {fs.rmSync(home,{recursive:true,force:true});}
}
