import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { extractPost, supportedPage } from '../src/content/weibo-dom-adapter';
import { render, restore, installStyle } from '../src/content/renderer';

test('supported routes exclude details, searches and foreign origins', () => {
  for (const url of ['https://weibo.com/','https://weibo.com/u/1249424622','https://weibo.com/1249424622']) assert.equal(supportedPage(url),true);
  for (const url of ['https://weibo.com/1249424622/R123','https://weibo.com/hot','https://example.com/u/123']) assert.equal(supportedPage(url),false);
});
test('anonymous real desktop DOM fixtures preserve extraction contracts', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures/desktop-2026-09-21.json',import.meta.url),'utf8'));
  assert.ok(fixtures.length>=20);
  for (const fixture of fixtures) {
    const dom = new JSDOM(fixture.html,{url:'https://weibo.com/'});
    const post=extractPost(dom.window.document.querySelector('article')!);
    assert.ok(post,fixture.sourceHash);
    for(const [key,value] of Object.entries(fixture.expected)) assert.equal(post[key as keyof typeof post],value,`${fixture.sourceHash}: ${key}`);
    dom.window.close();
  }
});
test('folding never replaces native nodes; repeated renders mount one control and restore preserves listeners', () => {
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/desktop-2026-09-21.json',import.meta.url),'utf8'))[0];
  const dom=new JSDOM(fixture.html,{url:'https://weibo.com/'});
  Object.assign(globalThis,{document:dom.window.document});
  const card=document.querySelector('article')!; const post=extractPost(card)!; const body=card.querySelector('.wbpro-feed-content')!;
  let nativeClicks=0;body.addEventListener('click',()=>nativeClicks++);
  const removeStyle=installStyle();
  for(let i=0;i<3;i++) render(card,post,{state:'collapsed',reason:'test',source:'local'},'collapsed',{shadow:false,onExpand:()=>restore(card),onFeedback:()=>{}});
  assert.equal(card.querySelectorAll('[data-wsf-control="bar"]').length,1);
  assert.equal(dom.window.getComputedStyle(body).display,'none');
  assert.equal(extractPost(card)!.elementFingerprint,post.elementFingerprint);
  (card.querySelector('[data-wsf-control] button') as HTMLButtonElement).click();
  assert.equal(card.hasAttribute('data-wsf-state'),false);assert.equal(card.querySelector('.wbpro-feed-content'),body);
  body.dispatchEvent(new dom.window.Event('click'));assert.equal(nativeClicks,1);
  removeStyle();dom.window.close();
});
test('uncertain author, missing text structure and nested articles fail open', () => {
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/desktop-2026-09-21.json',import.meta.url),'utf8'))[0];
  for(const selector of ['header','.wbpro-feed-content']) {
    const dom=new JSDOM(fixture.html);const card=dom.window.document.querySelector('article')!;card.querySelector(selector)!.remove();assert.equal(extractPost(card),null);dom.window.close();
  }
});
test('photo-only posts expose only public CDN photos and fingerprint changes with images',()=>{
  const dom=new JSDOM('<article><header><a href="/u/2173738960">韩广斌</a><a href="/2173738960/Photo1">今天</a></header><div class="wbpro-feed-content"><div class="picture"><img class="woo-picture-img" src="https://wx1.sinaimg.cn/large/a.jpg"></div></div></article>',{url:'https://weibo.com/'});
  const card=dom.window.document.querySelector('article')!,first=extractPost(card)!;
  assert.equal(first.text,'');assert.equal(first.imagesComplete,true);assert.equal(first.hasMedia,true);
  assert.deepEqual(first.imageUrls,['https://wx1.sinaimg.cn/large/a.jpg']);
  card.querySelector('img')!.setAttribute('src','https://evil.invalid/a.jpg');
  const changed=extractPost(card)!;assert.deepEqual(changed.imageUrls,[]);assert.equal(changed.imagesComplete,false);assert.notEqual(first.elementFingerprint,changed.elementFingerprint);dom.window.close();
});
test('empty-comment reposts retain original context and repeated permalinks are unambiguous',()=>{
  const dom=new JSDOM('<article><header><a href="/u/2820792015">王文</a><a href="/2820792015/Repost1">今天</a><a href="/2820792015/Repost1?x=1">时间</a></header><div class="wbpro-feed-content"><div class="wbpro-feed-ogText"></div></div><div class="retweet"><div class="wbpro-feed-reText"><div class="_wbtext_test_1">林园谈投资</div></div></div></article>',{url:'https://weibo.com/'});
  const card=dom.window.document.querySelector('article')!,post=extractPost(card)!;
  assert.ok(post);assert.equal(post.text,'');assert.equal(post.repostText,'林园谈投资');assert.equal(post.postType,'repost');assert.equal(post.contextCompleteness,'complete');
  card.querySelector('.wbpro-feed-ogText')!.textContent='陌生结构内的正文';assert.equal(extractPost(card),null);
  dom.window.close();
});
test('retention banners remain visible with debug disabled',()=>{
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/desktop-2026-09-21.json',import.meta.url),'utf8'))[0];
  const dom=new JSDOM(fixture.html,{url:'https://weibo.com/'});Object.assign(globalThis,{document:dom.window.document});
  const card=document.querySelector('article')!;
  render(card,extractPost(card)!,{state:'visible',source:'protected',reason:'保留内容'},'visible',{shadow:true,debug:false,onExpand:()=>{},onFeedback:()=>{}});
  assert.match(card.querySelector('[data-wsf-control="bar"]')!.textContent!,/保留/);assert.equal(card.querySelectorAll('details').length,0);assert.equal(card.querySelectorAll('[data-wsf-control="bar"] button').length,2);dom.window.close();
});
test('photo cards with unfamiliar nonempty body text are not treated as pure photos',()=>{
  const dom=new JSDOM('<article><header><a href="/u/2173738960">作者</a><a href="/2173738960/Photo2">今天</a></header><div class="wbpro-feed-content"><div class="new-text">公司发布重要经营数据</div><div class="picture"><img src="https://wx1.sinaimg.cn/large/a.jpg"></div></div></article>',{url:'https://weibo.com/'});
  assert.equal(extractPost(dom.window.document.querySelector('article')!),null);dom.window.close();
});
