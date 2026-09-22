import type { Decision, WeiboPost } from '../shared/types';
import { POLICY_VERSION, SCHEMA_VERSION, VISION_MODEL, type Settings } from '../shared/settings';
export async function hash(value:unknown):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function cacheKey(post:WeiboPost,s:Settings):Promise<string> {
  return hash([post.authorId,post.text,post.repostText,post.visibleContext,post.postType,post.hasMedia,post.hasLinkCard,post.isTextTruncated,post.contextCompleteness,post.imageUrls,post.imagesComplete,post.hasVideo,s.provider,s.endpoint,s.model,SCHEMA_VERSION,POLICY_VERSION,s.thresholds,s.acknowledgements,s.globalRules,s.collapseOtherAccounts,s.visionEnabled,VISION_MODEL]);
}
export async function policyStamp(s:Settings):Promise<string>{return POLICY_VERSION+'-'+(await hash([s.thresholds,s.acknowledgements,s.globalRules,s.collapseOtherAccounts,s.visionEnabled,VISION_MODEL])).slice(0,12);}
interface CacheRow { id:string; decision:Decision; createdAt:number; }
export interface FeedbackRow {
  id:string; sessionId:string; contentHash:string; postId:string; authorId:string; label:'KEEP'|'DIM'|'COLLAPSE'|null;
  decision:Decision; policyVersion:string; schemaVersion:string; provider:string; requestedModel:string;
  thresholds:Settings['thresholds']; createdAt:string; text?:string; repostText?:string; visibleContext?:string;
}
let database:Promise<IDBDatabase>|undefined;
function db():Promise<IDBDatabase> {
  return database??=new Promise((resolve,reject)=>{
    const r=indexedDB.open('weibo-semantic-filter',1);
    r.onupgradeneeded=()=>{ r.result.createObjectStore('cache',{keyPath:'id'});r.result.createObjectStore('feedback',{keyPath:'id'}); };
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>{database=undefined;reject(r.error);};
  });
}
async function op<T>(store:'cache'|'feedback',mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
  const d=await db();return new Promise((resolve,reject)=>{
    const tx=d.transaction(store,mode),request=fn(tx.objectStore(store));let value:T;
    request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function getCached(id:string):Promise<Decision|null> {
  const row=await op<CacheRow|undefined>('cache','readonly',s=>s.get(id));
  return row&&Date.now()-row.createdAt<30*86400000?{...row.decision,cached:true}:null;
}
export async function putCached(id:string,decision:Decision):Promise<void> {
  await op('cache','readwrite',s=>s.put({id,decision,createdAt:Date.now()} satisfies CacheRow));
  if(await op<number>('cache','readonly',s=>s.count())>5000) {
    const rows=await op<CacheRow[]>('cache','readonly',s=>s.getAll());rows.sort((a,b)=>a.createdAt-b.createdAt);
    const d=await db();await new Promise<void>((resolve,reject)=>{const tx=d.transaction('cache','readwrite');for(const row of rows.slice(0,rows.length-4500))tx.objectStore('cache').delete(row.id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
  }
}
export async function recordFeedback(post:WeiboPost,decision:Decision,label:FeedbackRow['label'],sessionId:string,s:Settings):Promise<void> {
  const contentHash=await hash([post.authorId,post.text,post.repostText,post.visibleContext,post.imageUrls]);
  const id=await hash([sessionId,contentHash,s.revision]);
  const row:FeedbackRow={id,sessionId,contentHash,postId:post.postId,authorId:post.authorId,label,decision,
    policyVersion:await policyStamp(s),schemaVersion:SCHEMA_VERSION,provider:s.provider,requestedModel:s.model,thresholds:s.thresholds,createdAt:new Date().toISOString()};
  if(s.collectSamples){row.text=post.text;row.repostText=post.repostText;row.visibleContext=post.visibleContext;}
  // One transaction serializes sampling and manual corrections for the same store.
  const d=await db();
  await new Promise<void>((resolve,reject)=>{
    const tx=d.transaction('feedback','readwrite'),store=tx.objectStore('feedback');
    const request=store.get(id);
    request.onsuccess=()=>{row.label=label??(request.result as FeedbackRow|undefined)?.label??null;store.put(row);};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export const exportFeedback=()=>op<FeedbackRow[]>('feedback','readonly',s=>s.getAll());
export const clearCache=()=>op('cache','readwrite',s=>s.clear());
export const clearFeedback=()=>op('feedback','readwrite',s=>s.clear());
