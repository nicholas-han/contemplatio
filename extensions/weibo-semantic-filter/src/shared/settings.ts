export const ACCOUNTS = [
  { id: '1249424622', name: '但斌', policy: 'dan' },
  { id: '2820792015', name: '王文（股道热肠也）', policy: 'wang' },
  { id: '2173738960', name: '韩广斌', policy: 'retain' },
  { id: '2635695961', name: '老曾阿牛', policy: 'retain' },
] as const;
export const POLICY_VERSION = 'weibo-global-v4';
export const SCHEMA_VERSION = 'noul-zh-v2';
export const DEFAULT_THRESHOLDS = {
  danCollapseSocial: .92, danCollapseInformation: .20, danDimSocial: .75, danDimInformation: .40,
  wangCollapseNoise: .90, wangCollapseInformation: .25, wangDimNoise: .75, wangDimInformation: .40, investmentProtection: .50,
};
export const DEFAULT_GLOBAL_RULES={sports:true,sceneryPhotos:true,namedPeople:true};
export const VISION_MODEL='google/gemini-2.5-flash-lite';
export type Thresholds = typeof DEFAULT_THRESHOLDS;
export interface Settings {
  revision: string; enabled: boolean; mode: 'shadow' | 'active';
  collapseOtherAccounts: boolean;
  accounts: Record<string, boolean>; acknowledgements: string[]; thresholds: Thresholds;
  globalRules:typeof DEFAULT_GLOBAL_RULES; visionEnabled:boolean;
  provider: 'jev'; endpoint: string; model: string; timeoutMs: number; semanticEnabled: boolean;
  debug: boolean; collectSamples: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  collapseOtherAccounts:true,
  globalRules:{...DEFAULT_GLOBAL_RULES},visionEnabled:false,
  revision: 'initial', enabled: true, mode: 'shadow', accounts: Object.fromEntries(ACCOUNTS.map(a => [a.id,true])),
  acknowledgements: ['谢谢','感谢','哈哈','哈哈哈','同意','赞','赞同','好的','收到','嗯'],
  thresholds: {...DEFAULT_THRESHOLDS}, provider: 'jev', endpoint: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest',
  timeoutMs: 8000, semanticEnabled: false, debug: false, collectSamples: false,
};
export function validateEndpoint(value: unknown): string {
  if (typeof value !== 'string' || value.length>500) throw Error('模型地址无效');
  const u=new URL(value);
  if(u.protocol!=='https:' || u.username || u.password || u.hash || u.search) throw Error('模型地址必须是不含凭证或查询参数的 HTTPS 地址');
  return u.href;
}
export function validateSettings(value: unknown): Settings {
  if(!value || typeof value!=='object') throw Error('设置格式无效');
  const s=value as Settings;
  if(!['shadow','active'].includes(s.mode) || s.provider!=='jev') throw Error('模式或服务无效');
  for(const name of ['enabled','semanticEnabled','debug','collectSamples'] as const) if(typeof s[name]!=='boolean') throw Error('设置开关无效');
  if(typeof s.model!=='string'|| !/^[\w./:-]{1,100}$/.test(s.model)) throw Error('模型名称无效');
  if(!Number.isFinite(s.timeoutMs)||s.timeoutMs<1000||s.timeoutMs>20000) throw Error('超时应为 1–20 秒');
  const globalRules={...DEFAULT_GLOBAL_RULES,...s.globalRules};
  for(const value of Object.values(globalRules))if(typeof value!=='boolean')throw Error('通用规则开关无效');
  const visionEnabled=s.visionEnabled??false;if(typeof visionEnabled!=='boolean')throw Error('图片识别开关无效');
  const collapseOtherAccounts=s.collapseOtherAccounts??true;if(typeof collapseOtherAccounts!=='boolean')throw Error('其他账号折叠开关无效');
  if(visionEnabled&&new URL(s.endpoint).origin!=='https://ai-gateway.vercel.sh')throw Error('图片识别目前需要使用 Vercel AI Gateway 地址与 key');
  const thresholds={...DEFAULT_THRESHOLDS};
  for(const key of Object.keys(thresholds) as (keyof Thresholds)[]) {
    const n=s.thresholds?.[key]; if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1) throw Error('阈值必须为 0–1'); thresholds[key]=n;
  }
  if(thresholds.danCollapseSocial<thresholds.danDimSocial || thresholds.danCollapseInformation>thresholds.danDimInformation || thresholds.wangCollapseNoise<thresholds.wangDimNoise || thresholds.wangCollapseInformation>thresholds.wangDimInformation) throw Error('折叠阈值必须比灰化更保守');
  if(!Array.isArray(s.acknowledgements)||s.acknowledgements.length>100||s.acknowledgements.some(w=>typeof w!=='string'||!w.trim()||w.length>12)) throw Error('互动词表最多 100 个短词，每词不超过 12 字');
  const accounts=Object.fromEntries(ACCOUNTS.map(a=>{if(typeof s.accounts?.[a.id]!=='boolean')throw Error('账号开关无效');return[a.id,s.accounts[a.id]!];}));
  return {globalRules,visionEnabled,collapseOtherAccounts,revision:typeof s.revision==='string'?s.revision:'initial', enabled:s.enabled,mode:s.mode,accounts,acknowledgements:[...new Set(s.acknowledgements.map(w=>w.trim()))],thresholds,provider:'jev',endpoint:validateEndpoint(s.endpoint),model:s.model,timeoutMs:s.timeoutMs,semanticEnabled:s.semanticEnabled,debug:s.debug,collectSamples:s.collectSamples};
}
