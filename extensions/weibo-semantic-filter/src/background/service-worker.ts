import {DEFAULT_SETTINGS,validateSettings,type Settings,POLICY_VERSION,SCHEMA_VERSION} from '../shared/settings';
import {validPost} from '../shared/messages';
import type {Decision,WeiboPost} from '../shared/types';
import {localDecision,policyDecision,requiredDecisions,needsVision} from '../policy/decision-engine';
import {JevProvider,ProviderError} from '../classifier/jev-provider';
import {VisionProvider,visualDecision} from '../classifier/vision-provider';
import {RequestQueue} from './request-queue';
import {cacheKey,getCached,putCached,recordFeedback,clearCache,clearFeedback,exportFeedback,policyStamp} from '../storage/local';

let settings:Settings=structuredClone(DEFAULT_SETTINGS),apiKey='';
let cancelled=new AbortController();const queue=new RequestQueue();const inflight=new Map<string,Promise<Decision>>();
let breaker={failures:0,until:0};
let stats={calls:0,errors:0,cacheHits:0,inputTokens:0,outputTokens:0,lastError:''};
const ready=(async()=>{
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const stored=await chrome.storage.local.get(['settings','apiKey']);
  try{if(stored.settings)settings=validateSettings(stored.settings);}catch{/* invalid stored settings fail to safe defaults */}
  apiKey=typeof stored.apiKey==='string'?stored.apiKey:'';
  const session=await chrome.storage.session.get(['breaker','stats']);
  if(session.breaker&&typeof session.breaker==='object')breaker={...breaker,...session.breaker};
  if(session.stats&&typeof session.stats==='object')stats={...stats,...session.stats};
})();
const persistStats=()=>chrome.storage.session.set({breaker,stats});
const unavailable=(reason:string):Decision=>({state:'visible',source:'unavailable',reason});
async function classify(post:WeiboPost,s:Settings,signal:AbortSignal):Promise<Decision>{
  const local=localDecision(post,s);if(local)return local;
  if(!s.semanticEnabled||!apiKey)return unavailable('语义服务未配置');
  if(!await chrome.permissions.contains({origins:[new URL(s.endpoint).origin+'/*']}))return unavailable('模型域名尚未授权');
  const id=await cacheKey(post,s);
  const cached=await getCached(id).catch(()=>null);
  if(cached){stats.cacheHits++;void persistStats();return cached;}
  const shared=inflight.get(id);if(shared)return shared;
  const task=queue.run(async()=>{
    if(signal.aborted) return unavailable('设置已变化');
    if(Date.now()<breaker.until)return unavailable('语义服务冷却中');
    const provider=new JevProvider(s.endpoint,apiKey,s.model,s.timeoutMs);
    for(let attempt=0;attempt<2;attempt++){
      if(signal.aborted)return unavailable('设置已变化');
      try{
        const decisions=requiredDecisions(post,s);
        const hasText=!!(post.text+post.repostText).trim();
        if(hasText)stats.calls++;
        const result=hasText?await provider.classify({...post,decisions},signal):{scores:{sports_content:0,substantive_text:0},model:'local-empty-text',latencyMs:0,inputTokens:0,outputTokens:0};
        if(signal.aborted)return unavailable('设置已变化');
        let decision={...policyDecision(post,s,result.scores),model:result.model,latencyMs:result.latencyMs};
        if(needsVision(post,s,result.scores)){
          if(new URL(s.endpoint).origin!=='https://ai-gateway.vercel.sh')return unavailable('图片识别需要 Vercel 连接');
          stats.calls++;
          const visual=await new VisionProvider(apiKey).classify(post,signal);
          if(signal.aborted)return unavailable('设置已变化');
          const filtered=visualDecision(visual.result,s);
          decision={...(filtered??{state:'visible' as const,source:'protected' as const,reason:visual.result.allImagesUnderstood?'图片未命中体育或纯风景规则':'图片无法完整识别，保留'}),model:visual.model,latencyMs:result.latencyMs+visual.latencyMs};
          stats.inputTokens+=visual.inputTokens;stats.outputTokens+=visual.outputTokens;
        }
        breaker={failures:0,until:0};stats.lastError='';stats.inputTokens+=result.inputTokens??0;stats.outputTokens+=result.outputTokens??0;
        await putCached(id,decision).catch(()=>{});await persistStats();return decision;
      }catch(e){
        const error=e instanceof ProviderError?e:new ProviderError('network');
        if(error.code==='cancelled')return unavailable('设置已变化');
        stats.errors++;stats.lastError=error.code;
        if(attempt===0&&['network','timeout','server'].includes(error.code)){await new Promise(r=>setTimeout(r,300));continue;}
        breaker.failures++;
        if(error.code==='rate_limit')breaker.until=Date.now()+error.retryAfterMs;
        else if(error.code==='auth'||breaker.failures>=3)breaker.until=Date.now()+60000;
        await persistStats();return unavailable(`语义服务暂时不可用（${error.code}）`);
      }
    }
    return unavailable('语义服务暂时不可用');
  }).catch(()=>unavailable('请求队列繁忙，保留内容')).finally(()=>{if(inflight.get(id)===task)inflight.delete(id);});
  inflight.set(id,task);return task;
}
function trustedUI(sender:chrome.runtime.MessageSender):boolean {
  return sender.id===chrome.runtime.id && [chrome.runtime.getURL('options.html'),chrome.runtime.getURL('popup.html')].includes(sender.url??'');
}
function pageSender(sender:chrome.runtime.MessageSender):boolean {
  try{return sender.id===chrome.runtime.id&&sender.frameId===0&&new URL(sender.url??'').origin==='https://weibo.com'&&sender.tab?.id!==undefined;}catch{return false;}
}
async function broadcast(){const tabs=await chrome.tabs.query({url:'https://weibo.com/*'});await Promise.allSettled(tabs.map(tab=>chrome.tabs.sendMessage(tab.id!,{type:'settingsChanged',settings})));}
let saving:Promise<unknown>=Promise.resolve();
async function handle(message:any,sender:chrome.runtime.MessageSender):Promise<unknown>{
  await ready;if(!message||typeof message.type!=='string')throw Error('无效请求');
  const ui=trustedUI(sender),page=pageSender(sender);if(!ui&&!page)throw Error('无效来源');
  if(message.type==='getSettings')return {settings,hasKey:!!apiKey,stats,breaker,policyVersion:POLICY_VERSION,schemaVersion:SCHEMA_VERSION};
  if(message.type==='decide'&&page){
    if(!validPost(message.post)||typeof message.sessionId!=='string'||message.sessionId.length>100)throw Error('无效微博');
    if(message.revision!==settings.revision)return {revision:settings.revision,decision:unavailable('设置已变化')};
    const s=settings;const decision={...await classify(message.post,s,cancelled.signal),policyVersion:await policyStamp(s),schemaVersion:SCHEMA_VERSION};
    if(s.collectSamples&&s.enabled&&s.accounts[message.post.authorId])await recordFeedback(message.post,decision,null,message.sessionId,s).catch(()=>{});
    return {revision:s.revision,decision};
  }
  if(message.type==='feedback'&&page){
    if(message.revision!==settings.revision)throw Error('设置已变化，请重新扫描后纠错');
    if(!validPost(message.post)||!['KEEP','COLLAPSE','DIM'].includes(message.label)||typeof message.sessionId!=='string'||message.sessionId.length>100)throw Error('无效反馈');
    // Feedback records carry bounded validated metadata, never arbitrary HTML or secrets.
    const d=message.decision as Decision;
    if(!d||!['visible','dimmed','collapsed'].includes(d.state)||typeof d.reason!=='string'||d.reason.length>300||JSON.stringify(d).length>3000)throw Error('无效判断');
    await recordFeedback(message.post,d,message.label,message.sessionId,settings);return {};
  }
  if(!ui)throw Error('仅设置页可执行此操作');
  if(message.type==='saveSettings'){
    saving=saving.catch(()=>{}).then(async()=>{
      const next=validateSettings(message.settings);next.revision=crypto.randomUUID();
      if(message.settings.revision!==settings.revision)throw Error('设置已在其他窗口更新，请刷新后再试');
      const replacementKey=typeof message.apiKey==='string'?message.apiKey.trim():'';
      let key=apiKey;
      if(message.clearKey)key='';else if(replacementKey){if(message.apiKey.length>500||/[\r\n]/.test(message.apiKey))throw Error('API key 格式无效');key=replacementKey;}
      if(next.endpoint!==settings.endpoint&&!replacementKey&&!message.clearKey&&apiKey)throw Error('更换服务地址时请重新填写对应 API key');
      if(next.semanticEnabled&&!key)throw Error('请先填写 API key');
      await chrome.storage.local.set({settings:next,apiKey:key});
      cancelled.abort();cancelled=new AbortController();queue.clear();inflight.clear();settings=next;apiKey=key;breaker={failures:0,until:0};
      await persistStats();await broadcast();return {settings,hasKey:!!apiKey};
    });return saving;
  }
  if(message.type==='testConnection'){
    if(!apiKey)throw Error('请先保存 API key');
    if(!await chrome.permissions.contains({origins:[new URL(settings.endpoint).origin+'/*']}))throw Error('请先授权模型域名');
    const p=new JevProvider(settings.endpoint,apiKey,settings.model,settings.timeoutMs,fetch,true);
    try {const result=await p.classify({text:'公司发布季度报告，营业收入增长百分之十。',repostText:'',visibleContext:'',decisions:['concrete_business_economic_information']},cancelled.signal);return {model:result.model,latencyMs:Math.round(result.latencyMs)};}catch(e){
      if(e instanceof ProviderError)throw Error(`连接失败：${e.code}${e.httpStatus?`（HTTP ${e.httpStatus}）`:''}${e.detail?`：${e.detail}`:''}`);
      throw Error('连接失败：network');
    }
  }
  if(message.type==='exportFeedback')return exportFeedback();
  if(message.type==='clearCache'){await clearCache();return {};}
  if(message.type==='clearFeedback'){await clearFeedback();return {};}
  throw Error('不支持的操作');
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{handle(message,sender).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error instanceof Error?error.message:'操作失败'}));return true;});
