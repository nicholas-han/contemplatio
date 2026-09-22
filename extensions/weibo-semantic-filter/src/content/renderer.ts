import type { Decision, DisplayState, WeiboPost } from '../shared/types';

export const STYLE = `
[data-wsf-control]{all:initial;display:block;box-sizing:border-box;font:12px/1.6 system-ui,sans-serif;color:#475569;background:#f8fafc;border:1px solid #dbe4ec;border-radius:7px;margin:8px 12px;padding:8px 10px;position:relative;z-index:1}
[data-wsf-control] button{font:inherit;border:1px solid #cbd5e1;background:white;color:#334155;border-radius:5px;padding:2px 7px;margin:2px 3px;cursor:pointer}
[data-wsf-control] button:focus-visible{outline:2px solid #0f766e;outline-offset:2px}
[data-wsf-control] summary{cursor:pointer}[data-wsf-control] details{display:inline-block;margin-left:6px}[data-wsf-control] details[open]{display:block}[data-wsf-control] pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.6 monospace;max-height:180px;overflow:auto}
article[data-wsf-state="collapsed"] > :not([data-wsf-control="bar"]){display:none!important}
article[data-wsf-state="collapsed"] .wbpro-feed-content,article[data-wsf-state="collapsed"] .retweet{display:none!important}
article[data-wsf-state="dimmed"] .wbpro-feed-content,article[data-wsf-state="dimmed"] .retweet{opacity:.58}
article[data-wsf-state="dimmed"]:hover .wbpro-feed-content,article[data-wsf-state="dimmed"]:hover .retweet,article[data-wsf-state="dimmed"]:focus-within .wbpro-feed-content,article[data-wsf-state="dimmed"]:focus-within .retweet{opacity:1}
`;
export function installStyle(): () => void {
  const style = document.createElement('style'); style.dataset.wsfControl = 'style'; style.textContent = STYLE;
  document.head.append(style); return () => style.remove();
}
export function restore(card: Element): void {
  card.removeAttribute('data-wsf-state');
  card.querySelectorAll('[data-wsf-control="bar"]').forEach(e => e.remove());
}
export function renderStatus(card:Element,text:string):void {
  const existing=card.querySelector('[data-wsf-control="bar"]');
  if(existing?.getAttribute('data-wsf-status')===text)return;
  restore(card);
  const bar=document.createElement('div');bar.dataset.wsfControl='bar';bar.dataset.wsfStatus=text;
  bar.setAttribute('role','status');bar.textContent=text;card.prepend(bar);
}
export function render(card: Element, post: WeiboPost, decision: Decision, state: DisplayState,
  opts: { shadow: boolean; expanded?: boolean; debug?: boolean; feedbackText?:string; onExpand: () => void; onFeedback: (label: 'KEEP' | 'COLLAPSE') => void }): void {
  restore(card);
  if (state !== 'visible') card.setAttribute('data-wsf-state', state);
  const bar = document.createElement('div'); bar.dataset.wsfControl = 'bar';
  const label = opts.shadow ? '建议' : opts.expanded ? (decision.applyInShadow?'已展开 · 原规则':'已展开 · 原建议') : state === 'visible' ? '' : '已';
  const names = { collapsed: '折叠', dimmed: '灰化', visible: '保留' };
  const score = decision.source==='model'&&decision.scores ? Math.max(decision.scores.sports_content??0,decision.scores.social_interaction??0,decision.scores.life_philosophy??0,decision.scores.poetry_or_sentiment??0) : undefined;
  const title = document.createElement('span'); title.textContent = `${post.authorName} · ${label}${names[decision.state]}：${decision.reason}${score===undefined?'':` ${Math.round(score*100)}%`} `; bar.append(title);
  const button = (text: string, fn: () => void) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fn(); }); bar.append(b);
  };
  if (state !== 'visible') button('展开', opts.onExpand);
  button('应保留', () => opts.onFeedback('KEEP')); button('应折叠', () => opts.onFeedback('COLLAPSE'));
  if(opts.feedbackText){const feedback=document.createElement('span');feedback.setAttribute('role','status');feedback.textContent=opts.feedbackText;bar.append(feedback);}
  if(opts.debug){const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = '判断详情';
  const pre = document.createElement('pre'); pre.textContent = JSON.stringify(decision, null, 2);
  details.append(summary, pre); bar.append(details);}
  card.prepend(bar);
}
