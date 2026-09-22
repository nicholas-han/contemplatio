import 'fake-indexeddb/auto';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS} from '../src/shared/settings';
test('a concurrent success cannot cancel a server rate-limit cooldown',async()=>{
  let listener:any;const local:Record<string,unknown>={},session:Record<string,unknown>={};
  const area=(data:Record<string,unknown>)=>({get:async(keys:string[])=>Object.fromEntries(keys.map(k=>[k,data[k]])),set:async(value:object)=>Object.assign(data,value),setAccessLevel:async()=>{}});
  Object.assign(globalThis,{chrome:{runtime:{id:'test',getURL:(p:string)=>'chrome-extension://test/'+p,onMessage:{addListener:(fn:any)=>listener=fn}},storage:{local:area(local),session:area(session)},permissions:{contains:async()=>true},tabs:{query:async()=>[],sendMessage:async()=>{}}}});
  const pending:Array<(value:Response)=>void>=[],originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Promise(resolve=>pending.push(resolve));
  try{
    await import('../src/background/service-worker');
    const ui={id:'test',url:'chrome-extension://test/options.html'},page={id:'test',url:'https://weibo.com/',frameId:0,tab:{id:1}};
    const send=(message:unknown,sender:any=ui)=>new Promise<any>(resolve=>listener(message,sender,resolve));
    const saved=await send({type:'saveSettings',settings:{...structuredClone(DEFAULT_SETTINGS),semanticEnabled:true},apiKey:'test-only'});
    const decide=(id:string)=>send({type:'decide',sessionId:'session',revision:saved.data.settings.revision,post:{postId:id,authorId:'2173738960',authorName:'样本',text:id,repostText:'',visibleContext:'',canonicalUrl:'https://weibo.com/2173738960/'+id,postType:'original',hasMedia:false,hasLinkCard:false,isTextTruncated:false,contextCompleteness:'complete',elementFingerprint:id}},page);
    const first=decide('A'),second=decide('B');
    while(pending.length<2)await new Promise(r=>setTimeout(r,1));
    pending[0]!(new Response('',{status:429,headers:{'retry-after':'60'}}));await first;
    const until=(await send({type:'getSettings'})).data.breaker.until;assert.ok(until>Date.now());
    pending[1]!(new Response(JSON.stringify({model:'fixture',answers:{sports_content:{type:'noul',noul:.1}}})));await second;
    assert.equal((await send({type:'getSettings'})).data.breaker.until,until);
    assert.match((await decide('C')).data.decision.reason,/冷却/);assert.equal(pending.length,2);
  }finally{globalThis.fetch=originalFetch;}
});
