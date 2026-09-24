import {test} from 'node:test';import assert from 'node:assert/strict';
import {JevProvider,ProviderError,jevRequest,validateJevResponse} from '../src/classifier/jev-provider';
import type {DecisionKey} from '../src/shared/types';
const keys:DecisionKey[]=['social_interaction','new_substantive_information'];
const good={model:'jev-test',answers:{social_interaction:{type:'noul',noul:.95},new_substantive_information:{type:'noul',noul:.1}},usage:{input_tokens:50,output_tokens:4}};
test('typed independent questions are composed once; request contains only visible text',()=>{
  const request=jevRequest({text:'谢谢',repostText:'',visibleContext:'',decisions:keys},'jev-test') as any;
  assert.equal(Object.keys(request.questions).length,2);assert.equal(request.questions.social_interaction.type,'noul');assert.deepEqual(Object.keys(request.state).sort(),['authorText','evidence','repostText','visibleContext']);
});
test('invalid probabilities are omitted without discarding independent valid answers',()=>{
  assert.equal(validateJevResponse(good,keys,12).scores.social_interaction,.95);
  for(const noul of ['.95',NaN,Infinity,-.1,1.1,undefined])assert.deepEqual(validateJevResponse({...good,answers:{...good.answers,social_interaction:{type:'noul',noul}}},keys,10).scores,{new_substantive_information:.1});
  assert.throws(()=>validateJevResponse({...good,answers:{}},keys,10));
  assert.throws(()=>validateJevResponse({...good,model:null},keys,10));
});
test('provider omits cookies, rejects redirects, does not disclose key in errors',async()=>{
  let request:RequestInit|undefined;
  const provider=new JevProvider('https://api.typesafe.ai/v1/systemone','secret-key','jev-test',1000,async(_url,init)=>{request=init;return new Response(JSON.stringify(good));});
  const input={text:'谢谢',repostText:'',visibleContext:'',decisions:keys};
  const result=await provider.classify(input,new AbortController().signal);
  assert.equal(result.inputTokens,50);assert.equal(request?.credentials,'omit');assert.equal(request?.redirect,'error');
  const bad=new JevProvider('https://api.typesafe.ai/v1/systemone','secret-key','jev-test',1000,async()=>new Response('secret-key',{status:401}));
  await assert.rejects(bad.classify(input,new AbortController().signal),e=>e instanceof ProviderError&&e.code==='auth'&&!e.message.includes('secret-key'));
});
test('rate limit reads Retry-After without retrying internally',async()=>{
  const provider=new JevProvider('https://api.typesafe.ai/v1/systemone','key','jev-test',1000,async()=>new Response('',{status:429,headers:{'retry-after':'30'}}));
  await assert.rejects(provider.classify({text:'a',repostText:'',visibleContext:'',decisions:keys},new AbortController().signal),e=>e instanceof ProviderError&&e.retryAfterMs===30000);
});
test('fetch receives the global browser context rather than the provider instance',async()=>{
  const provider=new JevProvider('https://example.com','test-key','jev-test',1000,async function(this:unknown){
    assert.equal(this,globalThis);return new Response(JSON.stringify(good));
  });
  assert.equal((await provider.classify({text:'test',repostText:'',visibleContext:'',decisions:keys},new AbortController().signal)).scores.social_interaction,.95);
});
test('connection diagnostics distinguish HTTP failures and redact the key before truncating',async()=>{
  const input={text:'test',repostText:'',visibleContext:'',decisions:keys};
  const body={error_type:'access_denied',message:'Team access denied: secret-key'};
  const fetcher:typeof fetch=async()=>new Response(JSON.stringify(body),{status:403});
  const ordinary=new JevProvider('https://example.com','secret-key','jev-test',1000,fetcher);
  await assert.rejects(ordinary.classify(input,new AbortController().signal),e=>e instanceof ProviderError&&e.httpStatus===403&&e.detail===undefined);
  const diagnostic=new JevProvider('https://example.com','secret-key','jev-test',1000,fetcher,true);
  await assert.rejects(diagnostic.classify(input,new AbortController().signal),e=>e instanceof ProviderError&&e.code==='auth'&&e.httpStatus===403&&e.detail?.includes('Team access denied')===true&&!JSON.stringify(e).includes('secret-key'));
});
test('partial-context metadata reaches every requested rule without sending attachment URLs',()=>{
  const input={text:'牛',repostText:'中国队游泳接力夺冠！',visibleContext:'转发作者：阿森纳著名教授',postType:'repost' as const,isTextTruncated:true,contextCompleteness:'unknown' as const,hasMedia:true,hasLinkCard:true,decisions:['sports_content','interaction_evidence_sufficient','noise_evidence_sufficient'] as DecisionKey[]};
  const request=jevRequest(input,'test') as any;
  assert.equal(request.state.repostText,input.repostText);
  assert.equal(request.state.evidence.isTextTruncated,true);
  assert.equal(request.state.evidence.contextCompleteness,'unknown');
  assert.equal(request.state.evidence.hasMedia,true);
  for(const q of Object.values(request.questions) as any[]){assert.match(q.instructions,/明确证据足够时可命中/);assert.match(q.instructions,/你没有看过附件/);}
  assert.deepEqual(validateJevResponse({model:'test',answers:{sports_content:{type:'noul',noul:.99},noise_evidence_sufficient:{type:'noul',noul:'invalid'}}},input.decisions,0).scores,{sports_content:.99});
});
