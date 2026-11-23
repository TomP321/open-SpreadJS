import React, { useState } from 'react';
import { useDesigner, useDesignerVersion } from './store.js';
import type GC from '@mescius/spread-sheets';
import { columnName, globalGC } from './app-helpers.js';
import { userManager } from './core-internals.js';

import { resolveText } from './resolve.js';

/** TASK 87: panel captions (`panels` subtree of the loaded resources). */
const P = (designer: { resources: Record<string, unknown> }, key: string, en: string): string => resolveText(`\${res.panels.${key}}`, designer.resources) || en;

/* Threaded comments dock panel ------------------------------------------- */

export function ThreadedCommentPanel(): React.ReactElement {
  const d = useDesigner();
  useDesignerVersion();
  const [filter, setFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const sheet = d.getWorkbook().getActiveSheet();
  const close = (): void => { d.executeSpecial('ShowThreadedComments', null); };
  const threads = sheet.threadedComments.all().filter((thread) => {
    if (filter === 'resolved') return thread.resolved();
    if (filter === 'active') return !thread.resolved();
    if (filter === 'mentions') {
      const me = globalGC()?.Spread?.Common?.UserManager?.current();
      return thread.all().some((reply) => (reply.message ?? []).some((block) => block.type === 1 && 'userId' in block && block.userId === me));
    }
    return true;
  });
  return (
    <div className="gc-designer-threaded-comment-panel gc-designer-dock-panel" data-open="true">
      <div className="gc-designer-dock-panel-header gc-designer-threaded-comment-header">
        <span className="gc-designer-dock-panel-title">{P(d, 'threadedComments', 'Threaded Comments')}</span>
        <button type="button" className="gc-designer-threaded-comment-new" title={P(d, 'newThread', 'New Threaded Comment')} onClick={() => d.commentUi().openThread()}>{P(d, 'new', 'New')}</button>
        <button type="button" className="gc-designer-dock-panel-close" title={resolveText('${res.close}', d.resources) || 'Close'} onClick={close}>×</button>
      </div>
      <div className="gc-designer-threaded-comment-toolbar">
        <button type="button" className="gc-designer-threaded-comment-reset" onClick={() => { sheet.threadedComments.clear(); d.invalidate(); }}>{P(d, 'resetAll', 'Reset All')}</button>
        <div className="gc-designer-threaded-comment-filter">
          <button type="button" className="gc-designer-threaded-comment-filter-button" onClick={() => setFilter((value) => value === '' ? null : '')}>{filter ? filterLabel(filter, d) : P(d, 'filterBy', 'Filter By')}</button>
          {filter === '' && (
            <div className="gc-designer-ribbon-dropdown gc-designer-threaded-comment-filter-menu" role="menu">
              {[['mentions', '@mentions Me'], ['active', 'Active Only'], ['resolved', 'Resolved Only']].map(([key, label]) => (
                <div key={key} role="menuitem" className="gc-designer-context-item" onClick={() => { setFilter(key); d.invalidate(); }}>{P(d, 'filter' + key, label)}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="gc-designer-threaded-comment-list">
        {threads.length === 0 && <div className="gc-designer-threaded-comment-empty">{P(d, 'noComments', 'No comments')}</div>}
        {threads.map((thread) => {
          const key = `${thread.row()}:${thread.col()}`;
          const replies = thread.all();
          const shown = expanded.has(key) ? replies : replies.slice(0, 1);
          const address = `${columnName(thread.col())}${thread.row() + 1}`;
          return (
            <div key={key} className={`gc-designer-threaded-comment-card${thread.resolved() ? ' gc-designer-threaded-comment-card-resolved' : ''}`} onClick={() => { sheet.setActiveCell(thread.row(), thread.col()); sheet.setSelection(thread.row(), thread.col(), 1, 1); d.invalidate(); }}>
              <div className="gc-designer-threaded-comment-card-address">{address}</div>
              {shown.map((reply, index) => <ThreadReplyRow key={index} reply={reply} />)}
              {replies.length > 1 && !expanded.has(key) && (
                <button type="button" className="gc-designer-threaded-comment-more" onClick={(event) => { event.stopPropagation(); setExpanded((value) => new Set(value).add(key)); }}>{P(d, 'seeMore', 'See more comments')}</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function filterLabel(filter: string, designer: { resources: Record<string, unknown> }): string {
  // TASK 87: display only — the filter STATE keys ('mentions'/'active'/'resolved') stay English.
  return filter === 'mentions' ? P(designer, 'filterMentions', '@mentions Me')
    : filter === 'active' ? P(designer, 'filterActive', 'Active Only')
      : filter === 'resolved' ? P(designer, 'filterResolved', 'Resolved Only') : P(designer, 'filterBy', 'Filter By');
}

function ThreadReplyRow({ reply }: { reply: GC.Spread.Sheets.ThreadedComments.IReply }): React.ReactElement {
  const users = userManager(globalGC());
  const name = users?._knownNameSync?.(reply.authorId) ?? reply.authorId ?? '';
  const color = threadUserColor(reply.authorId ?? '');
  const date = reply.createdAt instanceof Date ? reply.createdAt : new Date(reply.createdAt);
  const text = (reply.message ?? []).map((block) => {
    const content = block as { type?: number; userId?: string; value?: string; text?: string };
    return content.type === 1 ? `@${users?._knownNameSync?.(content.userId) ?? content.userId}` : content.value ?? content.text ?? '';
  }).join('');
  return (
    <div className="gc-designer-threaded-comment-reply">
      <div className="gc-designer-threaded-comment-avatar" style={{ background: color }}>{(name || '?').slice(0, 1).toUpperCase()}</div>
      <div className="gc-designer-threaded-comment-reply-body">
        <div className="gc-designer-threaded-comment-reply-header">
          <span className="gc-designer-threaded-comment-name">{name}</span>
          <span className="gc-designer-threaded-comment-time">{`${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}</span>
        </div>
        <div className="gc-designer-threaded-comment-text">{text}</div>
      </div>
    </div>
  );
}

const threadPalette = ['#26a69a', '#5c8ae6', '#ffb54d', '#e06c75', '#7cc47f', '#b48ead', '#56b6c2', '#d19a66'];
const threadColorIndex = new Map<string, number>();
function threadUserColor(userId: string): string {
  let index = threadColorIndex.get(userId);
  if (index === undefined) threadColorIndex.set(userId, (index = threadColorIndex.size % threadPalette.length));
  return threadPalette[index] ?? '#26a69a';
}
