import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {DEFAULT_SETTINGS} from '../src/shared/settings';
const bundle=(await build({entryPoints:[new URL('../src/content/index.ts',import.meta.url).pathname],bundle:true,write:false,format:'iife',target:'chrome120'})).outputFiles[0]!.text;
const html='<article><header><a href="/u/2820792015">王文</a><a href="/2820792015/Test1">今天</a></header><div class="wbpro-feed-content"><div class="wbpro-feed-ogText"><div class="_wbtext_test_1">内容</div></div></div></article>';
async function until(fn:()=>boolean){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}assert.ok(fn(),'condition timed out');}
function harness(decide:()=>Promise<unknown>,body=html,settingsOverride={},configure?:(w:any)=>void){
  const dom=new JSDOM(body,{url:'https://weibo.com/',runScripts:'outside-only'}),w=dom.window;
  const listeners=new Set<any>();let calls=0;
  (w as any).chrome={runtime:{id:'fixture',sendMessage:async(message:any)=>message.type==='getSettings'?{ok:true,data:{settings:{...structuredClone(DEFAULT_SETTINGS),debug:false,...settingsOverride}}}:(calls++,await decide()),onMessage:{addListener:(fn:any)=>listeners.add(fn),removeListener:(fn:any)=>listeners.delete(fn)}}};
  (w as any).structuredClone=structuredClone;
  (w as any).IntersectionObserver=class{constructor(private callback:any){}observe(card:Element){this.callback([{target:card,isIntersecting:true}]);}unobserve(){}disconnect(){}};
  configure?.(w);w.eval(bundle);
  return {dom,card:w.document.querySelector('article')!,calls:()=>calls,command:(type:string)=>{for(const fn of listeners)fn({type},{id:'fixture'},()=>{});}};
}
test('pending, RPC failure, recovery and removed labels all remain explicit',async()=>{
  let resolve!:(v:unknown)=>void,fail=true;
  const h=harness(()=>fail?new Promise(r=>{resolve=r;}):Promise.resolve({ok:true,data:{revision:DEFAULT_SETTINGS.revision,decision:{state:'visible',source:'protected',reason:'保留内容'}}}));
  try{
    await until(()=>h.calls()===1);assert.match(h.card.textContent!,/正在判断/);
    resolve({ok:false,error:'network'});await until(()=>h.card.textContent!.includes('扩展连接暂时不可用'));
    assert.equal(h.card.hasAttribute('data-wsf-state'),false);
    h.card.querySelector('[data-wsf-control="bar"]')!.remove();await until(()=>h.card.textContent!.includes('扩展连接暂时不可用'));assert.equal(h.calls(),1);
    fail=false;h.command('rescan');await until(()=>h.card.textContent!.includes('保留内容'));
    h.card.querySelector('[data-wsf-control="bar"]')!.remove();await until(()=>h.card.textContent!.includes('保留内容'));assert.equal(h.calls(),2);
    h.command('expandAll');assert.equal(h.card.querySelector('[data-wsf-control="bar"]'),null);
  }finally{h.dom.window.close();}
});
test('unknown markup gets a safe status and class-only hydration triggers recognition',async()=>{
  const h=harness(async()=>({ok:true,data:{revision:DEFAULT_SETTINGS.revision,decision:{state:'visible',source:'protected',reason:'完整识别'}}}),html.replace('_wbtext_test_1','loading'));
  try{
    await until(()=>h.card.textContent!.includes('无法完整识别'));assert.equal(h.calls(),0);
    h.card.querySelector('.loading')!.className='_wbtext_test_1';await until(()=>h.card.textContent!.includes('完整识别')&&h.calls()===1);
    await until(()=>h.card.textContent!.includes('建议保留：完整识别'));
    assert.equal(h.card.querySelectorAll('[data-wsf-control="bar"]').length,1);
  }finally{h.dom.window.close();}
});
test('a recycled card ignores an old collapse result after its text changes',async()=>{
  const pending:Array<(value:unknown)=>void>=[];
  const h=harness(()=>new Promise(resolve=>pending.push(resolve)));
  try{
    await until(()=>pending.length===1);
    h.card.querySelector('._wbtext_test_1')!.textContent='新的正文';
    await until(()=>pending.length===2);
    pending[1]!({ok:true,data:{revision:DEFAULT_SETTINGS.revision,decision:{state:'visible',source:'protected',reason:'新内容保留'}}});
    await until(()=>h.card.textContent!.includes('新内容保留'));
    pending[0]!({ok:true,data:{revision:DEFAULT_SETTINGS.revision,decision:{state:'collapsed',source:'model',reason:'旧内容折叠'}}});
    await new Promise(r=>setTimeout(r,20));
    assert.match(h.card.textContent!,/新内容保留/);assert.doesNotMatch(h.card.textContent!,/旧内容折叠/);
  }finally{h.dom.window.close();}
});
test('vision retry success after 55 seconds is still applied, while a hung RPC expires',async()=>{
  let resolve!:(value:unknown)=>void,now=0,next=0;
  const timers=new Map<number,{at:number;fn:()=>void}>();
  const advance=(ms:number)=>{now+=ms;for(const [id,t] of timers)if(t.at<=now){timers.delete(id);t.fn();}};
  const h=harness(()=>new Promise(r=>resolve=r),html,{timeoutMs:20000,visionEnabled:true},w=>{
    w.setTimeout=(fn:()=>void,delay:number)=>{const id=++next;timers.set(id,{at:now+delay,fn});return id;};w.clearTimeout=(id:number)=>timers.delete(id);
  });
  try{
    await until(()=>h.calls()===1);advance(70000);await Promise.resolve();
    assert.match(h.card.textContent!,/正在判断/);
    resolve({ok:true,data:{revision:DEFAULT_SETTINGS.revision,decision:{state:'visible',source:'protected',reason:'图片请求完成'}}});
    await until(()=>h.card.textContent!.includes('图片请求完成'));
    h.command('rescan');await until(()=>h.calls()===2);advance(100000);
    await until(()=>h.card.textContent!.includes('扩展连接暂时不可用'));
  }finally{h.dom.window.close();}
});
