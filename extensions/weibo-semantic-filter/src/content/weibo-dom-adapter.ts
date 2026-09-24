import type { WeiboPost } from '../shared/types';
import {validImageUrl} from '../shared/media';

// Verified on logged-in desktop weibo.com, 2026-09-21. Fail open when these contracts change.
export const SELECTORS = {
  card: 'article', header: 'header', body: '.wbpro-feed-content',
  original: '.wbpro-feed-ogText', repost: '.retweet', repostText: '.wbpro-feed-reText',
  text: '[class*="_wbtext_"]', expand: '.expand',
};

export function supportedPage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.origin === 'https://weibo.com' && (/^\/$/.test(u.pathname) || /^\/(?:u\/\d+|\d+|mygroups)(?:\/)?$/.test(u.pathname));
  } catch { return false; }
}

function textOf(root: Element): string {
  // Walk rather than innerText: this also works while our display state is collapsed.
  const walk = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent ?? '';
    if (node.nodeType !== 1) return '';
    const e = node as Element;
    if (e.matches('[data-wsf-control], .expand, script, style')) return '';
    if (e.tagName === 'BR') return '\n';
    if (e.tagName === 'IMG') return e.getAttribute('alt') ?? '';
    return [...e.childNodes].map(walk).join('');
  };
  return walk(root).replace(/[\u200b\u200c\ufeff]/g, '').replace(/[ \t]+/g, ' ').trim();
}

export function extractPost(card: Element): WeiboPost | null {
  try { return extractKnownPost(card); } catch { return null; }
}
function extractKnownPost(card: Element): WeiboPost | null {
  if (!card.matches(SELECTORS.card) || card.parentElement?.closest(SELECTORS.card)) return null;
  const header = card.querySelector(SELECTORS.header);
  const body = card.querySelector(SELECTORS.body);
  const original = body?.querySelector(SELECTORS.original);
  if (!header || !body || (!original&&!body.querySelector('.picture img, img.woo-picture-img'))) return null;
  const author = [...header.querySelectorAll<HTMLAnchorElement>('a[href]')].find(a => {const u=new URL(a.getAttribute('href')!, 'https://weibo.com');return u.origin==='https://weibo.com'&&/^\/u\/\d+$/.test(u.pathname);});
  if (!author) return null;
  const authorId = new URL(author.getAttribute('href')!, 'https://weibo.com').pathname.split('/')[2]!;
  const candidates = [...header.querySelectorAll<HTMLAnchorElement>('a[href]')].map(a => {
    try { return new URL(a.getAttribute('href')!, 'https://weibo.com'); } catch { return null; }
  }).filter((u): u is URL => Boolean(u && u.origin === 'https://weibo.com' && new RegExp(`^/${authorId}/[A-Za-z0-9]+$`).test(u.pathname)));
  // Avatar/time links may repeat the same permalink during hydration.
  const uniquePaths = new Set(candidates.map(u=>u.pathname));
  if (uniquePaths.size !== 1) return null;
  const canonicalUrl = candidates[0]!.origin + candidates[0]!.pathname;
  const repost = card.querySelector(SELECTORS.repost);
  const textNode = original?.querySelector(SELECTORS.text);
  const repostRegion = repost?.querySelector(SELECTORS.repostText);
  const repostNode = repostRegion?.querySelector(SELECTORS.text);
  // The source author is a sibling of the repost body, not part of its text node.
  // Only use the visible profile link in this region; exclude inline mentions.
  const repostAuthor = [...(repostRegion?.querySelectorAll<HTMLAnchorElement>('a[usercard][href]')??[])].find(a=>{
    if(a.closest(SELECTORS.text))return false;
    try{const u=new URL(a.getAttribute('href')!,'https://weibo.com');return u.origin==='https://weibo.com'&&/^\/(?:u\/\d+|n\/[^/]+)\/?$/.test(u.pathname);}catch{return false;}
  });
  const repostAuthorName = repostAuthor?textOf(repostAuthor):'';
  const visibleContext = repostAuthorName?`转发作者：${repostAuthorName}`:'';
  const photoNodes=[...card.querySelectorAll<HTMLImageElement>('.picture img, img.woo-picture-img')];
  const imageUrls=[...new Set(photoNodes.map(img=>img.currentSrc||img.getAttribute('src')||'').filter(validImageUrl))];
  // Weibo renders an empty original container for reposts without an added comment.
  // Do not interpret unfamiliar nonempty text markup as an empty comment.
  if (!textNode && original && textOf(original)) return null;
  if (!original && textOf(body)) return null;
  if (!textNode&&!photoNodes.length&&!(original&&repostNode)) return null;
  const text = textNode?textOf(textNode):'';
  const repostText = repostNode ? textOf(repostNode) : '';
  // All non-emoji images, including unfamiliar thumbnails, are conservatively media.
  const regions = [body, ...(repost ? [repost] : [])];
  const hasMedia = regions.some(r => Boolean(r.querySelector('video, audio, .picture, .woo-font--play')) || [...r.querySelectorAll('img')].some(img => !/^\[.+\]$/.test(img.getAttribute('alt') ?? '') && !img.closest('.woo-icon-wrap')));
  const hasLinkCard = regions.some(r => [...r.querySelectorAll<HTMLAnchorElement>('a[href]')].some(a => {
    try { const u = new URL(a.getAttribute('href')!, 'https://weibo.com'); return !['weibo.com', 's.weibo.com'].includes(u.hostname); } catch { return true; }
  }));
  const isTextTruncated = regions.some(r => [...r.querySelectorAll(SELECTORS.expand)].some(e => /展开/.test(e.textContent ?? '')));
  const contextCompleteness = repost && (!repostNode || !repostText) ? 'unknown' : 'complete';
  const postType = repost ? 'repost' : /^回复\s*@[^:：]+[:：]/u.test(text) ? 'reply' : 'original';
  const post: WeiboPost = { postId: candidates[0]!.pathname.split('/')[2]!, authorId,
    authorName: author.getAttribute('aria-label') || textOf(header.querySelector('a[usercard]') ?? author),
    text, repostText, visibleContext, canonicalUrl, postType, hasMedia, hasLinkCard,
    isTextTruncated, contextCompleteness, imageUrls,
    imagesComplete:photoNodes.length>0&&photoNodes.every(img=>validImageUrl(img.currentSrc||img.getAttribute('src')||''))&&!/查看全部\s*\d+\s*张|\+\s*\d+/.test(photoNodes.map(img=>img.parentElement?.textContent??'').join('')),
    hasVideo:Boolean(card.querySelector('video,audio,.woo-font--play')),elementFingerprint: '' };
  post.elementFingerprint = JSON.stringify([post.postId, authorId, text, repostText, visibleContext, postType, hasMedia, hasLinkCard, isTextTruncated, contextCompleteness,imageUrls,post.imagesComplete,post.hasVideo]);
  return post;
}

export function observeFeed(onCards: (cards: Element[]) => void): () => void {
  const pending = new Set<Element>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const enqueue = (node: Node) => {
    const e = node.nodeType === 1 ? node as Element : node.parentElement;
    if (!e || e.closest('[data-wsf-control]')) return;
    const card = e.closest(SELECTORS.card);
    if (card) pending.add(card);
    e.querySelectorAll(SELECTORS.card).forEach(c => pending.add(c));
  };
  const observer = new MutationObserver(records => {
    for (const record of records) {
      enqueue(record.target);
      record.addedNodes.forEach(enqueue);
    }
    if (timer || !pending.size) return;
    timer = setTimeout(() => { timer = undefined; const cards = [...pending].filter(e => e.isConnected); pending.clear(); onCards(cards); }, 100);
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'alt','src','srcset','class'] });
  onCards([...document.querySelectorAll(SELECTORS.card)]);
  return () => { observer.disconnect(); clearTimeout(timer); pending.clear(); };
}
