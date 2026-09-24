import {test} from 'node:test';import assert from 'node:assert/strict';
import {VisionProvider,validateVisualResult,visualDecision} from '../src/classifier/vision-provider';
import {DEFAULT_SETTINGS,type Settings} from '../src/shared/settings';import {cacheKey} from '../src/storage/local';
import type {WeiboPost} from '../src/shared/types';
const photo:WeiboPost={authorId:'2173738960',authorName:'样本',postId:'Photo',text:'',repostText:'',visibleContext:'',canonicalUrl:'https://weibo.com/2173738960/Photo',postType:'original',hasMedia:true,hasLinkCard:false,isTextTruncated:false,contextCompleteness:'complete',elementFingerprint:'photo',imageUrls:['https://wx1.sinaimg.cn/large/a.jpg'],imagesComplete:true};
const result={allImagesUnderstood:true,sports:false,sceneryOnly:true,sceneryTextSupported:true,hasSubstantiveInformation:false,confidence:.99};
test('photo decisions preserve charts, mixed content and uncertainty, while filtering golf and scenery',()=>{
  assert.equal(visualDecision(result,DEFAULT_SETTINGS,photo)?.state,'collapsed');
  assert.match(visualDecision({...result,sports:true,sceneryOnly:false},DEFAULT_SETTINGS,photo)!.reason,/体育/);
  for(const patch of [{sceneryTextSupported:false},{allImagesUnderstood:false},{confidence:.94},{hasSubstantiveInformation:true},{sceneryOnly:false}])assert.equal(visualDecision({...result,...patch},DEFAULT_SETTINGS,photo),null);
  assert.equal(validateVisualResult({...result,sports:'false'}).sports,undefined);assert.throws(()=>validateVisualResult({...result,confidence:1.2}));
});
test('vision transport uses Vercel, native fetch receiver, bounded photos and strict JSON',async()=>{
  let request:any;let calls=0;
  const provider=new VisionProvider('fake-key',async function(this:unknown,url,init){assert.equal(this,globalThis);assert.equal(url,'https://ai-gateway.vercel.sh/v1/chat/completions');calls++;request=init;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:300,completion_tokens:40}}));});
  assert.equal((await provider.classify(photo,new AbortController().signal)).inputTokens,300);
  const body=JSON.parse(request.body);assert.equal(body.messages[1].content[1].image_url.url,photo.imageUrls![0]);assert.equal(request.credentials,'omit');assert.equal(request.redirect,'error');
  await assert.rejects(provider.classify({...photo,imageUrls:['https://private.invalid/secret']},new AbortController().signal));assert.equal(calls,1);
  const invalid=new VisionProvider('fake-key',async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:JSON.stringify(result)}}]})));
  await assert.rejects(invalid.classify(photo,new AbortController().signal));
});
test('photo cache separates different images and changes in common rules or vision consent',async()=>{
  const a=await cacheKey(photo,DEFAULT_SETTINGS);
  for(const [p,s]of [[{...photo,imageUrls:['https://wx1.sinaimg.cn/large/b.jpg']},DEFAULT_SETTINGS],[photo,{...DEFAULT_SETTINGS,visionEnabled:true}],[photo,{...DEFAULT_SETTINGS,globalRules:{sports:false,sceneryPhotos:true,namedPeople:true}}]] as [WeiboPost,Settings][])assert.notEqual(await cacheKey(p,s),a);
});
test('sports and scenery assess their own evidence instead of sharing completeness vetoes',()=>{
  for(const patch of [{isTextTruncated:true},{contextCompleteness:'unknown' as const},{imagesComplete:false},{hasVideo:true},{hasLinkCard:true}]){
    const partial={...photo,...patch};
    assert.match(visualDecision({...result,sports:true,sceneryOnly:false,allImagesUnderstood:false,hasSubstantiveInformation:true},DEFAULT_SETTINGS,partial)!.reason,/体育/);
    assert.equal(visualDecision({...result,sceneryTextSupported:false},DEFAULT_SETTINGS,partial),null);
  }
  assert.equal(visualDecision(result,DEFAULT_SETTINGS,{...photo,isTextTruncated:true})?.state,'collapsed');
  assert.equal(visualDecision(result,DEFAULT_SETTINGS,photo,{substantive_text:.95}),null);
  assert.equal(visualDecision({...result,sports:true},DEFAULT_SETTINGS,photo,{substantive_text:.95})?.state,'collapsed');
  assert.equal(visualDecision(validateVisualResult({sports:true,confidence:.99}),DEFAULT_SETTINGS,photo)?.state,'collapsed');
  assert.equal(visualDecision(validateVisualResult({sceneryOnly:true,confidence:.99}),DEFAULT_SETTINGS,photo),null);
  for(const patch of [{imagesComplete:false},{hasVideo:true},{hasLinkCard:true}])assert.equal(visualDecision(result,DEFAULT_SETTINGS,{...photo,...patch}),null);
  assert.equal(visualDecision({...result,sports:true,sceneryOnly:false}, {...DEFAULT_SETTINGS,globalRules:{...DEFAULT_SETTINGS.globalRules,sports:false}},photo),null);
});
