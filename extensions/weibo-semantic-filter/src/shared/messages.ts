import type { WeiboPost } from './types';
import {validImageUrl} from './media';
export async function rpc<T=any>(message:unknown):Promise<T> {
  const result=await chrome.runtime.sendMessage(message);
  if(!result?.ok)throw Error(result?.error??'扩展连接中断，请刷新微博');
  return result.data as T;
}
export function validPost(value:unknown):value is WeiboPost {
  if(!value||typeof value!=='object')return false;
  const p=value as WeiboPost;
  if(p.imageUrls!==undefined&&(!Array.isArray(p.imageUrls)||p.imageUrls.length>18||p.imageUrls.some(u=>!validImageUrl(u))))return false;
  if(p.imagesComplete!==undefined&&typeof p.imagesComplete!=='boolean'||p.hasVideo!==undefined&&typeof p.hasVideo!=='boolean')return false;
  for(const key of ['postId','authorId','authorName','text','repostText','visibleContext','canonicalUrl','elementFingerprint'] as const)if(typeof p[key]!=='string')return false;
  if(!/^\d{5,20}$/.test(p.authorId)||!/^[a-zA-Z0-9]{1,40}$/.test(p.postId)||p.authorName.length>100)return false;
  if(p.text.length+p.repostText.length+p.visibleContext.length>24000||p.elementFingerprint.length>50000)return false;
  if(!['original','repost','reply','unknown'].includes(p.postType)||!['complete','unknown'].includes(p.contextCompleteness))return false;
  if(['hasMedia','hasLinkCard','isTextTruncated'].some(k=>typeof (p as any)[k]!=='boolean'))return false;
  return p.canonicalUrl===`https://weibo.com/${p.authorId}/${p.postId}`;
}
