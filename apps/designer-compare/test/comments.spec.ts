/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

async function selectTab(page: Page, label: string): Promise<void> {
  await page.evaluate((label) => {
    const tab = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-tab-nav-text')].find((e) => e.getAttribute('aria-label') === label);
    if (!tab) throw new Error(`tab ${label} not found`);
    tab.click();
  }, label);
  await page.waitForTimeout(300);
}

/** Viewport point at the centre of a cell, computed from the public API + canvas rect. */
async function cellPoint(page: Page, row: number, col: number): Promise<{ x: number; y: number }> {
  return page.evaluate(({ row, col }) => {
    const sheet = (window as any).__designerCompare.spread.getActiveSheet();
    const canvases = [...document.querySelectorAll('canvas')] as HTMLCanvasElement[];
    const canvas = canvases.reduce((best, c) => (c.getBoundingClientRect().width * c.getBoundingClientRect().height > best.getBoundingClientRect().width * best.getBoundingClientRect().height ? c : best), canvases[0]);
    const box = canvas.getBoundingClientRect();
    const rect = sheet.getCellRect(row, col);
    return { x: box.left + rect.x + rect.width / 2, y: box.top + rect.y + rect.height / 2 };
  }, { row, col });
}

/** Bounding box of the open thread card on either implementation. */
async function cardRect(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate(() => {
    const node = document.querySelector('.os-thread-card') ?? document.querySelector('sjs-threaded-comment');
    if (!node) throw new Error('no thread card');
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

/** Sheet JSON, normalising volatile createdAt/authorId values. */
async function sheetJson(page: Page): Promise<string> {
  return page.evaluate(() => {
    const json = (window as any).__designerCompare.spread.getActiveSheet().toJSON();
    return JSON.stringify(json, (key, value) => (key === 'createdAt' || key === 'authorId') ? 'X' : value);
  });
}

test('threaded comments: UI posting, resolve and JSON match the trial', async ({ browser }) => {
  const official = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  const ours = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  try {
    await boot(official, 'official');
    await boot(ours, 'ours');
    for (const page of [official, ours]) {
      await page.evaluate(() => {
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        const type = (window as any).GC.Spread.Sheets.ThreadedComments.ContentType.text;
        sheet.threadedComments.add(1, 1, [{ authorId: 'u1', message: [{ type, value: 'First' }] }]);
        sheet.setActiveCell(1, 1);
      });
      await selectTab(page, 'Review');
      await page.locator('[role="button"][aria-label="New Threaded Comment"]').click();
      await page.waitForTimeout(400);
    }
    const [oCard, uCard] = await Promise.all([cardRect(official), cardRect(ours)]);
    expect(Math.round(uCard.width)).toBe(Math.round(oCard.width));
    expect(uCard.height).toBeGreaterThan(oCard.height * 0.7);
    for (const page of [official, ours]) {
      const editor = await page.evaluate(() => {
        const host = document.querySelector('.os-thread-card') ?? document.querySelector('sjs-threaded-comment');
        let node: Element | null = null;
        const walk = (root: Document | ShadowRoot): void => {
          for (const element of root.querySelectorAll('*')) {
            if (element.tagName === 'SJS-THREADED-COMMENT') continue;
            if (element.getAttribute?.('contenteditable') === 'true' && element.getBoundingClientRect().width > 0) { node = element; return; }
            const shadow = (element as HTMLElement).shadowRoot;
            if (shadow) walk(shadow);
            if (node) return;
          }
        };
        if (host) walk((host as HTMLElement).shadowRoot ?? host);
        if (!node) walk(document);
        if (!node) throw new Error('no comment editor');
        const r = (node as Element).getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.click(editor.x, editor.y);
      await page.waitForTimeout(400);
      await page.keyboard.type(' second reply', { delay: 30 });
      await page.waitForTimeout(150);
      const post = await page.evaluate(() => {
        const host = document.querySelector('.os-thread-card') ?? document.querySelector('sjs-threaded-comment');
        let node: Element | null = null;
        const walk = (root: Document | ShadowRoot): void => {
          for (const element of root.querySelectorAll('*')) {
            const cls = typeof element.className === 'string' ? element.className : '';
            if (element.tagName === 'BUTTON' && /post-button|os-thread-post/.test(cls)) { node = element; return; }
            const shadow = (element as HTMLElement).shadowRoot;
            if (shadow) walk(shadow);
            if (node) return;
          }
        };
        if (!host) throw new Error('no card for post button');
        walk(host.shadowRoot ?? host);
        if (!node) throw new Error('no post button');
        const r = (node as Element).getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.click(post.x, post.y);
      await page.waitForTimeout(400);
    }
    for (const page of [official, ours]) {
      const count = await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().threadedComments.get(1, 1).all().length);
      expect(count).toBe(2);
    }
    const [oJson, uJson] = await Promise.all([sheetJson(official), sheetJson(ours)]);
    const parse = (json: string): any => {
      const record = JSON.parse(json);
      expect(record.threadedComments, 'threadedComments record present').toBeTruthy();
      expect(record.threadedComments['1']['1'].replies.length).toBe(2);
      const text = (record.threadedComments['1']['1'].replies[1].message as { value?: string }[]).map((block) => block.value ?? '').join('');
      expect(text).toContain('second reply');
      return record;
    };
    parse(oJson);
    parse(uJson);
    for (const page of [official, ours]) {
      await page.evaluate(() => {
        const tc = (window as any).__designerCompare.spread.getActiveSheet().threadedComments.get(1, 1);
        tc.resolved(true);
      });
      const resolved = await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().threadedComments.get(1, 1).resolved());
      expect(resolved).toBe(true);
    }
    const [oRes, uRes] = await Promise.all([sheetJson(official), sheetJson(ours)]);
    expect(JSON.parse(oRes).threadedComments['1']['1'].resolved).toBe(true);
    expect(JSON.parse(uRes).threadedComments['1']['1'].resolved).toBe(true);
    for (const page of [official, ours]) {
      await page.locator('[role="button"][aria-label="Delete Threaded Comment"]').click();
      await page.waitForTimeout(300);
      const size = await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().threadedComments.size());
      expect(size).toBe(0);
    }
  } finally {
    await official.close();
    await ours.close();
  }
});

test('review ribbon threaded-comment group matches the trial', async ({ browser }) => {
  const official = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  const ours = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  try {
    await boot(official, 'official');
    await boot(ours, 'ours');
    const layout = async (page: Page): Promise<any> => {
      await selectTab(page, 'Review');
      return page.evaluate(() => {
        const buttons = [...document.querySelectorAll<HTMLElement>('[role="button"][aria-label]')]
          .filter((e) => /Threaded Comment/i.test(e.getAttribute('aria-label') ?? ''))
          .map((e) => ({ text: (e.textContent ?? '').trim(), aria: e.getAttribute('aria-label') }));
        const group = [...document.querySelectorAll<HTMLElement>('*')]
          .find((e) => e.children.length === 0 && (e.textContent ?? '').trim() === 'Threaded Comments');
        return { buttons, groupLabel: !!group };
      });
    };
    const [o, u] = await Promise.all([layout(official), layout(ours)]);
    expect(u.buttons).toEqual(o.buttons);
    expect(u.groupLabel).toBe(o.groupLabel);
    for (const page of [official, ours]) {
      const point = await cellPoint(page, 1, 1);
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(200);
      const sizeBefore = await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().threadedComments.size());
      expect(sizeBefore).toBe(0);
      await page.evaluate(() => {
        const button = document.querySelector('[role="button"][aria-label="Delete Threaded Comment"]') as HTMLElement;
        button.click();
      });
      await page.waitForTimeout(200);
      const sizeAfter = await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().threadedComments.size());
      expect(sizeAfter).toBe(0);
    }
  } finally {
    await official.close();
    await ours.close();
  }
});

test('classic comments: context-menu insert, typing and click-away commit match the trial', async ({ browser }) => {
  const official = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  const ours = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  try {
    await boot(official, 'official');
    await boot(ours, 'ours');
    for (const page of [official, ours]) {
      const point = await cellPoint(page, 2, 1);
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(200);
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.waitForTimeout(400);
      const item = await page.evaluate(() => {
        const containers = [...document.querySelectorAll('.gc-ui-contextmenu-container, .gc-designer-context-menu')]
          .filter((e) => (e as HTMLElement).getBoundingClientRect().width > 0);
        const found = containers
          .flatMap((container) => [...container.querySelectorAll('li,div,span')])
          .reverse()
          .find((e) => (e.textContent ?? '').trim() === 'Insert Comment' && (e as HTMLElement).getBoundingClientRect().width > 0) as HTMLElement | undefined;
        if (!found) throw new Error('Insert Comment menu item missing');
        const r = found.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.click(item.x, item.y);
      await page.waitForTimeout(500);
      const editor = await page.evaluate(() => {
        const visible = (element: Element): boolean => (element as HTMLElement).getBoundingClientRect().width > 0;
        const find = (root: Document | ShadowRoot): HTMLTextAreaElement | null => {
          const named = root.querySelector('textarea.gc-comment-editor');
          if (named && visible(named)) return named as HTMLTextAreaElement;
          for (const element of root.querySelectorAll('*')) {
            if (element.tagName === 'TEXTAREA' && visible(element)) return element as HTMLTextAreaElement;
            const shadow = (element as HTMLElement).shadowRoot;
            if (shadow) { const found = find(shadow); if (found) return found; }
          }
          return null;
        };
        const textarea = find(document);
        if (!textarea) return null;
        const r = textarea.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      expect(editor, 'classic comment editor opened').toBeTruthy();
      await page.mouse.click(editor!.x, editor!.y);
      await page.waitForTimeout(300);
      await page.keyboard.type(' hi', { delay: 30 });
      await page.waitForTimeout(150);
      const away = await cellPoint(page, 9, 7);
      await page.mouse.click(away.x, away.y);
      await page.waitForTimeout(400);
    }
    for (const page of [official, ours]) {
      const state = await page.evaluate(() => {
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        const comment = sheet.comments.get(2, 1);
        return { text: comment?.text(), state: comment?.commentState() };
      });
      expect((state.text ?? "").trim()).toBe("hi");
      expect(state.state).toBe(3);
    }
    const [oJson, uJson] = await Promise.all([sheetJson(official), sheetJson(ours)]);
    const classic = (json: string): unknown => {
      const record = JSON.parse(json);
      const entries = (record.comments ?? []) as { text?: string; commentState?: number }[];
      const mine = entries.find((e) => (e.text ?? '').trim() === 'hi');
      expect(mine, 'legacy comment entry with text').toBeTruthy();
      expect(mine?.commentState).toBe(3);
      expect(record.c ?? null, 'no c record for a plain comment').toBeNull();
      return entries;
    };
    classic(oJson);
    classic(uJson);
  } finally {
    await official.close();
    await ours.close();
  }
});

test('threaded comment card: CSS placeholder, empty post blocked and every keypress inserts (matches the trial)', async ({ browser }) => {
  const official = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  const ours = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  try {
    await boot(official, 'official');
    await boot(ours, 'ours');
    for (const page of [official, ours]) {
      await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().setActiveCell(1, 1));
      await selectTab(page, 'Review');
      await page.locator('[role="button"][aria-label="New Threaded Comment"]').click();
      await page.waitForTimeout(400);
    }
    /** Editor + Post state on either implementation (official keeps them in a shadow root). */
    const probe = (page: Page) => page.evaluate(() => {
      const host = document.querySelector('.os-thread-card') ?? document.querySelector('sjs-threaded-comment');
      if (!host || (host as HTMLElement).getBoundingClientRect().width <= 0) throw new Error('no visible thread card');
      let editor: HTMLElement | null = null;
      let post: HTMLButtonElement | null = null;
      const walk = (root: Document | ShadowRoot): void => {
        for (const element of root.querySelectorAll('*')) {
          if (element.tagName === 'SJS-THREADED-COMMENT') continue;
          if (!editor && element.getAttribute('contenteditable') === 'true' && element.getBoundingClientRect().width > 0) editor = element as HTMLElement;
          const cls = typeof element.className === 'string' ? element.className : '';
          if (!post && element.tagName === 'BUTTON' && /post-button|os-thread-post/.test(cls)) post = element as HTMLButtonElement;
          const shadow = (element as HTMLElement).shadowRoot;
          if (shadow) walk(shadow);
          if (editor && post) return;
        }
      };
      walk((host as HTMLElement).shadowRoot ?? host);
      if (!editor || !post) throw new Error('no editor/post in card');
      const er = (editor as HTMLElement).getBoundingClientRect();
      const pr = (post as HTMLButtonElement).getBoundingClientRect();
      return {
        text: (editor as HTMLElement).textContent ?? '',
        children: (editor as HTMLElement).children.length,
        placeholderInCss: getComputedStyle(editor as HTMLElement, '::before').content.includes('@mention'),
        postDisabled: (post as HTMLButtonElement).disabled,
        postOpacity: Number(getComputedStyle(post as HTMLButtonElement).opacity),
        editorPoint: { x: er.x + er.width / 2, y: er.y + er.height / 2 },
        postPoint: { x: pr.x + pr.width / 2, y: pr.y + pr.height / 2 },
      };
    });
    for (const page of [official, ours]) {
      const p = await probe(page);
      expect(p.text, 'placeholder is not part of the editor text').not.toContain('@mention');
      expect(p.text, 'editor starts empty').toBe('');
      expect(p.children, 'no placeholder element inside the editor').toBe(0);
      expect(p.placeholderInCss, 'placeholder renders as a CSS ::before visual').toBe(true);
      expect(p.postDisabled, 'Post is disabled while the input is empty').toBe(true);
      expect(p.postOpacity, 'Post is dimmed while the input is empty').toBeLessThan(1);
      // A real click on the (disabled) Post with an empty input must not post anything.
      await page.mouse.click(p.postPoint.x, p.postPoint.y);
      await page.waitForTimeout(250);
      const after = await page.evaluate(() => {
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        const thread = sheet.threadedComments.get(1, 1);
        const host = document.querySelector('.os-thread-card') ?? document.querySelector('sjs-threaded-comment');
        return { replies: thread ? thread.all().length : 0, open: !!host && (host as HTMLElement).getBoundingClientRect().width > 0 };
      });
      expect(after.replies, 'no reply is posted from an empty input').toBe(0);
      expect(after.open, 'card stays open after an empty-post attempt').toBe(true);
    }
    for (const page of [official, ours]) {
      const p = await probe(page);
      await page.mouse.click(p.editorPoint.x, p.editorPoint.y);
      await page.waitForTimeout(200);
      for (const key of ['h', 'e', 'l', 'l', 'o']) {
        await page.keyboard.press(key);
        await page.waitForTimeout(60);
      }
      const typed = await page.evaluate(() => {
        const host = document.querySelector('.os-thread-card') ?? document.querySelector('sjs-threaded-comment');
        if (!host) throw new Error('card vanished while typing');
        let editor: HTMLElement | null = null;
        let post: HTMLButtonElement | null = null;
        const walk = (root: Document | ShadowRoot): void => {
          for (const element of root.querySelectorAll('*')) {
            if (element.tagName === 'SJS-THREADED-COMMENT') continue;
            if (!editor && element.getAttribute('contenteditable') === 'true' && element.getBoundingClientRect().width > 0) editor = element as HTMLElement;
            const cls = typeof element.className === 'string' ? element.className : '';
            if (!post && element.tagName === 'BUTTON' && /post-button|os-thread-post/.test(cls)) post = element as HTMLButtonElement;
            const shadow = (element as HTMLElement).shadowRoot;
            if (shadow) walk(shadow);
            if (editor && post) return;
          }
        };
        walk((host as HTMLElement).shadowRoot ?? host);
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        return {
          text: (editor as HTMLElement)?.textContent ?? '',
          postDisabled: !post || post.disabled,
          editing: sheet.isEditing(),
          b2: sheet.getValue(1, 1),
        };
      });
      expect(typed.text, 'every keypress inserts; the first character is not swallowed').toBe('hello');
      expect(typed.postDisabled, 'Post becomes enabled as soon as text exists').toBe(false);
      expect(typed.editing, 'typing in the card never starts grid cell editing').toBe(false);
      expect(typed.b2, 'characters typed in the card do not reach the grid').toBe(120);
    }
    for (const page of [official, ours]) {
      const p = await probe(page);
      await page.mouse.click(p.postPoint.x, p.postPoint.y);
      await page.waitForTimeout(400);
    }
    const texts = (page: Page) => page.evaluate(() => {
      const thread = (window as any).__designerCompare.spread.getActiveSheet().threadedComments.get(1, 1);
      return (thread ? thread.all() : []).map((reply: any) => ((reply.message ?? []) as { value?: string }[]).map((block) => block.value ?? '').join(''));
    });
    const [oTexts, uTexts] = await Promise.all([texts(official), texts(ours)]);
    expect(oTexts, 'official posts exactly what was typed').toEqual(['hello']);
    expect(uTexts, 'ours posts exactly what was typed').toEqual(['hello']);
  } finally {
    await official.close();
    await ours.close();
  }
});
