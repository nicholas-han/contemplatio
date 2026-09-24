import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ACCOUNTS,DEFAULT_SETTINGS} from '../src/shared/settings';
import type {WeiboPost} from '../src/shared/types';
test('worker evaluates every rule before retention, preserves independent matches and respects vision consent',async()=>{
  let listener:any;const local:Record<string,unknown>={},session:Record<string,unknown>={};
  const area=(data:Record<string,unknown>)=>({get:async(keys:string[])=>Object.fromEntries(keys.map(k=>[k,data[k]])),set:async(value:object)=>Object.assign(data,value),setAccessLevel:async()=>{}});
  Object.assign(globalThis,{chrome:{runtime:{id:'global-test',getURL:(p:string)=>'chrome-extension://global-test/'+p,onMessage:{addListener:(fn:any)=>{listener=fn;}}},storage:{local:area(local),session:area(session)},permissions:{contains:async()=>true},tabs:{query:async()=>[],sendMessage:async()=>{}}}});
  const originalFetch=globalThis.fetch;let textCalls=0,visionCalls=0,sports=.99,substantive=.05,badVision=false,visualSports=true,accountNoise=.1;const requests:any[]=[];let visualFields:object|undefined,visionFailures=0;
  globalThis.fetch=async(url,init)=>{
    const body=JSON.parse(init!.body as string);requests.push(body);
    assert.equal(new Headers(init!.headers).get('authorization'),'Bearer test-only');
    if(String(url).endsWith('/chat/completions')){
      visionCalls++;if(visionFailures>0){visionFailures--;throw new TypeError('simulated network error');}assert.equal(body.messages[1].content[1].image_url.url,'https://wx1.sinaimg.cn/large/test.jpg');
      return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:badVision?'invalid':JSON.stringify(visualFields??{allImagesUnderstood:true,sports:visualSports,sceneryOnly:false,sceneryTextSupported:false,hasSubstantiveInformation:false,confidence:.99})}}]}));
    }
    textCalls++;
    return new Response(JSON.stringify({model:'jev',answers:Object.fromEntries(['sports_content','substantive_text','life_philosophy','poetry_or_sentiment','concrete_business_economic_information','investment_philosophy','noise_evidence_sufficient'].map(k=>[k,{type:'noul',noul:k==='sports_content'?sports:k==='substantive_text'?substantive:k==='life_philosophy'?accountNoise:k==='noise_evidence_sufficient'?.99:.1}]))}));
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
    for(const a of ACCOUNTS){
      const d=await decide({...base,authorId:a.id,canonicalUrl:`https://weibo.com/${a.id}/Global1`,text:'转发微博',repostText:'公司经营数据',visibleContext:'转发作者：@否极泰董宝珍',postType:'repost',hasMedia:true,isTextTruncated:true,contextCompleteness:'unknown'});
      assert.equal(d.state,'collapsed');assert.match(d.reason,/涉及董宝珍/);
    }
    assert.equal(textCalls,0);assert.equal(visionCalls,0);
    for(const a of ACCOUNTS){
      const d=await decide({...base,authorId:a.id,canonicalUrl:`https://weibo.com/${a.id}/Global1`,text:'牛',repostText:'#中国队男子4x100米混接夺金# 中国队游泳接力决赛夺冠，3分27秒89！',postType:'repost',isTextTruncated:true,contextCompleteness:'unknown'});
      assert.equal(d.state,'collapsed');assert.match(d.reason,/体育/);
      const request=requests.at(-1);assert.equal(request.state.evidence.isTextTruncated,true);assert.equal(request.state.evidence.contextCompleteness,'unknown');assert.match(request.state.repostText,/游泳接力/);
    }
    assert.equal(textCalls,4);assert.equal(visionCalls,0);
    const photo={...base,text:'',hasMedia:true,imageUrls:['https://wx1.sinaimg.cn/large/test.jpg'],imagesComplete:true,hasVideo:false};
    assert.equal((await decide(photo)).state,'visible');assert.equal(visionCalls,0);
    await save({visionEnabled:true});
    assert.equal((await decide({...photo,imagesComplete:false,isTextTruncated:true})).state,'collapsed');assert.equal(visionCalls,1);
    assert.equal((await decide(photo)).state,'collapsed');assert.equal(textCalls,4);assert.equal(visionCalls,2);
    assert.equal((await decide(photo)).cached,true);assert.equal(visionCalls,2);
    sports=.1;substantive=.95;visualSports=false;
    assert.equal((await decide({...photo,text:'公司本季度财报中的利润数据'})).state,'visible');assert.equal(visionCalls,3);
    visualSports=true;
    assert.equal((await decide({...photo,text:'体育相关新闻配图与评论',isTextTruncated:true})).state,'collapsed');assert.equal(visionCalls,4);
    // Confirmed text match must not call, fail, or be overwritten by vision.
    sports=.99;badVision=true;
    assert.equal((await decide({...photo,text:'游泳接力夺冠！',isTextTruncated:true})).state,'collapsed');assert.equal(visionCalls,4);
    sports=.1;substantive=.05;
    const failure=await decide({...photo,text:'周末打卡'});assert.equal(failure.state,'visible');assert.match(failure.reason,/format/);assert.equal(visionCalls,5);
    accountNoise=.8;
    const wang={...photo,authorId:'2820792015',canonicalUrl:'https://weibo.com/2820792015/Global1',text:'人生哲理配图',isTextTruncated:true};
    assert.equal((await decide(wang)).state,'dimmed');assert.equal(visionCalls,6);
    badVision=false;visualSports=false;
    assert.equal((await decide({...wang,text:'人生哲理配图二'})).state,'dimmed');assert.equal(visionCalls,7);
    accountNoise=.97;badVision=true;
    assert.equal((await decide({...wang,text:'人生哲理配图三'})).state,'collapsed');assert.equal(visionCalls,7);
    // Retrying vision must preserve, and not re-request, supported text evidence.
    accountNoise=.8;badVision=false;visionFailures=1;
    const beforeText=textCalls,beforeVision=visionCalls;
    const retry=await decide({...wang,text:'人生哲理配图重试'});
    assert.equal(retry.state,'dimmed');assert.equal(textCalls,beforeText+1);assert.equal(visionCalls,beforeVision+2);
    // Missing visual fields are unknown, not negative results cached for 30 days.
    await send({type:'clearCache'});
    visualFields={sceneryOnly:false,confidence:.99};
    const missingBefore=visionCalls;
    for(let i=0;i<2;i++){const d=await decide(photo);assert.equal(d.state,'visible');assert.notEqual(d.cached,true);}
    assert.equal(visionCalls,missingBefore+2);
    // An independently supported sports match remains cacheable.
    visualFields={sports:true,confidence:.99};
    assert.equal((await decide(photo)).state,'collapsed');
    assert.equal((await decide(photo)).cached,true);assert.equal(visionCalls,missingBefore+3);
  }finally{globalThis.fetch=originalFetch;}
});
