import { ACCOUNTS, type Settings } from '../shared/settings';
import type { Decision, DecisionKey, WeiboPost } from '../shared/types';
const keep=(reason:string):Decision=>({state:'visible',source:'protected',reason});
export function accountScopeDecision(post:WeiboPost,s:Settings):Decision|null {
  if(!s.enabled)return keep('过滤已关闭');
  if(!/^\d{5,20}$/.test(post.authorId))return keep('无法可靠识别作者');
  if(!ACCOUNTS.some(a=>a.id===post.authorId))return s.collapseOtherAccounts
    ?{state:'collapsed',source:'local',reason:'非目标账号，自动折叠',applyInShadow:true}
    :keep('未启用该账号过滤');
  if(!s.accounts[post.authorId])return keep('未启用该账号过滤');
  return null;
}
export function requiredDecisions(post:WeiboPost,s:Settings):DecisionKey[] {
  const keys:DecisionKey[]=[];
  if(s.globalRules.sports)keys.push('sports_content');
  if(photoCandidate(post,s))keys.push('substantive_text');
  if(!legacyDecision(post,s))keys.push(...(post.authorId===ACCOUNTS[0].id?['social_interaction','new_substantive_information'] as DecisionKey[]:['life_philosophy','poetry_or_sentiment','concrete_business_economic_information','investment_philosophy'] as DecisionKey[]));
  return keys;
}
export function localDecision(post:WeiboPost,s:Settings):Decision|null {
  const scope=accountScopeDecision(post,s);if(scope)return scope;
  // Explicit mentions are sufficient even when the rest of the post is truncated.
  if(s.globalRules.namedPeople){
    const text=post.text+'\n'+post.repostText;
    const names=[/林[园園]/u.test(text)?'林园':'',/董[宝寶]珍/u.test(text)?'董宝珍':''].filter(Boolean);
    if(names.length)return {state:'collapsed',source:'local',reason:`通用规则：涉及${names.join('、')}`};
  }
  if(post.isTextTruncated||post.contextCompleteness!=='complete')return keep('可见上下文不完整');
  const legacy=legacyDecision(post,s);if(legacy?.state==='collapsed')return legacy;
  if(s.globalRules.sports&&(post.text+post.repostText).trim())return null;
  if(photoCandidate(post,s))return null;
  return legacy;
}
export function photoCandidate(post:WeiboPost,s:Settings):boolean {
  return s.visionEnabled&&(s.globalRules.sports||s.globalRules.sceneryPhotos)&&!post.hasVideo&&!post.hasLinkCard&&!post.isTextTruncated&&post.contextCompleteness==='complete'&&post.imagesComplete===true&&!!post.imageUrls?.length&&post.imageUrls.length<=9;
}
export function needsVision(post:WeiboPost,s:Settings,scores:Partial<Record<DecisionKey,number>>):boolean {
  return photoCandidate(post,s)&&(scores.substantive_text??1)<=.25&&!(s.globalRules.sports&&(scores.sports_content??0)>=.9);
}
export function legacyDecision(post:WeiboPost,s:Settings):Decision|null {
  const account=ACCOUNTS.find(a=>a.id===post.authorId);
  if(!s.enabled||!account||!s.accounts[post.authorId])return keep('未启用该账号过滤');
  if(account.policy==='retain')return keep(Object.values(s.globalRules).some(Boolean)?'未命中通用规则，保留内容':'账号全部保留');
  if(!post.text.trim())return keep('空正文保护');
  if(post.isTextTruncated||post.contextCompleteness!=='complete')return keep('可见上下文不完整');
  // We do not know whether a chart/photo/video carries the substantive information.
  if(post.hasMedia||post.hasLinkCard)return keep('媒体或外链内容保护');
  if(/巴菲特|芒格|价值投资|投资哲学|Buffett|Munger/iu.test(post.text+'\n'+post.repostText))return keep('价值投资内容保护');
  if(account.policy==='dan') {
    if(post.postType==='original'||post.postType==='unknown')return keep('原发或未知类型保护');
    if(post.repostText)return keep('转发原文保护');
    if(post.postType!=='reply')return keep('缺少可靠互动标识');
    const text=post.text.replace(/^回复\s*@[^:：]+[:：]/u,'').trim();
    const normalized=text.replace(/[\s\p{P}]/gu,'');
    if(s.acknowledgements.some(w=>w.replace(/[\s\p{P}]/gu,'')===normalized) || (normalized.length>0 && /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\uFE0F|\u200D)+$/u.test(normalized)) || (text.length>0 && /^[\s\p{P}]+$/u.test(text))) return {state:'collapsed',source:'local',reason:'明确的纯互动'};
  }
  return null;
}
export function policyDecision(post:WeiboPost,s:Settings,scores:Partial<Record<DecisionKey,number>>):Decision {
  const local=localDecision(post,s);if(local)return local;
  if(requiredDecisions(post,s).some(k=>typeof scores[k]!=='number'||!Number.isFinite(scores[k])||scores[k]!<0||scores[k]!>1))return keep('语义字段缺失或无效');
  if(s.globalRules.sports&&scores.sports_content!>=.9)return {state:'collapsed',source:'model',reason:'通用规则：体育相关内容',scores};
  const legacy=legacyDecision(post,s);if(legacy)return {...legacy,scores};
  const t=s.thresholds;let state:Decision['state']='visible';let reason='保留内容';
  if(post.authorId===ACCOUNTS[0].id) {
    const social=scores.social_interaction!,info=scores.new_substantive_information!;
    if(info>t.danDimInformation)return {...keep('实质信息保护'),scores};
    if(social>=t.danCollapseSocial&&info<=t.danCollapseInformation)state='collapsed';
    else if(social>=t.danDimSocial&&info<=t.danDimInformation)state='dimmed';
    if(state!=='visible')reason='纯互动、无新增信息';
  }else {
    const philosophy=scores.life_philosophy!,poetry=scores.poetry_or_sentiment!,info=scores.concrete_business_economic_information!;
    if(scores.investment_philosophy!>=t.investmentProtection||info>t.wangDimInformation)return {...keep('实质信息或价值投资保护'),scores};
    const noise=Math.max(philosophy,poetry);
    if(noise>=t.wangCollapseNoise&&info<=t.wangCollapseInformation)state='collapsed';
    else if(noise>=t.wangDimNoise&&info<=t.wangDimInformation)state='dimmed';
    if(state!=='visible')reason=philosophy>=poetry?'人生哲理 / 鸡汤':'诗词 / 抒情';
  }
  return {state,reason,source:'model',scores};
}
