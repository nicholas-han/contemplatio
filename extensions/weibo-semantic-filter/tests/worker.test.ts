import 'fake-indexeddb/auto';import {test}from'node:test';import assert from'node:assert/strict';
import {DEFAULT_SETTINGS}from'../src/shared/settings';import type{WeiboPost}from'../src/shared/types';
test('worker enforces sender boundary, protects key, bypasses whitelist, caches model responses and ignores cancelled results',async()=>{
  let listener:any;let access='';const local:Record<string,unknown>={},session:Record<string,unknown>={};let calls=0;let resolveSlow:(r:Response)=>void=()=>{};let slow=false;
  const area=(data:Record<string,unknown>)=>({get:async(keys:string[])=>Object.fromEntries(keys.map(k=>[k,data[k]])),set:async(value:object)=>Object.assign(data,value),setAccessLevel:async({accessLevel}:{accessLevel:string})=>{access=accessLevel;}});
  Object.assign(globalThis,{chrome:{runtime:{id:'test-extension',getURL:(p:string)=>'chrome-extension://test-extension/'+p,onMessage:{addListener:(fn:any)=>{listener=fn;}}},storage:{local:area(local),session:area(session)},permissions:{contains:async()=>true},tabs:{query:async()=>[],sendMessage:async()=>{}}}});
  const good={model:'jev-test',answers:{life_philosophy:{type:'noul',noul:.95},poetry_or_sentiment:{type:'noul',noul:.1},concrete_business_economic_information:{type:'noul',noul:.1},investment_philosophy:{type:'noul',noul:.1}}};
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;if(slow)return new Promise(r=>{resolveSlow=r;});return new Response(JSON.stringify(good));};
  await import('../src/background/service-worker');
  const ui={id:'test-extension',url:'chrome-extension://test-extension/options.html'};
  const page={id:'test-extension',url:'https://weibo.com/',frameId:0,tab:{id:1}};
  const send=(message:unknown,sender:any=ui)=>new Promise<any>(resolve=>listener(message,sender,resolve));
  try{
    const initial=await send({type:'getSettings'});assert.equal(access,'TRUSTED_CONTEXTS');
    assert.equal((await send({type:'saveSettings',settings:DEFAULT_SETTINGS},page)).ok,false);
    assert.equal((await send({type:'getSettings'},{id:'evil',url:'https://weibo.com/'})).ok,false);
    const saved=await send({type:'saveSettings',settings:{...initial.data.settings,semanticEnabled:true,globalRules:{sports:false,sceneryPhotos:false,namedPeople:false}},apiKey:'private-test-key'});assert.equal(saved.ok,true);
    const s=saved.data.settings;
    const whitespaceKey=await send({type:'saveSettings',settings:{...s,endpoint:'https://other.example/api'},apiKey:'   '});
    assert.equal(whitespaceKey.ok,false);assert.match(whitespaceKey.error,/重新填写/);
    assert.equal((await send({type:'getSettings'})).data.settings.endpoint,s.endpoint);
    assert.equal(JSON.stringify((await send({type:'getSettings'},page)).data).includes('private-test-key'),false);
    const p:WeiboPost={postId:'A1',authorId:'2820792015',authorName:'样本',text:'人生的风雨',repostText:'',visibleContext:'',canonicalUrl:'https://weibo.com/2820792015/A1',postType:'original',hasMedia:false,hasLinkCard:false,isTextTruncated:false,contextCompleteness:'complete',elementFingerprint:'a'};
    const msg=(post:WeiboPost)=>({type:'decide',post,revision:s.revision,sessionId:'session'});
    const outsider=await send(msg({...p,authorId:'999999999',canonicalUrl:'https://weibo.com/999999999/A1'}),page);
    assert.equal(outsider.data.decision.state,'collapsed');assert.equal(outsider.data.decision.applyInShadow,true);assert.equal(calls,0);
    const whitelist={...p,authorId:'2173738960',canonicalUrl:'https://weibo.com/2173738960/A1'};
    assert.equal((await send(msg(whitelist),page)).data.decision.state,'visible');assert.equal(calls,0);
    const [a,b]=await Promise.all([send(msg(p),page),send(msg(p),page)]);assert.equal(a.data.decision.state,'collapsed');assert.equal(b.data.decision.state,'collapsed');assert.equal(calls,1);
    assert.equal((await send(msg(p),page)).data.decision.cached,true);assert.equal(calls,1);
    slow=true;const pending=send(msg({...p,text:'另一个文本'}),page);
    while(calls<2)await new Promise(r=>setTimeout(r,1));
    const changed=await send({type:'saveSettings',settings:{...s,enabled:false}});assert.equal(changed.ok,true);
    resolveSlow(new Response(JSON.stringify(good)));const cancelled=await pending;assert.equal(cancelled.data.decision.state,'visible');
    assert.equal((await send({type:'saveSettings',settings:s})).ok,false);
  }finally{globalThis.fetch=originalFetch;}
});
