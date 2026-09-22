// Only public Weibo photo CDN URLs are eligible; never forward arbitrary page URLs.
export function validImageUrl(value:unknown):value is string {
  if(typeof value!=='string'||value.length>2000)return false;
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.port&&/^(?:[a-z0-9-]+\.)*sinaimg\.cn$/.test(u.hostname);}catch{return false;}
}
