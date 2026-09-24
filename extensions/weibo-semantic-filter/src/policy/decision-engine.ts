import { ACCOUNTS, type Settings } from '../shared/settings';
import type { Decision, DecisionKey, WeiboPost } from '../shared/types';
type Scores = Partial<Record<DecisionKey,number>>;
const keep=(reason:string):Decision=>({state:'visible',source:'protected',reason});
const hasText=(post:WeiboPost)=>Boolean((post.text+post.repostText).trim());
const validScore=(scores:Scores,key:DecisionKey)=>typeof scores[key]==='number'&&Number.isFinite(scores[key])&&scores[key]!>=0&&scores[key]!<=1;
const passes=(scores:Scores,key:DecisionKey,threshold:number)=>validScore(scores,key)&&scores[key]!>=threshold;
export function accountScopeDecision(post:WeiboPost,s:Settings):Decision|null {
  if(!s.enabled)return keep('过滤已关闭');
  if(!/^\d{5,20}$/.test(post.authorId))return keep('无法可靠识别作者');
  if(!ACCOUNTS.some(a=>a.id===post.authorId))return s.collapseOtherAccounts
    ?{state:'collapsed',source:'local',reason:'非目标账号，自动折叠',applyInShadow:true}
    :keep('未启用该账号过滤');
  if(!s.accounts[post.authorId])return keep('未启用该账号过滤');
  return null;
}
function accountKeys(post:WeiboPost):DecisionKey[] {
  if(!hasText(post))return [];
  // Account scope is a rule definition; truncation/media are evidence, not vetoes.
  if(post.authorId===ACCOUNTS[0].id&&post.postType==='reply')return ['social_interaction','new_substantive_information','interaction_evidence_sufficient'];
  if(post.authorId===ACCOUNTS[1].id)return ['life_philosophy','poetry_or_sentiment','concrete_business_economic_information','investment_philosophy','noise_evidence_sufficient'];
  return [];
}
export function requiredDecisions(post:WeiboPost,s:Settings):DecisionKey[] {
  if(accountScopeDecision(post,s)||!hasText(post))return [];
  const keys:DecisionKey[]=[];
  if(s.globalRules.sports)keys.push('sports_content');
  if(photoCandidate(post,s)&&s.globalRules.sceneryPhotos)keys.push('substantive_text');
  return [...keys,...accountKeys(post)];
}
export function localDecision(post:WeiboPost,s:Settings):Decision|null {
  const scope=accountScopeDecision(post,s);if(scope)return scope;
  if(s.globalRules.namedPeople){
    const text=post.text+'\n'+post.repostText+'\n'+post.visibleContext;
    const names=[/林[园園]/u.test(text)?'林园':'',/董[宝寶]珍/u.test(text)?'董宝珍':''].filter(Boolean);
    if(names.length)return {state:'collapsed',source:'local',reason:`通用规则：涉及${names.join('、')}`};
  }
  // A complete plain reply can be proven locally. Otherwise ask the model,
  // rather than treating the missing local proof as a decision to retain.
  if(post.authorId===ACCOUNTS[0].id&&post.postType==='reply'&&!post.repostText&&!post.hasMedia&&!post.hasLinkCard&&!post.isTextTruncated&&post.contextCompleteness==='complete'){
    const text=post.text.replace(/^回复\s*@[^:：]+[:：]/u,'').trim();
    const normalized=text.replace(/[\s\p{P}]/gu,'');
    if(s.acknowledgements.some(w=>w.replace(/[\s\p{P}]/gu,'')===normalized) || (normalized.length>0&&/^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\uFE0F|\u200D)+$/u.test(normalized)) || (text.length>0&&/^[\s\p{P}]+$/u.test(text)))return {state:'collapsed',source:'local',reason:'明确的纯互动'};
  }
  if(requiredDecisions(post,s).length||photoCandidate(post,s))return null;
  return keep(hasText(post)?'未命中适用的过滤规则':'现有证据不足以过滤');
}
export function photoCandidate(post:WeiboPost,s:Settings):boolean {
  // Input availability/consent only. Completeness is assessed per visual rule.
  return s.visionEnabled&&(s.globalRules.sports||s.globalRules.sceneryPhotos)&&!!post.imageUrls?.length&&post.imageUrls.length<=9;
}
export function needsVision(post:WeiboPost,s:Settings,scores:Scores):boolean {
  if(!photoCandidate(post,s)||passes(scores,'sports_content',.9)&&s.globalRules.sports)return false;
  return s.globalRules.sports||(s.globalRules.sceneryPhotos&&(!validScore(scores,'substantive_text')||scores.substantive_text!<=.25));
}
export function policyDecision(post:WeiboPost,s:Settings,scores:Scores):Decision {
  const local=localDecision(post,s);if(local)return local;
  // Every rule checks its own evidence. Missing fields for another rule cannot
  // suppress a supported match, and retention is only the final fallback.
  if(s.globalRules.sports&&passes(scores,'sports_content',.9))return {state:'collapsed',source:'model',reason:'通用规则：体育相关内容',scores};
  const keys=accountKeys(post);
  if(keys.length){
    const required=keys.filter(k=>k!=='life_philosophy'&&k!=='poetry_or_sentiment');
    if(required.some(k=>!validScore(scores,k))||(post.authorId===ACCOUNTS[1].id&&!validScore(scores,'life_philosophy')&&!validScore(scores,'poetry_or_sentiment')))return {...keep('账号规则证据字段缺失或无效'),scores};
    const t=s.thresholds;let state:Decision['state']='visible';let reason='未命中账号过滤规则';
    if(post.authorId===ACCOUNTS[0].id){
      if(!passes(scores,'interaction_evidence_sufficient',.9))return {...keep('纯互动规则证据不足'),scores};
      const social=scores.social_interaction!,info=scores.new_substantive_information!;
      if(info>t.danDimInformation)return {...keep('实质信息保护'),scores};
      if(social>=t.danCollapseSocial&&info<=t.danCollapseInformation)state='collapsed';
      else if(social>=t.danDimSocial&&info<=t.danDimInformation)state='dimmed';
      if(state!=='visible')reason='纯互动、无实质信息';
    }else{
      const philosophy=validScore(scores,'life_philosophy')?scores.life_philosophy!:0,poetry=validScore(scores,'poetry_or_sentiment')?scores.poetry_or_sentiment!:0,info=scores.concrete_business_economic_information!;
      if(/巴菲特|芒格|价值投资|投资哲学|Buffett|Munger/iu.test(post.text+'\n'+post.repostText)||scores.investment_philosophy!>=t.investmentProtection||info>t.wangDimInformation)return {...keep('实质信息或价值投资保护'),scores};
      if(!passes(scores,'noise_evidence_sufficient',.9))return {...keep('哲理／诗词规则证据不足'),scores};
      const noise=Math.max(philosophy,poetry);
      if(noise>=t.wangCollapseNoise&&info<=t.wangCollapseInformation)state='collapsed';
      else if(noise>=t.wangDimNoise&&info<=t.wangDimInformation)state='dimmed';
      if(state!=='visible')reason=philosophy>=poetry?'人生哲理 / 鸡汤':'诗词 / 抒情';
    }
    return {state,reason,source:'model',scores};
  }
  return {...keep('未命中过滤规则或现有证据不足'),scores};
}
