import {extractPost,observeFeed,supportedPage} from './weibo-dom-adapter';
import {installStyle,render,renderStatus,restore} from './renderer';
import {DEFAULT_SETTINGS,POLICY_VERSION,SCHEMA_VERSION,type Settings} from '../shared/settings';
import {accountScopeDecision} from '../policy/decision-engine';
import {rpc} from '../shared/messages';
import {pageRequestTimeout} from '../shared/request-budget';
import type {Decision,DisplayState,WeiboPost} from '../shared/types';

type Entry={post:WeiboPost;decision?:Decision;revision:string;pending:boolean};
const entries=new Map<Element,Entry>();
const unrecognized=new Set<Element>();
const expanded=new Set<string>();const forced=new Set<string>();
const feedback=new Map<string,{label:'KEEP'|'COLLAPSE';state:'saving'|'saved'|'failed'}>();
const counts=new Map<string,Decision>();
let settings:Settings=structuredClone(DEFAULT_SETTINGS),route=location.href,paused=false,disposed=false,failed=0;
let settingsReady=false;
const sessionId=crypto.randomUUID();
const removeStyle=installStyle();
const identity=(p:WeiboPost)=>p.authorId+'/'+p.postId;
function show(card:Element,entry:Entry){
  if(!settings.enabled||!supportedPage(location.href)||paused){restore(card);return;}
  if(!entry.decision){renderStatus(card,entry.pending?'正在判断，暂时保留…':'等待处理，暂时保留…');return;}
  const key=identity(entry.post),isExpanded=expanded.has(key);
  const shadow=settings.mode==='shadow'&&!entry.decision.applyInShadow;
  const state:DisplayState=forced.has(key)?'collapsed':shadow||isExpanded?'visible':entry.decision.state;
  const shownDecision=forced.has(key)?{...entry.decision,state:'collapsed' as const,source:'local' as const,reason:'手动折叠'}:entry.decision;
  const mark=feedback.get(key);
  const feedbackText=mark?(mark.state==='saving'?'正在保存反馈…':mark.state==='failed'?'反馈保存失败，可点击重试；本页操作已生效':`已记录：${mark.label==='KEEP'?'应保留':'应折叠'} · 本页已${state==='collapsed'?'折叠':'展开'}`):undefined;
  render(card,entry.post,shownDecision,state,{shadow:shadow&&!forced.has(key),expanded:isExpanded,debug:settings.debug,feedbackText,
    onExpand:()=>{expanded.add(key);forced.delete(key);refreshIdentity(key);},
    onFeedback:label=>{
      if(label==='KEEP'){expanded.add(key);forced.delete(key);}else {expanded.delete(key);forced.add(key);}
      const mark={label,state:'saving' as 'saving'|'saved'|'failed'};feedback.set(key,mark);refreshIdentity(key);
      void rpc({type:'feedback',post:entry.post,decision:entry.decision,label,sessionId,revision:entry.revision}).then(()=>{mark.state='saved';}).catch(()=>{mark.state='failed';failed++;}).finally(()=>{if(!disposed&&feedback.get(key)===mark)refreshIdentity(key);});
    }});
}
function refreshIdentity(key:string){for(const [card,entry] of entries)if(identity(entry.post)===key)show(card,entry);}
let active=0;const waiting=new Set<Element>();
function pump(){
  if(disposed||!settingsReady||!settings.enabled||!supportedPage(location.href))return;
  while(active<2&&waiting.size){const card=waiting.values().next().value!;waiting.delete(card);const entry=entries.get(card);if(!entry||entry.pending||entry.decision||!card.isConnected)continue;
    active++;entry.pending=true;show(card,entry);const revision=settings.revision;const fingerprint=entry.post.elementFingerprint;const page=route;
    let timer:ReturnType<typeof setTimeout>;
    void Promise.race([
      rpc<{revision:string;decision:Decision}>({type:'decide',post:entry.post,revision,sessionId}),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),pageRequestTimeout(settings));}),
    ]).then(result=>{
      if(disposed||entries.get(card)!==entry||route!==page||settings.revision!==revision||!card.isConnected)return;
      if(extractPost(card)?.elementFingerprint!==fingerprint){inspect([card]);return;}
      if(result.revision!==revision)throw Error('stale-settings');
      entry.decision=result.decision;counts.set(identity(entry.post),result.decision);show(card,entry);
    }).catch(()=>{if(!disposed&&entries.get(card)===entry){entry.decision={state:'visible',reason:'扩展连接暂时不可用，请点击插件“重新扫描”或刷新微博重试',source:'unavailable'};counts.set(identity(entry.post),entry.decision);failed++;show(card,entry);}})
    .finally(()=>{clearTimeout(timer!);entry.pending=false;active--;pump();});
  }
}
const io=new IntersectionObserver(records=>{for(const record of records)if(record.isIntersecting){waiting.add(record.target);}pump();},{rootMargin:'600px'});
function inspect(cards:Element[]){
  if(disposed||!settingsReady||!settings.enabled||!supportedPage(location.href))return;
  for(const card of cards){
    try{
      if(card.parentElement?.closest('article'))continue;
      const post=extractPost(card);if(!post){entries.delete(card);waiting.delete(card);io.unobserve(card);unrecognized.add(card);if(!paused)renderStatus(card,'暂时保留：无法完整识别卡片，等待页面加载');continue;}
      unrecognized.delete(card);
      const existing=entries.get(card);
      if(existing?.post.elementFingerprint===post.elementFingerprint&&existing.revision===settings.revision){
        // Vue can remove our injected controls; restore them without duplicate requests.
        if(!card.querySelector('[data-wsf-control="bar"]'))show(card,existing);
        continue;
      }
      restore(card);const entry:Entry={post,revision:settings.revision,pending:false};entries.set(card,entry);
      // This deterministic scope rule must not wait behind slow semantic requests.
      const scope=accountScopeDecision(post,settings);
      if(scope?.applyInShadow){
        entry.decision={...scope,policyVersion:POLICY_VERSION,schemaVersion:SCHEMA_VERSION};
        counts.set(identity(post),entry.decision);waiting.delete(card);io.unobserve(card);show(card,entry);continue;
      }
      counts.set(identity(post),{state:'visible',source:'protected',reason:'等待处理'});show(card,entry);io.unobserve(card);io.observe(card);
    }catch{failed++;if(!paused)renderStatus(card,'暂时保留：卡片处理异常，请重新扫描');}
  }
}
function clearCards(){for(const card of new Set([...entries.keys(),...unrecognized]))restore(card);unrecognized.clear();entries.clear();waiting.clear();io.disconnect();}
function resetPage(){clearCards();counts.clear();failed=0;inspect([...document.querySelectorAll('article')]);}
const stopObserver=observeFeed(inspect);
const timer=setInterval(()=>{
  if(!chrome.runtime?.id){dispose();return;}
  if(location.href!==route){route=location.href;paused=false;resetPage();}
  for(const [card] of entries)if(!card.isConnected){entries.delete(card);waiting.delete(card);io.unobserve(card);}
  for(const card of unrecognized)if(!card.isConnected)unrecognized.delete(card);
},750);
function dispose(){if(disposed)return;disposed=true;stopObserver();clearInterval(timer);clearCards();removeStyle();chrome.runtime.onMessage.removeListener(onMessage);}
function pageStats(){
  const decisions=[...counts.values()];
  return {supported:supportedPage(location.href),paused,scanned:counts.size,collapsed:document.querySelectorAll('article[data-wsf-state="collapsed"]').length,dimmed:document.querySelectorAll('article[data-wsf-state="dimmed"]').length,
    suggestedCollapse:decisions.filter(d=>d.state==='collapsed'&&!d.applyInShadow).length,suggestedDim:decisions.filter(d=>d.state==='dimmed').length,
    detected:document.querySelectorAll('article').length,recognized:entries.size,unrecognized:unrecognized.size,errors:failed,waiting:waiting.size,active,
    completed:decisions.filter(d=>d.reason!=='等待处理').length,
    reasons:Object.fromEntries([...new Set(decisions.map(d=>d.reason))].map(reason=>[reason,decisions.filter(d=>d.reason===reason).length]))};
}
function onMessage(message:any,sender:chrome.runtime.MessageSender,respond:(r:unknown)=>void){
  if(sender.id!==chrome.runtime.id)return;
  if(message.type==='settingsChanged'){settings=message.settings;settingsReady=true;resetPage();respond({ok:true});}
  else if(message.type==='pageStats')respond({ok:true,data:pageStats()});
  else if(message.type==='expandAll'){paused=!paused;for(const[card,entry]of entries)show(card,entry);for(const card of unrecognized){if(paused)restore(card);else renderStatus(card,'暂时保留：无法完整识别卡片，等待页面加载');}respond({ok:true,data:pageStats()});}
  else if(message.type==='rescan'){if(settingsReady)resetPage();else void loadSettings();respond({ok:true,data:pageStats()});}
}
chrome.runtime.onMessage.addListener(onMessage);
async function loadSettings(){
  try{const result=await rpc<{settings:Settings}>({type:'getSettings'});if(disposed)return;settings=result.settings;settingsReady=true;resetPage();}
  catch{if(disposed||settingsReady)return;failed++;if(supportedPage(location.href))for(const card of document.querySelectorAll('article')){if(card.parentElement?.closest('article'))continue;unrecognized.add(card);renderStatus(card,'暂时保留：插件设置读取失败，请刷新微博重试');}}
}
void loadSettings();
