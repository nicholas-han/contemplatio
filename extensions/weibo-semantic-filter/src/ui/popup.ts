import {rpc} from '../shared/messages';
import type {Settings} from '../shared/settings';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
let settings:Settings;let tabId:number|undefined;
function status(text:string,error=false){el('status').textContent=text;el('status').classList.toggle('error',error);}
async function refresh(){
  const data=await rpc({type:'getSettings'});settings=data.settings;
  el<HTMLInputElement>('enabled').checked=settings.enabled;el<HTMLSelectElement>('mode').value=settings.mode;
  el('provider').textContent=Date.now()<data.breaker.until?'语义服务暂时不可用，内容保持原样':settings.semanticEnabled&&data.hasKey?'语义服务已配置':'本地规则可用 · 语义服务未启用';
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab?.id;
  try{if(tabId===undefined)throw Error();const response=await chrome.tabs.sendMessage(tabId,{type:'pageStats'});if(!response?.ok)throw Error();const s=response.data;
    for(const id of ['scanned','collapsed','dimmed'])el(id).textContent=String(s[id]);el('suggested').textContent=`本页建议：折叠 ${s.suggestedCollapse} · 灰化 ${s.suggestedDim}`;
    el('diagnostic').textContent=s.supported?`当前识别 ${s.recognized}/${s.detected} 张卡片 · 已完成 ${s.completed??0} 条${s.errors?' · 部分处理失败，已保留':''}${settings.debug&&s.reasons?'。'+Object.entries(s.reasons).map(([reason,count])=>`${reason} ${count} 条`).join('；'):''}`:'当前页面不在支持范围';
    el('expandAll').textContent=s.paused?'恢复本页过滤':'本页全部展开';
  }catch{el('diagnostic').textContent='请打开微博首页或账号主页；安装后先刷新微博。';el<HTMLButtonElement>('expandAll').disabled=true;el<HTMLButtonElement>('rescan').disabled=true;}
}
for(const id of ['enabled','mode'])el(id).addEventListener('change',()=>{
  settings={...settings,enabled:el<HTMLInputElement>('enabled').checked,mode:el<HTMLSelectElement>('mode').value as Settings['mode']};
  void rpc({type:'saveSettings',settings}).then(()=>refresh()).catch(e=>status(e.message,true));
});
for(const id of ['expandAll','rescan'])el(id).addEventListener('click',()=>{if(tabId!==undefined)void chrome.tabs.sendMessage(tabId,{type:id}).then(()=>refresh()).catch(()=>status('请刷新微博后再试',true));});
el('options').addEventListener('click',()=>void chrome.runtime.openOptionsPage());
void refresh().catch(e=>status(e.message,true));
