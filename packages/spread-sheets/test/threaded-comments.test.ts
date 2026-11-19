import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { Range } from '../src/primitives.js';

const { Workbook, SheetArea, Events } = GC.Spread.Sheets;
const { ContentType } = GC.Spread.Sheets.ThreadedComments;

function sheet() {
  const wb = new Workbook();
  wb.addSheet(0);
  return wb.getSheet(0);
}

describe('threaded comments', () => {
  it('adds threads and replies with auto author and timestamp', () => {
    const s = sheet();
    const tc = s.threadedComments.add(1, 2)!;
    expect(s.threadedComments.size()).toBe(1);
    const reply = tc.add({ message: [{ type: ContentType.text, value: 'hello' }] })!;
    expect(reply.authorId).toBeTruthy();
    expect(reply.createdAt).toBeInstanceOf(Date);
    expect(tc.all()).toHaveLength(1);
    expect(tc.get(0)!.message[0]).toMatchObject({ type: ContentType.text, value: 'hello' });
    expect(s.threadedComments.get(1, 2)).toBe(tc);
    expect(tc.row()).toBe(1);
    expect(tc.col()).toBe(2);
  });

  it('add accepts initial replies and returns the same thread for an occupied cell', () => {
    const s = sheet();
    const created = new Date('2026-01-01T00:00:00Z');
    const tc = s.threadedComments.add(3, 4, [{ message: [{ type: ContentType.text, value: 'first' }], createdAt: created, authorId: 'u1' }])!;
    expect(tc.all()).toHaveLength(1);
    const again = s.threadedComments.add(3, 4);
    expect(again).toBe(tc);
    expect(s.threadedComments.size()).toBe(1);
  });

  it('updates and removes replies and resolves threads', () => {
    const s = sheet();
    const tc = s.threadedComments.add(0, 0)!;
    tc.add({ message: [{ type: ContentType.text, value: 'one' }] })!;
    tc.add({ message: [{ type: ContentType.text, value: 'two' }] })!;
    tc.set(0, { message: [{ type: ContentType.text, value: 'edited' }] });
    expect((tc.get(0)!.message[0] as { value?: string }).value).toBe('edited');
    expect(tc.get(0)!.authorId).toBeTruthy();
    tc.remove(0);
    expect(tc.all()).toHaveLength(1);
    expect(tc.resolved()).toBe(false);
    tc.resolved(true);
    expect(tc.resolved()).toBe(true);
  });

  it('fires ThreadedComment events with cancel support', () => {
    const s = sheet();
    const changing: unknown[] = [];
    const changed: unknown[] = [];
    s.bind(Events.ThreadedCommentChanging, (_e: unknown, info: unknown) => changing.push(info));
    s.bind(Events.ThreadedCommentChanged, (_e: unknown, info: unknown) => changed.push(info));
    const tc = s.threadedComments.add(2, 2)!;
    tc.add({ message: [{ type: ContentType.text, value: 'hi' }] })!;
    expect(changing.at(-1)).toMatchObject({ propertyName: 'reply', replyIndex: 0, row: 2, col: 2 });
    expect(changed.at(-1)).toMatchObject({ propertyName: 'reply', replyIndex: 0 });
    tc.resolved(true);
    expect(changed.at(-1)).toMatchObject({ propertyName: 'resolved', newValue: true, oldValue: false });
    const before = changed.length;
    s.bind(Events.ThreadedCommentChanging, ((_e: unknown, info: { cancel: boolean }) => { info.cancel = true; }) as never);
    tc.resolved(false);
    expect(changed).toHaveLength(before);
    expect(tc.resolved()).toBe(true);
  });

  it('emits mention events when a reply mentions a user', () => {
    const s = sheet();
    const mentioned: unknown[] = [];
    s.bind(Events.UserMentioned, (_e: unknown, info: unknown) => mentioned.push(info));
    const tc = s.threadedComments.add(1, 1)!;
    tc.add({ message: [{ type: ContentType.mention, userId: 'u9' }] })!;
    expect(mentioned.at(-1)).toMatchObject({ row: 1, col: 1, userId: 'u9' });
  });

  it('serializes into the official nested shape and round-trips', () => {
    const s = sheet();
    const tc = s.threadedComments.add(1, 2)!;
    tc.add({ message: [{ type: ContentType.text, value: 'thread two' }], createdAt: new Date('2026-05-05T04:04:04.004Z'), authorId: 'author-1' })!;
    tc.resolved(true);
    const json = s.toJSON() as { threadedComments: Record<string, Record<string, { replies: { createdAt: string; authorId: string; message: unknown }[]; resolved: boolean }>> };
    expect(json.threadedComments['1']['2']).toEqual({
      replies: [{ createdAt: '2026-05-05T04:04:04.004Z', authorId: 'author-1', message: [{ type: 0, value: 'thread two' }] }],
      resolved: true,
    });
    const wb2 = new Workbook();
    wb2.addSheet(0);
    wb2.getSheet(0).fromJSON(JSON.parse(JSON.stringify(json)));
    const s2 = wb2.getSheet(0);
    const t2 = s2.threadedComments.get(1, 2);
    expect(t2?.all()[0].message[0]).toMatchObject({ type: 0, value: 'thread two' });
    expect(t2?.resolved()).toBe(true);
    expect(t2?.all()[0].createdAt).toBeInstanceOf(Date);
  });

  it('clears, shifts and removes with rows and range clears', () => {
    const s = sheet();
    s.threadedComments.add(2, 1)!;
    s.threadedComments.add(5, 3)!;
    s.addRows(0, 2);
    expect(s.threadedComments.get(4, 1)).toBeTruthy();
    expect(s.threadedComments.get(7, 3)).toBeTruthy();
    s.deleteRows(5, 1);
    expect(s.threadedComments.get(6, 3)).toBeTruthy();
    expect(s.threadedComments.get(4, 1)).toBeTruthy();
    s.deleteRows(4, 1);
    expect(s.threadedComments.get(4, 1)).toBeUndefined();
    s.clear(6, 3, 1, 1, SheetArea.viewport, GC.Spread.Sheets.StorageType.comment);
    expect(s.threadedComments.get(6, 3)).toBeUndefined();
  });

  it('manager clear with range only clears matching threads', () => {
    const s = sheet();
    s.threadedComments.add(0, 0)!;
    s.threadedComments.add(9, 9)!;
    s.threadedComments.clear(new Range(0, 0, 1, 1));
    expect(s.threadedComments.get(0, 0)).toBeUndefined();
    expect(s.threadedComments.get(9, 9)).toBeTruthy();
    s.threadedComments.clear();
    expect(s.threadedComments.all()).toHaveLength(0);
  });

  it('copies threads with copyTo', () => {
    const s = sheet();
    const tc = s.threadedComments.add(1, 1)!;
    tc.add({ message: [{ type: ContentType.text, value: 'copy me' }] })!;
    s.copyTo(1, 1, 3, 3, 1, 1, GC.Spread.Sheets.CopyToOptions.all);
    const copy = s.threadedComments.get(3, 3);
    expect(copy?.get(0)?.message[0]).toMatchObject({ type: ContentType.text, value: 'copy me' });
  });
});

describe('classic comment serialization', () => {
  it('keeps the array record and adds the c style record only for styled comments', () => {
    const s = sheet();
    s.comments.add(1, 1, 'classic one');
    let json = s.toJSON() as { comments?: { rowIndex: number; text: string }[]; c?: Record<string, Record<string, Record<string, unknown>>> };
    expect(json.comments?.[0]).toMatchObject({ rowIndex: 1, colIndex: 1, text: 'classic one', commentState: 3 });
    expect(json.c).toBeUndefined();
    // UI materialization alone stays legacy-only, like the official build.
    (s.comments.get(1, 1) as { _materialize(): void })._materialize();
    json = s.toJSON() as typeof json;
    expect(json.c).toBeUndefined();
    (s.comments.get(1, 1) as unknown as { width(v?: unknown): unknown }).width(200);
    json = s.toJSON() as typeof json;
    expect(json.c?.['1']?.['1']).toEqual({
      text: 'classic one', visible: true, isCostumized: false, locked: true, aligner: 0, hAlign: 0, vAlign: 0, width: 200,
    });
  });

  it('loads and round-trips official c style records', () => {
    const s = sheet();
    s.fromJSON({
      name: 'Sheet1',
      c: { '2': { '3': { text: 'styled', visible: true, isCostumized: false, locked: true, aligner: 0, hAlign: 0, vAlign: 0, width: 200, height: 120, fontColor: '#ff0000', fontSize: 20 } } },
    } as never);
    const comment = s.comments.get(2, 3)!;
    expect(comment.text()).toBe('styled');
    expect(comment.width()).toBe(200);
    expect((comment.foreColor() as string) ?? '').toBe('#ff0000');
    const json = s.toJSON() as { c: Record<string, Record<string, Record<string, unknown>>> };
    expect(json.c['2']['3']).toMatchObject({ text: 'styled', width: 200, height: 120, fontColor: '#ff0000', fontSize: 20 });
  });
});

describe('user manager', () => {
  it('provides a default guest identity', async () => {
    const { UserManager } = GC.Spread.Common;
    const id = UserManager.current();
    expect(typeof id).toBe('string');
    const user = await UserManager.get(id!);
    expect(user).toMatchObject({ id, name: 'Guest' });
  });
});
