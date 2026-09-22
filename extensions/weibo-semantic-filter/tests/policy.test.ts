import {test} from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,validateSettings} from '../src/shared/settings';
import {localDecision,policyDecision,needsVision,requiredDecisions} from '../src/policy/decision-engine';
import type {WeiboPost} from '../src/shared/types';
export const post=(patch:Partial<WeiboPost>={}):WeiboPost=>({postId:'Sample',authorId:'2820792015',authorName:'样本',text:'人生总有风雨',repostText:'',visibleContext:'',canonicalUrl:'https://weibo.com/2820792015/Sample',postType:'original',hasMedia:false,hasLinkCard:false,isTextTruncated:false,contextCompleteness:'complete',elementFingerprint:'sample',...patch});
const s={...structuredClone(DEFAULT_SETTINGS),collapseOtherAccounts:false,globalRules:{sports:false,sceneryPhotos:false,namedPeople:false}};
test('retain-all, unknown and disabled accounts override every noise signal',()=>{
  for(const authorId of ['2173738960','2635695961','999999999']) {
    const d=policyDecision(post({authorId,text:'谢谢，足球世界杯，诗词'}),s,{life_philosophy:1,poetry_or_sentiment:1,concrete_business_economic_information:0,investment_philosophy:0});
    assert.equal(d.state,'visible');assert.equal(d.source,'protected');
  }
  assert.equal(localDecision(post(),{...s,accounts:{...s.accounts,'2820792015':false}})!.state,'visible');
});
test('acknowledgements only collapse reliable text-only replies, not originals, images, reposts or numbers',()=>{
  const reply=post({authorId:'1249424622',postType:'reply',text:'回复 @样本：谢谢！'});
  assert.equal(localDecision(reply,s)?.state,'collapsed');
  for(const patch of [{postType:'original' as const},{hasMedia:true},{hasLinkCard:true},{repostText:'季度利润增长'},{isTextTruncated:true},{contextCompleteness:'unknown' as const},{text:''}])assert.equal(localDecision({...reply,...patch},s)?.state,'visible');
  for(const text of ['1','2026','利率下调','谢谢，公司盈利增长','股票涨了10%'])assert.notEqual(localDecision({...reply,text},s)?.state,'collapsed');
  for(const text of ['👍','🙏🙏','谢谢。','!!!'])assert.equal(localDecision({...reply,text},s)?.state,'collapsed');
});
test('Wang noise thresholds preserve substantive information and investment philosophy, including DIM',()=>{
  const scores={life_philosophy:.9,poetry_or_sentiment:.2,concrete_business_economic_information:.25,investment_philosophy:.1};
  assert.equal(policyDecision(post(),s,scores).state,'collapsed');
  assert.equal(policyDecision(post(),s,{...scores,life_philosophy:.89}).state,'dimmed');
  assert.equal(policyDecision(post(),s,{...scores,life_philosophy:.74}).state,'visible');
  assert.equal(policyDecision(post(),s,{...scores,investment_philosophy:.5}).state,'visible');
  assert.equal(policyDecision(post(),s,{...scores,concrete_business_economic_information:.41}).state,'visible');
  assert.equal(policyDecision(post({text:'巴菲特谈价值投资'}),s,scores).state,'visible');
  for(const value of [undefined,NaN,Infinity,-1,1.01])assert.equal(policyDecision(post(),s,{...scores,investment_philosophy:value}).state,'visible');
});
test('Dan model decisions require high interaction and low new information together',()=>{
  const p=post({authorId:'1249424622',postType:'reply',text:'回复 @某人：正是如此呀'});
  assert.equal(policyDecision(p,s,{social_interaction:.92,new_substantive_information:.20}).state,'collapsed');
  assert.equal(policyDecision(p,s,{social_interaction:.91,new_substantive_information:.20}).state,'dimmed');
  assert.equal(policyDecision(p,s,{social_interaction:.99,new_substantive_information:.41}).state,'visible');
});
test('settings reject invalid values and reversed conservative thresholds',()=>{
  assert.deepEqual(validateSettings(s),s);
  for(const patch of [{timeoutMs:0},{endpoint:'http://example.com'},{endpoint:'https://user:secret@example.com'},{model:''},{acknowledgements:['']},{thresholds:{...s.thresholds,wangCollapseNoise:.5}}])assert.throws(()=>validateSettings({...s,...patch}));
});
test('shared sports rule covers all four accounts, including media and retained accounts',()=>{
  const s=structuredClone(DEFAULT_SETTINGS);
  for(const authorId of Object.keys(s.accounts)){
    const p=post({authorId,text:'今天打高尔夫，明天看篮球和足球比赛',hasMedia:true});
    assert.equal(localDecision(p,s),null);
    assert.deepEqual(requiredDecisions(p,s),['sports_content']);
    assert.equal(policyDecision(p,s,{sports_content:.99}).state,'collapsed');
    assert.equal(policyDecision(p,s,{sports_content:.1}).state,'visible');
    assert.equal(policyDecision(p,s,{}).state,'visible');
  }
  assert.equal(localDecision(post({authorId:'999999999',text:'足球'}),s)?.state,'collapsed');
  assert.equal(policyDecision(post({text:'足球',isTextTruncated:true}),s,{sports_content:1}).state,'visible');
  assert.equal(policyDecision(post({text:'公司市场份额增长',hasMedia:true}),s,{sports_content:.02}).state,'visible');
});
test('photo classification requires consent, complete images and low-information text',()=>{
  const s={...structuredClone(DEFAULT_SETTINGS),visionEnabled:true};
  const p=post({text:'早上好',hasMedia:true,imageUrls:['https://wx1.sinaimg.cn/large/a.jpg'],imagesComplete:true,hasVideo:false});
  assert.equal(needsVision(p,s,{sports_content:.1,substantive_text:.1}),true);
  for(const patch of [{visionEnabled:false},{globalRules:{sports:false,sceneryPhotos:false,namedPeople:false}}])assert.equal(needsVision(p,{...s,...patch},{sports_content:0,substantive_text:0}),false);
  for(const patch of [{imagesComplete:false},{hasVideo:true},{hasLinkCard:true},{imageUrls:Array(10).fill('https://wx1.sinaimg.cn/large/a.jpg')}])assert.equal(needsVision({...p,...patch},s,{substantive_text:0}),false);
  assert.equal(needsVision(p,s,{substantive_text:.9}),false);
});
test('old settings migrate without enabling image transmission',()=>{
  const {globalRules,visionEnabled,...old}=DEFAULT_SETTINGS;
  assert.deepEqual(validateSettings(old).globalRules,{sports:true,sceneryPhotos:true,namedPeople:true});
  assert.equal(validateSettings(old).visionEnabled,false);
  assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,visionEnabled:true}));
});
test('named-person rule overrides media and investment protection across four accounts, but respects scope and switches',()=>{
  const settings=structuredClone(DEFAULT_SETTINGS);
  for(const authorId of Object.keys(settings.accounts)){
    for(const patch of [{text:'林园谈价值投资',hasMedia:true},{text:'转发微博',repostText:'董宝珍谈巴菲特',postType:'repost' as const},{text:'林園与董寶珍',isTextTruncated:true,contextCompleteness:'unknown' as const}]){
      const d=policyDecision(post({authorId,...patch}),settings,{});
      assert.equal(d.state,'collapsed');assert.equal(d.source,'local');assert.match(d.reason,/涉及(?:林园|董宝珍)/);
    }
  }
  const p=post({authorId:'2173738960',text:'林园谈价值投资'});
  for(const changed of [{...settings,enabled:false},{...settings,accounts:{...settings.accounts,[p.authorId]:false}},{...settings,globalRules:{sports:false,sceneryPhotos:false,namedPeople:false}}])assert.equal(localDecision(p,changed)?.state,'visible');
  assert.equal(localDecision({...p,authorId:'999999999'},settings)?.state,'collapsed');
  assert.notEqual(localDecision({...p,text:'园林景观与公园漫步'},settings)?.state,'collapsed');
  assert.equal(validateSettings({...settings,globalRules:{sports:false,sceneryPhotos:true}}).globalRules.namedPeople,true);
  assert.equal(validateSettings({...settings,globalRules:{...settings.globalRules,namedPeople:false}}).globalRules.namedPeople,false);
});
test('non-target accounts fold without AI or complete text, while target membership and explicit opt-out win',()=>{
  const settings=structuredClone(DEFAULT_SETTINGS);
  const other=post({authorId:'999999999',text:'推荐内容',hasMedia:true,isTextTruncated:true,contextCompleteness:'unknown'});
  const d=policyDecision(other,settings,{});
  assert.equal(d.state,'collapsed');assert.equal(d.applyInShadow,true);assert.equal(d.source,'local');
  for(const changed of [{...settings,enabled:false},{...settings,collapseOtherAccounts:false}])assert.equal(policyDecision(other,changed,{}).state,'visible');
  for(const authorId of Object.keys(settings.accounts)){
    const disabled={...settings,accounts:{...settings.accounts,[authorId]:false}};
    const target=post({authorId,postType:'repost',repostText:'来自其他博主的内容'});
    assert.equal(policyDecision(target,disabled,{}).state,'visible');
    assert.notEqual(policyDecision(target,settings,{}).applyInShadow,true);
  }
  assert.equal(localDecision({...other,authorId:''},settings)?.state,'visible');
  const {collapseOtherAccounts,...old}=settings;
  assert.equal(validateSettings(old).collapseOtherAccounts,true);
  assert.equal(validateSettings({...settings,collapseOtherAccounts:false}).collapseOtherAccounts,false);
  assert.throws(()=>validateSettings({...settings,collapseOtherAccounts:'false'}));
});
