import 'fake-indexeddb/auto';
import {test}from'node:test';import assert from'node:assert/strict';
import {cacheKey,putCached,getCached,clearCache,recordFeedback,exportFeedback,clearFeedback}from'../src/storage/local';
import {DEFAULT_SETTINGS}from'../src/shared/settings';
import type{WeiboPost}from'../src/shared/types';
const p:WeiboPost={postId:'Example',authorId:'2820792015',authorName:'样本',text:'样本文字',repostText:'',visibleContext:'',canonicalUrl:'https://weibo.com/2820792015/Example',postType:'original',hasMedia:false,hasLinkCard:false,isTextTruncated:false,contextCompleteness:'complete',elementFingerprint:'test'};
test('cache shares identical content, versions provider/policy/context, and clears independently of feedback',async()=>{
  const s=structuredClone(DEFAULT_SETTINGS);const key=await cacheKey(p,s);
  assert.equal(await cacheKey({...p,postId:'Other'},s),key);
  for(const changed of [{...s,model:'new-model'},{...s,thresholds:{...s.thresholds,wangCollapseNoise:.99}},{...s,endpoint:'https://new.example/api'}])assert.notEqual(await cacheKey(p,changed),key);
  assert.notEqual(await cacheKey({...p,repostText:'不同上下文'},s),key);
  await putCached(key,{state:'collapsed',source:'model',reason:'test'});assert.equal((await getCached(key))?.cached,true);
  await recordFeedback(p,{state:'collapsed',source:'model',reason:'test'},'KEEP','session',s);
  await recordFeedback(p,{state:'collapsed',source:'model',reason:'test'},null,'session',s);
  const rows=await exportFeedback();assert.equal(rows.length,1);assert.equal(rows[0]?.label,'KEEP');assert.equal(rows[0]?.text,undefined);
  await clearCache();assert.equal(await getCached(key),null);assert.equal((await exportFeedback()).length,1);
  await recordFeedback(p,{state:'visible',source:'local',reason:'test'},null,'second',{...s,collectSamples:true});
  assert.equal((await exportFeedback()).find(r=>r.sessionId==='second')?.text,p.text);await clearFeedback();assert.equal((await exportFeedback()).length,0);
});
test('concurrent automatic sampling cannot overwrite a manual correction',async()=>{
  await clearFeedback();
  const decision={state:'visible' as const,source:'protected' as const,reason:'test'};
  await Promise.all([recordFeedback(p,decision,'COLLAPSE','race',DEFAULT_SETTINGS),recordFeedback(p,decision,null,'race',DEFAULT_SETTINGS)]);
  assert.equal((await exportFeedback())[0]?.label,'COLLAPSE');
  await Promise.all([recordFeedback(p,decision,null,'race',DEFAULT_SETTINGS),recordFeedback(p,decision,'KEEP','race',DEFAULT_SETTINGS)]);
  assert.equal((await exportFeedback())[0]?.label,'KEEP');await clearFeedback();
});
