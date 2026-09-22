import assert from 'node:assert/strict';import {test} from 'node:test';
import {readFileSync} from 'node:fs';import {build} from 'esbuild';import {JSDOM} from 'jsdom';
import {DEFAULT_SETTINGS,type Settings} from '../src/shared/settings';
test('popup prevents overlapping saves, uses refreshed revisions and restores failed choices',async()=>{
  const bundle=(await build({entryPoints:[new URL('../src/ui/popup.ts',import.meta.url).pathname],bundle:true,write:false,format:'iife'})).outputFiles[0]!.text;
  const dom=new JSDOM(readFileSync(new URL('../src/ui/popup.html',import.meta.url),'utf8'),{url:'https://fixture.invalid/',runScripts:'outside-only'}),w=dom.window;
  let stored=structuredClone(DEFAULT_SETTINGS);const saves:Array<{settings:Settings;finish:(ok:boolean)=>void}>=[];
  (w as any).chrome={runtime:{sendMessage:async(message:any)=>{
    if(message.type==='getSettings')return {ok:true,data:{settings:structuredClone(stored),breaker:{until:0},hasKey:false}};
    return new Promise(resolve=>saves.push({settings:message.settings,finish:ok=>{if(ok){stored={...message.settings,revision:'revision-'+saves.length};resolve({ok:true,data:{settings:stored}});}else resolve({ok:false,error:'测试保存失败'});}}));
  },openOptionsPage:async()=>{}},tabs:{query:async()=>[]}};
  const until=async(fn:()=>boolean)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.ok(fn());};
  const enabled=w.document.querySelector<HTMLInputElement>('#enabled')!,mode=w.document.querySelector<HTMLSelectElement>('#mode')!;
  const change=(node:Element)=>node.dispatchEvent(new w.Event('change'));
  try{
    w.eval(bundle);assert.equal(enabled.disabled,true);await until(()=>!enabled.disabled);
    enabled.checked=false;change(enabled);assert.equal(enabled.disabled,true);assert.equal(mode.disabled,true);assert.equal(saves.length,1);
    mode.value='active';change(mode);assert.equal(saves.length,1);
    saves[0]!.finish(true);await until(()=>!enabled.disabled);assert.equal(mode.value,'shadow');assert.equal(enabled.checked,false);
    mode.value='active';change(mode);assert.equal(saves[1]!.settings.revision,'revision-1');
    saves[1]!.finish(false);await until(()=>!enabled.disabled);assert.equal(mode.value,'shadow');assert.match(w.document.querySelector('#status')!.textContent!,/保存失败/);
    mode.value='active';change(mode);saves[2]!.finish(true);await until(()=>!enabled.disabled);assert.equal(mode.value,'active');assert.equal(stored.mode,'active');
  }finally{w.close();}
});
