import {ACCOUNTS,DEFAULT_SETTINGS,DEFAULT_THRESHOLDS,validateSettings,type Settings} from '../shared/settings';
import {rpc} from '../shared/messages';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
let settings:Settings=structuredClone(DEFAULT_SETTINGS);
let ready=false,busy=false,testing=false;
function lockForm(value:boolean){busy=value;document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement>('#settings-form input,#settings-form select,#settings-form textarea,#settings-form button').forEach(control=>{control.disabled=busy||!ready||(testing&&control.id==='test');});}
const names:Record<string,string>={danCollapseSocial:'但斌：折叠最低互动分',danCollapseInformation:'但斌：折叠最高信息分',danDimSocial:'但斌：灰化最低互动分',danDimInformation:'但斌：灰化最高信息分',wangCollapseNoise:'王文：折叠最低噪音分',wangCollapseInformation:'王文：折叠最高信息分',wangDimNoise:'王文：灰化最低噪音分',wangDimInformation:'王文：灰化最高信息分',investmentProtection:'价值投资保护最低分'};
for(const account of ACCOUNTS){const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.id='account-'+account.id;label.append(input,document.createTextNode(` ${account.name} · ${account.policy==='retain'?'仅应用通用规则':account.policy==='dan'?'纯互动过滤':'哲理与诗词过滤'}`));el('accounts').append(label);}
for(const key of Object.keys(DEFAULT_THRESHOLDS)){const label=document.createElement('label');label.textContent=names[key]!;const input=document.createElement('input');input.id=key;input.type='number';input.min='0';input.max='1';input.step='.01';label.append(input);el('thresholds').append(label);}
function status(text:string,error=false){el('status').textContent=text;el('status').classList.toggle('error',error);}
function fill(){
  for(const key of ['sports','sceneryPhotos','namedPeople'] as const)el<HTMLInputElement>(key).checked=settings.globalRules[key];
  for(const key of ['enabled','debug','semanticEnabled','collectSamples','visionEnabled','collapseOtherAccounts'] as const)el<HTMLInputElement>(key).checked=settings[key];
  for(const key of ['mode','endpoint','model'] as const)el<HTMLInputElement>(key).value=settings[key];
  el<HTMLInputElement>('timeout').value=String(settings.timeoutMs/1000);el<HTMLTextAreaElement>('acknowledgements').value=settings.acknowledgements.join('\n');
  for(const a of ACCOUNTS)el<HTMLInputElement>('account-'+a.id).checked=settings.accounts[a.id]!;
  for(const [key,value]of Object.entries(settings.thresholds))el<HTMLInputElement>(key).value=String(value);
}
function collect():Settings{
  return validateSettings({...settings,collapseOtherAccounts:el<HTMLInputElement>('collapseOtherAccounts').checked,globalRules:{sports:el<HTMLInputElement>('sports').checked,sceneryPhotos:el<HTMLInputElement>('sceneryPhotos').checked,namedPeople:el<HTMLInputElement>('namedPeople').checked},visionEnabled:el<HTMLInputElement>('visionEnabled').checked,enabled:el<HTMLInputElement>('enabled').checked,mode:el<HTMLSelectElement>('mode').value,
    debug:el<HTMLInputElement>('debug').checked,semanticEnabled:el<HTMLInputElement>('semanticEnabled').checked,collectSamples:el<HTMLInputElement>('collectSamples').checked,
    endpoint:el<HTMLInputElement>('endpoint').value,model:el<HTMLInputElement>('model').value,timeoutMs:Number(el<HTMLInputElement>('timeout').value)*1000,
    acknowledgements:el<HTMLTextAreaElement>('acknowledgements').value.split('\n').map(w=>w.trim()).filter(Boolean),
    accounts:Object.fromEntries(ACCOUNTS.map(a=>[a.id,el<HTMLInputElement>('account-'+a.id).checked])),
    thresholds:Object.fromEntries(Object.keys(DEFAULT_THRESHOLDS).map(k=>[k,Number(el<HTMLInputElement>(k).value)]))});
}
function keyState(hasKey:boolean){el<HTMLInputElement>('apiKey').value='';el<HTMLInputElement>('apiKey').placeholder=hasKey?'已保存；留空保持当前 key':'填写后保存在扩展本地';el<HTMLInputElement>('clearKey').checked=false;}
async function loadSettings(){const data=await rpc({type:'getSettings'});settings=data.settings;fill();keyState(data.hasKey);el('stats').textContent=`本次浏览器运行：模型调用 ${data.stats.calls} 次 · 缓存命中 ${data.stats.cacheHits} 次 · 错误 ${data.stats.errors} 次。实际费用请以服务商账单为准。`;ready=true;}
el('settings-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!ready)return;
  let next:Settings;try{next=collect();}catch(e){status((e as Error).message,true);return;}
  const apiKey=el<HTMLInputElement>('apiKey').value,clearKey=el<HTMLInputElement>('clearKey').checked;
  lockForm(true);status('正在保存…');
  try{
    // Begin the permission request in the original user gesture, before awaiting.
    const permission=next.semanticEnabled?chrome.permissions.request({origins:[new URL(next.endpoint).origin+'/*']}):Promise.resolve(true);
    if(!await permission)throw Error('模型域名未授权，设置尚未保存');
    const result=await rpc({type:'saveSettings',settings:next,apiKey,clearKey});settings=result.settings;keyState(result.hasKey);fill();status('已保存');
  }catch(e){try{await loadSettings();}catch{ready=false;}status(e instanceof Error?e.message:'保存失败',true);}
  finally{lockForm(false);}
});
el('test').addEventListener('click',()=>{
  if(busy||!ready||testing)return;testing=true;lockForm(busy);
  const report=(text:string,error=false)=>{status(text,error);el('connection-status').textContent=text;el('connection-status').classList.toggle('error',error);};
  report('正在测试…');void rpc({type:'testConnection'}).then(r=>report(`连接成功 · ${r.model} · ${r.latencyMs} ms`)).catch(e=>report(e.message,true)).finally(()=>{testing=false;lockForm(busy);});
});
el('defaults').addEventListener('click',()=>{settings={...collect(),thresholds:{...DEFAULT_THRESHOLDS},acknowledgements:[...DEFAULT_SETTINGS.acknowledgements]};fill();status('已恢复默认值，保存后生效');});
el('clearCache').addEventListener('click',()=>void rpc({type:'clearCache'}).then(()=>status('分类缓存已清除')).catch(e=>status(e.message,true)));
el('clearFeedback').addEventListener('click',()=>{if(confirm('删除全部本地反馈与已保存样本？此操作无法恢复。'))void rpc({type:'clearFeedback'}).then(()=>status('本地反馈已删除')).catch(e=>status(e.message,true));});
el('export').addEventListener('click',()=>void rpc({type:'exportFeedback'}).then(rows=>{const blob=new Blob([JSON.stringify({format:'weibo-feedback-v1',exportedAt:new Date().toISOString(),rows},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='weibo-feedback-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status(`已导出 ${rows.length} 条记录`);}).catch(e=>status(e.message,true)));
lockForm(true);void loadSettings().catch(e=>status(e.message,true)).finally(()=>lockForm(false));
