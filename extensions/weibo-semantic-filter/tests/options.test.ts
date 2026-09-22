import assert from 'node:assert/strict';import {test} from 'node:test';import {readFileSync} from 'node:fs';
import {build} from 'esbuild';import {JSDOM} from 'jsdom';import {DEFAULT_SETTINGS,type Settings} from '../src/shared/settings';
test('options form locks across permission and save, ignores duplicates and restores persisted values on failure',async()=>{
  const bundle=(await build({entryPoints:[new URL('../src/ui/options.ts',import.meta.url).pathname],bundle:true,write:false,format:'iife'})).outputFiles[0]!.text;
  const dom=new JSDOM(readFileSync(new URL('../src/ui/options.html',import.meta.url),'utf8'),{url:'https://fixture.invalid/',runScripts:'outside-only'}),w=dom.window;
  let stored=structuredClone(DEFAULT_SETTINGS),grant!:(value:boolean)=>void,permissionCalls=0;
  const saves:Array<{settings:Settings;finish:(ok:boolean)=>void}>=[];
  (w as any).structuredClone=structuredClone;
  (w as any).chrome={permissions:{request:()=>{permissionCalls++;return new Promise<boolean>(resolve=>grant=resolve);}},runtime:{sendMessage:async(message:any)=>{
    if(message.type==='getSettings')return {ok:true,data:{settings:structuredClone(stored),hasKey:true,stats:{calls:0,cacheHits:0,errors:0}}};
    return new Promise(resolve=>saves.push({settings:message.settings,finish:ok=>{if(ok){stored={...message.settings,revision:'revision-'+saves.length};resolve({ok:true,data:{settings:stored,hasKey:true}});}else resolve({ok:false,error:'测试保存失败'});}}));
  }}};
  const until=async(fn:()=>boolean)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.ok(fn());};
  const input=(id:string)=>w.document.getElementById(id) as HTMLInputElement;
  const form=w.document.getElementById('settings-form')!,submit=()=>form.dispatchEvent(new w.Event('submit',{cancelable:true}));
  try{
    w.eval(bundle);assert.equal(input('enabled').disabled,true);submit();assert.equal(saves.length,0);await until(()=>!input('enabled').disabled);
    input('semanticEnabled').checked=true;input('mode').value='active';submit();
    assert.equal(permissionCalls,1);assert.equal(input('mode').disabled,true);assert.equal(input('apiKey').disabled,true);assert.equal(saves.length,0);
    submit();assert.equal(permissionCalls,1);grant(true);await until(()=>saves.length===1);submit();assert.equal(saves.length,1);
    saves[0]!.finish(true);await until(()=>!input('enabled').disabled);assert.equal(input('mode').value,'active');
    input('mode').value='shadow';submit();grant(true);await until(()=>saves.length===2);assert.equal(saves[1]!.settings.revision,'revision-1');
    saves[1]!.finish(false);await until(()=>!input('enabled').disabled);assert.equal(input('mode').value,'active');assert.match(w.document.getElementById('status')!.textContent!,/保存失败/);
    input('mode').value='shadow';submit();grant(false);await until(()=>!input('enabled').disabled);assert.equal(saves.length,2);assert.equal(input('mode').value,'active');assert.match(w.document.getElementById('status')!.textContent!,/未授权/);
  }finally{w.close();}
});
