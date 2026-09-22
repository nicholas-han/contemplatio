import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ACCOUNTS,DEFAULT_SETTINGS} from '../src/shared/settings';
import type {WeiboPost} from '../src/shared/types';
test('worker applies sports to all four accounts; vision requires consent, protects substantive posts, caches and fails open',async()=>{
  let listener:any;const local:Record<string,unknown>={},session:Record<string,unknown>={};
  const area=(data:Record<string,unknown>)=>({get:async(keys:string[])=>Object.fromEntries(keys.map(k=>[k,data[k]])),set:async(value:object)=>Object.assign(data,value),setAccessLevel:async()=>{}});
  Object.assign(globalThis,{chrome:{runtime:{id:'global-test',getURL:(p:string)=>'chrome-extension://global-test/'+p,onMessage:{addListener:(fn:any)=>{listener=fn;}}},storage:{local:area(local),session:area(session)},permissions:{contains:async()=>true},tabs:{query:async()=>[],sendMessage:async()=>{}}}});
  const originalFetch=globalThis.fetch;let textCalls=0,visionCalls=0,sports=.99,substantive=.05,badVision=false;
  globalThis.fetch=async(url,init)=>{
    const body=JSON.parse(init!.body as string);
    assert.equal(new Headers(init!.headers).get('authorization'),'Bearer test-only');
    if(String(url).endsWith('/chat/completions')){
      visionCalls++;assert.equal(body.messages[1].content[1].image_url.url,'https://wx1.sinaimg.cn/large/test.jpg');
      return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:badVision?'invalid':JSON.stringify({allImagesUnderstood:true,sports:true,sceneryOnly:false,hasSubstantiveInformation:false,confidence:.99})}}]}));
    }
    textCalls++;
    return new Response(JSON.stringify({model:'jev',answers:Object.fromEntries(['sports_content','substantive_text','life_philosophy','poetry_or_sentiment','concrete_business_economic_information','investment_philosophy'].map(k=>[k,{type:'noul',noul:k==='sports_content'?sports:k==='substantive_text'?substantive:.1}]))}));
  };
  await import('../src/background/service-worker');
  const ui={id:'global-test',url:'chrome-extension://global-test/options.html'},page={id:'global-test',url:'https://weibo.com/',frameId:0,tab:{id:1}};
  const send=(message:unknown,sender:any=ui)=>new Promise<any>(resolve=>listener(message,sender,resolve));
  let s={...structuredClone(DEFAULT_SETTINGS),semanticEnabled:true,endpoint:'https://ai-gateway.vercel.sh/typesafe/v1/systemone'};
  const save=async(changes:object)=>{const r=await send({type:'saveSettings',settings:{...s,...changes},apiKey:'test-only'});assert.equal(r.ok,true,r.error);s=r.data.settings;};
  const decide=async(p:WeiboPost)=>{const r=await send({type:'decide',post:p,revision:s.revision,sessionId:'test'},page);assert.equal(r.ok,true,r.error);return r.data.decision;};
  const base:WeiboPost={postId:'Global1',authorId:'2173738960',authorName:'测试',text:'今天看篮球比赛',repostText:'',visibleContext:'',canonicalUrl:'https://weibo.com/2173738960/Global1',postType:'original',hasMedia:false,hasLinkCard:false,isTextTruncated:false,contextCompleteness:'complete',elementFingerprint:'test'};
  try{
    await save({});
    for(const a of ACCOUNTS){const d=await decide({...base,authorId:a.id,canonicalUrl:`https://weibo.com/${a.id}/Global1`});assert.equal(d.state,'collapsed');assert.match(d.reason,/体育/);}
    assert.equal(textCalls,4);assert.equal(visionCalls,0);
    const photo={...base,text:'',hasMedia:true,imageUrls:['https://wx1.sinaimg.cn/large/test.jpg'],imagesComplete:true,hasVideo:false};
    assert.equal((await decide(photo)).state,'visible');assert.equal(visionCalls,0);
    await save({visionEnabled:true});
    assert.equal((await decide({...photo,imagesComplete:false})).state,'visible');assert.equal(visionCalls,0);
    assert.equal((await decide(photo)).state,'collapsed');assert.equal(textCalls,4);assert.equal(visionCalls,1);
    assert.equal((await decide(photo)).cached,true);assert.equal(visionCalls,1);
    sports=.1;substantive=.95;
    assert.equal((await decide({...photo,text:'公司本季度财报中的利润数据'})).state,'visible');assert.equal(visionCalls,1);
    substantive=.05;badVision=true;
    const failure=await decide({...photo,text:'周末打卡'});assert.equal(failure.state,'visible');assert.match(failure.reason,/format/);assert.equal(visionCalls,2);
  }finally{globalThis.fetch=originalFetch;}
});
