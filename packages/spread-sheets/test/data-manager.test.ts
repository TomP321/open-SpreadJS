import { describe, expect, it, vi } from 'vitest';
import { Data } from '../src/index.js';

describe('Data manager foundation', () => {
  it('evaluates relative and absolute row references', async () => {
    const refs = ['=[@+1n]', '=[@-1n]', '=[#1[n]]', '=[#last[n]]', '=[n]'];
    const view = new Data.DataManager().addTable('t', { data: [{ n: 10 }, { n: 20 }, { n: 30 }] })
      .addView('v', refs.map(value => ({ value })));
    await view.fetch();
    expect([0, 1, 2].map(i => view.getRowData(i))).toEqual([
      { '=[@+1n]': 20, '=[#1[n]]': 10, '=[#last[n]]': 30, '=[n]': 10 },
      { '=[@+1n]': 30, '=[@-1n]': 10, '=[#1[n]]': 10, '=[#last[n]]': 30, '=[n]': 10 },
      { '=[@-1n]': 20, '=[#1[n]]': 10, '=[#last[n]]': 30, '=[n]': 10 },
    ]);
  });
  it('returns the batch submission event when every response item is present', async () => {
    let response: unknown[] = [null, {}, {}];
    const view = new Data.DataManager().addTable('t', { batch: true, remote: {
      read: async () => [{ id: 1, n: 'a' }, { id: 2, n: 'x' }], batch: async () => response,
    } }).addView('v');
    await view.fetch();
    view.updateItem(0, { n: 'b' });
    view.removeItem(1);
    view.insertItem(1, { id: 3, n: 'c' });
    expect(await view.submitChanges()).toBeUndefined();
    expect(view.getChanges()).toHaveLength(3);
    response = [{}, {}, {}];
    expect(await view.submitChanges()).toEqual({
      data: [{ id: 1, n: 'b' }, { id: 2, n: 'x' }, { id: 3, n: 'c' }], cancel: false, eventName: 'ChangesSubmitted',
    });
    expect(Array.from({ length: view.visibleLength() }, (_, i) => view.getRowData(i))).toEqual([
      { id: 1, n: 'b' }, { id: 2, n: 'x' }, { id: 3, n: 'c' },
    ]);
    expect(view.getChanges().map(change => change.type)).toEqual(['update', 'insert']);
  });
  it('merges known fields from auto-sync responses and retains changes on a null response', async () => {
    let response: unknown = { id: 9, n: 'server', extra: 'ignored' };
    const view = new Data.DataManager().addTable('t', { autoSync: true, remote: {
      read: async () => [{ id: 1, n: 'a' }], update: async () => response,
    } }).addView('v');
    await view.fetch();
    view.updateItem(0, { n: 'b' });
    view.saveItem(0);
    await vi.waitFor(() => expect(view.getChanges()).toEqual([]));
    expect(view.getRowData(0)).toEqual({ id: 9, n: 'server' });
    response = null;
    view.updateItem(0, { n: 'retry' });
    view.saveItem(0);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(view.getChanges()).toHaveLength(1);
    expect(view.getRowData(0)).toEqual({ id: 9, n: 'retry' });
  });
  it('restores the submitted row when an auto-sync save resolves after another edit', async () => {
    let finish!: (result: object) => void;
    const pending = new Promise<object>(resolve => { finish = resolve; });
    const view = new Data.DataManager().addTable('t', {
      autoSync: true, remote: { read: async () => [{ id: 1, n: 'a' }], update: () => pending },
    }).addView('v');
    await view.fetch();
    view.updateItem(0, { n: 'b' });
    view.saveItem(0);
    view.updateItem(0, { n: 'c' });
    finish({});
    await vi.waitFor(() => expect(view.getChanges()).toEqual([]));
    expect(view.getRowData(0)).toEqual({ id: 1, n: 'b' });
  });
  it('sends auto-sync saves and deletes to their configured HTTP endpoints', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const view = new Data.DataManager().addTable('t', { autoSync: true, remote: {
        read: async () => [{ id: 1, n: 'a' }, { id: 2, n: 'b' }],
        update: { url: '/update', method: 'PUT', headers: { 'X-Test': 'yes' } },
        create: { url: '/create' }, delete: { url: '/delete' },
      } }).addView('v');
      await view.fetch();
      view.updateItem(0, { n: 'z' });
      view.saveItem(0);
      view.insertItem(1, { id: 3, n: 'c' });
      view.saveItem(1);
      view.removeItem(2);
      await vi.waitFor(() => expect(view.getChanges()).toEqual([]));
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock).toHaveBeenCalledWith('/update', expect.objectContaining({
        method: 'PUT', body: '{"id":1,"n":"z"}',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Test': 'yes' },
      }));
      expect(fetchMock).toHaveBeenCalledWith('/create', expect.objectContaining({ method: 'POST', body: '{"id":3,"n":"c"}' }));
      expect(fetchMock).toHaveBeenCalledWith('/delete', expect.objectContaining({ method: 'DELETE', body: '[{"id":2,"n":"b"}]' }));
    } finally { vi.unstubAllGlobals(); }
  });
  it('keeps non-batch remote edits pending when individual rows are saved', async () => {
    const update = vi.fn(async () => ({}));
    const create = vi.fn(async () => ({}));
    const view = new Data.DataManager().addTable('t', {
      remote: { read: async () => [{ id: 1, n: 'a' }], update, create },
    }).addView('v');
    await view.fetch();
    view.updateItem(0, { n: 'z' });
    view.saveItem(0);
    view.insertItem(1, { id: 2, n: 'b' });
    view.saveItem(1);
    await view.submitChanges();
    expect(view.getChanges()).toEqual([
      { type: 'update', dataItem: { n: 'z' }, oldDataItem: { n: 'a' }, index: 0 },
      { type: 'insert', dataItem: { id: 2, n: 'b' }, index: 1 },
    ]);
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it('sends remote batch changes as full records through a handler and HTTP', async () => {
    const batch = vi.fn(async () => ({}));
    const remote = { read: async () => [{ id: 1, n: 'a' }, { id: 2, n: 'b' }], batch };
    const view = new Data.DataManager().addTable('t', { remote, batch: true }).addView('v');
    await view.fetch();
    view.updateItem(0, { n: 'z' });
    view.removeItem(1);
    view.insertItem(1, { id: 3, n: 'c' });
    view.saveItem(0);
    view.saveItem(1);
    const payload = [
      { type: 'update', dataItem: { id: 1, n: 'z' }, oldDataItem: { id: 1, n: 'a' }, sourceIndex: 0 },
      { type: 'delete', dataItem: { id: 2, n: 'b' }, sourceIndex: 1 },
      { type: 'insert', dataItem: { id: 3, n: 'c' }, sourceIndex: 2 },
    ];
    await view.submitChanges();
    expect(batch).toHaveBeenCalledWith(payload, {
      method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
    expect(view.getChanges().map(change => change.type)).toEqual(['update', 'delete', 'insert']);
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const http = new Data.DataManager().addTable('http', {
        remote: { read: async () => [{ id: 1 }], batch: { url: '/batch', method: 'PUT', headers: { 'X-Test': 'yes' } } },
        batch: true,
      }).addView('v');
      await http.fetch();
      http.updateItem(0, { id: 2 });
      await http.submitChanges();
      expect(fetchMock).toHaveBeenCalledWith('/batch', expect.objectContaining({
        method: 'PUT', headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Test': 'yes' },
        body: JSON.stringify([{ type: 'update', dataItem: { id: 2 }, oldDataItem: { id: 1 }, sourceIndex: 0 }]),
      }));
    } finally { vi.unstubAllGlobals(); }
  });
  it('groups by multiple fields in first-seen order and restores the original order', async () => {
    const view = new Data.DataManager().addTable('t', { data: [
      { id: 1, a: 'b', b: 'x' }, { id: 2, a: 'a', b: 'y' }, { id: 3, a: 'b', b: 'z' },
    ] }).addView('v');
    await view.fetch();
    view.groupBy([{ field: 'a' }, { field: 'b' }]);
    expect(Array.from({ length: view.visibleLength() }, (_, i) => view.getRowData(i))).toEqual([
      { a__0: 'b', b__1: 'x', id: 1, a: 'b', b: 'x' },
      { a__0: 'b', b__1: 'z', id: 3, a: 'b', b: 'z' },
      { a__0: 'a', b__1: 'y', id: 2, a: 'a', b: 'y' },
    ]);
    view.removeGroupBy();
    expect(Array.from({ length: view.visibleLength() }, (_, i) => view.getRowData(i).id)).toEqual([1, 2, 3]);
  });
  it('accepts group summary and collapse metadata while retaining detail rows', async () => {
    const view = new Data.DataManager().addTable('t', { data: [
      { a: 'b', n: 1 }, { a: 'a', n: 2 }, { a: 'b', n: 3 },
    ] }).addView('v');
    await view.fetch();
    view.groupBy([{ field: 'a', collapsed: true, summaryFields: [{ field: 'n', aggregate: 'sum' }] }]);
    expect(Array.from({ length: view.visibleLength() }, (_, index) => view.getRowData(index))).toEqual([
      { a__0: 'b', a: 'b', n: 1 }, { a__0: 'b', a: 'b', n: 3 }, { a__0: 'a', a: 'a', n: 2 },
    ]);
  });
  it('restores remote batch edits, inserts and removals when cancelled', async () => {
    const table = new Data.DataManager().addTable('remote', {
      batch: true, remote: { read: async () => [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] },
    });
    const view = table.addView('v');
    await view.fetch();
    view.updateItem(0, { name: 'Z' });
    view.insertItem(1, { id: 3 });
    view.removeItem(2);
    await view.cancelChanges();
    expect(view.getChanges()).toEqual([]);
    expect([view.getRowData(0), view.getRowData(1)]).toEqual([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
  });

  it('parses documented date patterns with time and milliseconds', async () => {
    const table = new Data.DataManager().addTable('dates', {
      data: [{ date: '2023-05-06 13:14:15.123', other: '06/05/2023 13:14:15' }],
      schema: { columns: {
        date: { dataType: 'date', dataPattern: 'yyyy-MM-dd hh:mm:ss.000' },
        other: { dataType: 'date', dataPattern: 'dd/MM/yyyy HH:mm:ss' },
      } },
    });
    expect(await table.fetch()).toEqual([{
      date: new Date(2023, 4, 6, 13, 14, 15, 123), other: new Date(2023, 4, 6, 13, 14, 15),
    }]);
  });
  it('returns schema snapshots and writes edits through field aliases to local data', async () => {
    const source = [{ x: '2', label: 'A' }] as Record<string, unknown>[];
    const table = new Data.DataManager().addTable('t', { data: source, schema: { columns: {
      id: { dataName: 'x', dataType: 'number' }, name: { dataName: 'label' },
    } } });
    const view = table.addView('v');
    const first = await table.fetch();
    await view.fetch();
    view.updateItem(0, { id: 3, name: 'B' });
    const second = await table.fetch();
    view.insertItem(1, { id: 4, name: 'C' });
    expect(first).toEqual([{ id: 2, name: 'A' }]);
    expect(second).toEqual([{ id: 3, name: 'B' }]);
    expect(source).toEqual([{ x: 3, label: 'B' }, { x: 4, label: 'C' }]);
    view.resetItem(0);
    expect(source[0]).toEqual({ x: 2, label: 'A' });
    view.removeItem(1);
    expect(source).toHaveLength(1);
  });
  it('resets and saves individual local edits and keeps batch operations unchanged', async () => {
    const source = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
    const view = new Data.DataManager().addTable('t', { data: source }).addView('v');
    await view.fetch();
    view.updateItem(0, { name: 'Z' });
    view.insertItem(1, { id: 3, name: 'C' });
    await view.cancelChanges();
    await view.submitChanges();
    expect(view.getChanges()).toHaveLength(2);
    view.resetItem(0);
    expect(view.getRowData(0)).toEqual({ id: 1, name: 'A' });
    view.resetItem(1);
    expect(view.isInserted(1)).toBe(true);
    view.saveItem(1);
    expect(view.getChanges()).toEqual([]);
    view.removeItem(0);
    expect(source).toEqual([{ id: 3, name: 'C' }, { id: 2, name: 'B' }]);
    expect(view.getChanges()).toEqual([]);
  });
  it('evaluates calculated schema columns again after their inputs change', async () => {
    const table = new Data.DataManager().addTable('calculated', {
      data: [{ price: 4, quantity: 3 }],
      schema: { columns: { total: { dataType: 'formula', value: '=[@price]*[@quantity]' } } },
    });
    const view = table.addView('view');
    const fetched = await view.fetch();
    expect(fetched).toEqual([[{ price: 4, quantity: 3 }]]);
    expect(view.getRowData(0)).toEqual({ price: 4, quantity: 3, total: 12 });
    view.updateItem(0, { quantity: 5 });
    expect(fetched).toEqual([[{ price: 4, quantity: 3 }]]);
    expect(view.getRowData(0)).toEqual({ price: 4, quantity: 5, total: 20 });
  });
  it('evaluates calculated view and schema columns using related fields', async () => {
    const manager = new Data.DataManager();
    const suppliers = manager.addTable('suppliers', { data: [{ id: 1, price: 5 }] });
    const products = manager.addTable('products', {
      data: [{ id: 1, supplierId: 1, price: 2 }],
      schema: { columns: { total: { dataType: 'formula', value: '=[@supplier.price]+[@price]' } } },
    });
    manager.addRelationship(products, 'supplierId', 'supplier', suppliers, 'id', 'products');
    const view = products.addView('v', ['id', 'total', { value: '=[@price]*2', caption: 'double' }]);
    expect(await view.fetch()).toHaveLength(2);
    expect(view.getRowData(0)).toEqual({ id: 1, total: 7, '=[@price]*2': 4 });
    view.updateItem(0, { price: 3 });
    expect(view.getRowData(0)).toEqual({ id: 1, total: 8, '=[@price]*2': 6 });
  });
  it('registers tables and relationships and removes them by name', () => {
    const manager = new Data.DataManager();
    const a = manager.addTable('a', { data: [] });
    const b = manager.addTable('b', { data: [] });
    const relationship = manager.addRelationship(a, 'id', 'items', b, 'id', 'parent');
    expect(manager.tables.a).toBe(a);
    expect(manager.relationships).toEqual([relationship]);
    manager.removeRelationship('items');
    manager.removeTable('a');
    expect(manager.relationships).toEqual([]);
    expect(manager.tables.a).toBeUndefined();
  });
  it('fetches local data, exposes views and searches and manages indexes', async () => {
    const table = new Data.DataManager().addTable('people', { data: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] });
    expect(await table.fetch()).toEqual([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
    const view = table.addView('people', ['id', 'name']);
    expect(await view.fetch()).toEqual([[{ id: 1, name: 'A' }, { id: 2, name: 'B' }]]);
    expect(view.getColumn()).toEqual([{ name: 'id', value: 'id', width: 60 }, { name: 'name', value: 'name', width: 60 }]);
    expect(view.length()).toBe(2);
    expect(view.visibleLength()).toBe(2);
    view.addColumn('extra');
    view.removeColumn('extra');
    expect((view.getColumn() as unknown[])).toHaveLength(2);
    expect(table.search('B', 'name')).toEqual([{ id: 2, name: 'B' }]);
    table.createIndexes(['id', 'name']);
    table.dropIndexes(['id']);
    expect(table.getIndexes()).toEqual(['name']);
    table.clearIndexes();
    expect(table.getIndexes()).toEqual([]);
    table.removeView('people');
    expect(table.views.people).toBeUndefined();
  });
  it('loads function-based remote data and explicitly rejects unsupported sources', async () => {
    const calls: object[] = [];
    const read = async (options: object) => { calls.push(options); return [{ id: 1 }]; };
    const table = new Data.DataManager().addTable('remote', { remote: { read } });
    expect(await table.fetch()).toEqual([{ id: 1 }]);
    expect(await table.refreshRemoteData()).toEqual([{ id: 1 }]);
    expect(calls).toEqual([
      { method: 'GET', reload: undefined, requestType: undefined, requestData: undefined },
      { method: 'GET', fromRefreshRemoteData: true, reload: true, requestType: undefined, requestData: undefined },
    ]);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ id: 2 }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const http = new Data.DataManager().addTable('http', { remote: { read: { url: '/data' } } });
      expect(await http.fetch()).toEqual([{ id: 2 }]);
      expect(fetchMock).toHaveBeenCalledWith('/data', { url: '/data', method: 'GET' });
      const read = { url: '/query', method: 'POST', options: { headers: { 'X-Test': 'yes' } }, body: { q: 1 } };
      await new Data.DataManager().addTable('post', { remote: { read } }).fetch();
      expect(fetchMock).toHaveBeenLastCalledWith('/query', {
        ...read, body: '{"q":1}', headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Test': 'yes' },
      });
      await expect(new Data.DataManager().addTable('invalid', { remote: { read: {} } }).fetch()).rejects.toThrow('NotImplemented');
    } finally { vi.unstubAllGlobals(); }
    await expect(new Data.DataManager().addTable('pattern', { data: [{ date: 'today' }], schema: { columns: { date: { dataType: 'date', dataPattern: 'custom' } } } }).fetch()).rejects.toThrow('NotImplemented');
    expect(await new Data.DataManager().addTable('schema', { data: [], schema: { columns: {} } }).fetch()).toEqual([]);
  });
  it('converts numeric, boolean and date schema patterns', async () => {
    const table = new Data.DataManager().addTable('patterns', {
      data: [{ amount: '20,75', yes: 'Yes', no: 'No', date: '31/12/2021' }],
      schema: { columns: { amount: { dataType: 'number', dataPattern: ',' }, yes: { dataType: 'boolean', dataPattern: 'Yes|No' }, no: { dataType: 'boolean', dataPattern: 'Yes|No' }, date: { dataType: 'date', dataPattern: 'dd/MM/yyyy' } } },
    });
    expect(await table.fetch()).toEqual([{ amount: 20.75, yes: true, no: false, date: new Date(2021, 11, 31) }]);
  });
  it('maps schema fields, converts types and discovers default columns after fetch', async () => {
    const table = new Data.DataManager().addTable('schema', {
      data: { items: [{ id: '2', label: 'A', flag: '' }] },
      schema: { dataPath: 'items', columns: { id: { dataType: 'number' }, name: { dataName: 'label' }, flag: { dataType: 'boolean' } } },
    });
    const view = table.addView('default');
    expect(await view.fetch()).toEqual([[{ id: 2, name: 'A', flag: false }]]);
    expect(view.getColumn()).toEqual([{ name: 'id', value: 'id', width: 60, dataType: 'number' }, { name: 'name', value: 'name', width: 60 }, { name: 'flag', value: 'flag', width: 60, dataType: 'boolean' }]);
    expect(table.addView('custom', ['id'], false, { defaultColumnWidth: 90 }).getColumn(0)).toEqual({ name: 'id', value: 'id', width: 90 });
    view.addStyleRule('dirty', { backColor: 'red' }, { direction: 1, state: 64 });
    expect(view.getStyleRule('dirty')).toEqual({ style: { backColor: 'red' }, rule: { direction: 1, state: 64 } });
    view.removeStyleRule('dirty');
    expect(view.getStyleRule('dirty')).toBeUndefined();
    view.addStyleRule('one');
    view.clearStyleRules();
    expect(view.getStyleRule()).toEqual({});
  });
  it('exposes schema display and identity metadata on default view columns', async () => {
    const view = new Data.DataManager().addTable('t', { data: [{ id: 1, name: 'A' }], schema: { columns: {
      id: { isPrimaryKey: true, caption: 'Identifier' },
      name: { readonly: true, visible: false, defaultValue: 'Default', width: 123 },
    } } }).addView('v');
    await view.fetch();
    expect(view.getColumn()).toEqual([
      { value: 'id', name: 'id', width: 60, isPrimaryKey: true, caption: 'Identifier' },
      { value: 'name', name: 'name', width: 123, readonly: true, visible: false, defaultValue: 'Default' },
    ]);
    const explicit = new Data.DataManager().addTable('t', { data: [{ id: 1 }], schema: { columns: {
      id: { isPrimaryKey: true, caption: 'Identifier', width: 123 },
    } } }).addView('v', ['id']);
    await explicit.fetch();
    expect(explicit.getColumn()).toEqual([{ name: 'id', value: 'id', width: 123, isPrimaryKey: true, caption: 'Identifier' }]);
  });
  it('loads referenced relationship tables and preserves schema fields not explicitly configured', async () => {
    const manager = new Data.DataManager();
    const people = manager.addTable('people', { data: [{ id: '1', teamId: 2, extra: 'kept' }], schema: { columns: { id: { dataType: 'number' } } } });
    const teams = manager.addTable('teams', { data: [{ id: 2, name: 'Blue' }] });
    manager.addRelationship(people, 'teamId', 'team', teams, 'id', 'members');
    const view = people.addView('withTeam', ['id', 'team.name']);
    expect(await view.fetch()).toEqual([[{ id: 1, teamId: 2, extra: 'kept' }], [{ id: 2, name: 'Blue' }]]);
    expect(view.getRowData(0)).toEqual({ id: 1, 'team.name': 'Blue' });
    const reverse = teams.addView('members', ['name', 'members.id']);
    await reverse.fetch();
    expect(reverse.getRowData(0)).toEqual({ name: 'Blue', 'members.id': 1 });
    expect(people.search('1', 'id')).toEqual([{ id: 1, teamId: 2, extra: 'kept' }]);
    expect(view.getColumn()).toHaveLength(2);
  });
  it('fetches multi-hop relationship tables once', async () => {
    const manager = new Data.DataManager();
    const a = manager.addTable('a', { data: [{ id: 1, b: 2 }] });
    const b = manager.addTable('b', { data: [{ id: 2, c: 3 }] });
    const c = manager.addTable('c', { data: [{ id: 3, name: 'C' }] });
    manager.addRelationship(a, 'b', 'br', b, 'id', 'ar');
    manager.addRelationship(b, 'c', 'cr', c, 'id', 'br');
    const view = a.addView('v', ['br.cr.name', 'br.id']);
    expect(await view.fetch()).toEqual([[{ id: 1, b: 2 }], [{ id: 2, c: 3 }], [{ id: 3, name: 'C' }]]);
    expect(view.getRowData(0)).toEqual({ 'br.cr.name': 'C', 'br.id': 2 });
  });
  it('uses default columns only when no explicit columns were supplied', async () => {
    const table = new Data.DataManager().addTable('people', { data: [{ id: 1, name: 'A' }] });
    const defaults = table.addView('defaults', []);
    const explicit = table.addView('explicit', ['id'], true);
    await defaults.fetch();
    await explicit.fetch();
    expect(defaults.getColumn()).toHaveLength(2);
    expect(explicit.getColumn()).toEqual([{ name: 'id', value: 'id', width: 60 }]);
  });

  it('tracks edits and returns sorted view rows', async () => {
    const table = new Data.DataManager().addTable('edit', { data: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] });
    const view = table.addView('edit', ['id', 'name']);
    await view.fetch();
    view.updateItem(0, { name: 'Z' });
    view.insertItem(1, { id: 3, name: 'C' });
    view.updateItem(1, { name: 'D' });
    expect(view.getChanges()).toEqual([
      { type: 'update', dataItem: { name: 'Z' }, oldDataItem: { name: 'A' }, index: 0 },
      { type: 'insert', dataItem: { id: 3, name: 'D' }, index: 1 },
    ]);
    expect(view.isUpdated(0)).toBe(true);
    expect(view.isInserted(1)).toBe(true);
    view.sort([{ field: 'name', ascending: false }]);
    expect([0, 1, 2].map(i => view.getRowData(i))).toEqual([{ id: 1, name: 'Z' }, { id: 3, name: 'D' }, { id: 2, name: 'B' }]);
  });

  it('edits and removes the displayed row in a sorted view', async () => {
    const table = new Data.DataManager().addTable('sorted', { data: [{ id: 1, n: 'b' }, { id: 2, n: 'a' }, { id: 3, n: 'c' }] });
    const view = table.addView('sorted', ['id', 'n']);
    await view.fetch();
    view.sort([{ field: 'n', ascending: true }]);
    view.updateItem(0, { n: 'z' });
    expect(view.getChanges()).toEqual([{ type: 'update', dataItem: { n: 'z' }, oldDataItem: { n: 'a' }, index: 2 }]);
    expect(view.isUpdated(2)).toBe(true);
    view.removeItem(0);
    expect([view.getRowData(0), view.getRowData(1)]).toEqual([{ id: 3, n: 'c' }, { id: 2, n: 'z' }]);
    expect(view.getChanges()[0]?.index).toBe(1);
  });

  it('filters visible rows by field values and clears the filter', async () => {
    const table = new Data.DataManager().addTable('filtered', { data: [{ id: 1, group: 'a' }, { id: 2, group: 'b' }, { id: 3, group: 'b' }] });
    const view = table.addView('v');
    await view.fetch();
    expect(view.filter([{ field: 'group', value: 'b' }, { field: 'id', value: 3 }])).toBe(1);
    expect(view.length()).toBe(3);
    expect(view.getRowData(0)).toEqual({ id: 3, group: 'b' });
    expect(view.filter()).toBe(3);
  });

  it('keeps equal sort keys stable while sorting filtered rows by multiple fields', async () => {
    const data = [
      { id: 1, group: 'b', rank: 2, priority: 1 }, { id: 2, group: 'a', rank: 1, priority: 1 },
      { id: 3, group: 'b', rank: 3, priority: 1 }, { id: 4, group: 'b', rank: 3, priority: 2 },
      { id: 5, group: 'b', rank: 3, priority: 2 },
    ];
    const view = new Data.DataManager().addTable('t', { data }).addView('v');
    await view.fetch();
    view.filter([{ field: 'group', value: 'b' }]);
    view.sort([{ field: 'rank', ascending: false }, { field: 'priority', ascending: false }]);
    expect(Array.from({ length: view.visibleLength() }, (_, index) => view.getRowData(index).id)).toEqual([4, 5, 3, 1]);
    expect(view.length()).toBe(5);
  });

});

describe('schema lookup metadata', () => {
  it('parses object and array JSON only when the parsed type matches', async () => {
    const rows = [{ object: '{"x":1}', array: '[1,2]' }, { object: '[1]', array: '{"x":1}' },
      { object: 'invalid', array: '123' }, { object: null, array: '' }];
    const table = new Data.DataManager().addTable('t', { data: rows, schema: { columns: {
      object: { dataType: 'object' }, array: { dataType: 'array' },
    } } });
    expect(await table.fetch()).toEqual([
      { object: { x: 1 }, array: [1, 2] }, { object: '[1]', array: '{"x":1}' },
      { object: 'invalid', array: '123' }, { object: null, array: '' },
    ]);
  });
  it('keeps direct inserts unchanged despite schema defaults and duplicate primary keys', async () => {
    const view = new Data.DataManager().addTable('t', { data: [{ id: 1, n: 2 }], schema: { columns: {
      id: { isPrimaryKey: true }, n: { defaultValue: 7 }, s: { defaultValue: 'new' },
    } } }).addView('v');
    await view.fetch();
    view.insertItem(1, { id: 2 });
    view.insertItem(2, { id: 1, n: null });
    expect([view.getRowData(1), view.getRowData(2)]).toEqual([{ id: 2 }, { id: 1, n: null }]);
  });
  it('exposes a static lookup as a combo box and retains empty-value labels', async () => {
    const view = new Data.DataManager().addTable('t', { data: [{ value: 'a' }], schema: { columns: {
      value: { lookup: ['a', 'b'], showNullAs: 'NULL', showEmptyAs: 'EMPTY' },
    } } }).addView('v');
    await view.fetch();
    expect(view.getColumn(0)).toMatchObject({
      lookup: ['a', 'b'], showNullAs: 'NULL', showEmptyAs: 'EMPTY',
      style: { cellType: { type: 'combobox', items: ['a', 'b'] } },
    });
  });
});

describe('non-batch remote cancellation', () => {
  it('leaves pending edits unchanged when cancelled', async () => {
    const view = new Data.DataManager().addTable('t', {
      remote: { read: async () => [{ id: 1, n: 'a' }, { id: 2, n: 'b' }] },
    }).addView('v');
    await view.fetch();
    view.updateItem(0, { n: 'z' });
    view.insertItem(1, { id: 3 });
    view.removeItem(2);
    await view.cancelChanges();
    expect([view.getRowData(0), view.getRowData(1)]).toEqual([{ id: 1, n: 'z' }, { id: 3 }]);
    expect(view.getChanges()).toEqual([
      { type: 'update', dataItem: { n: 'z' }, oldDataItem: { n: 'a' }, index: 0 },
      { type: 'insert', dataItem: { id: 3 }, index: 1 },
    ]);
  });
});

describe('row template formulas', () => {
  it('uses one-based array indexes in field paths and calculated references', async () => {
    const view = new Data.DataManager().addTable('t', { data: [{ arr: [10, 20], obj: { x: 5 } }] })
      .addView('v', ['=[@obj.x]', '=[@arr.1]', '=[@arr.0]', 'arr.1', 'arr.0']);
    await view.fetch();
    expect(view.getRowData(0)).toEqual({
      '=[@obj.x]': 5, '=[@arr.1]': 10, '=[@arr.0]': undefined, 'arr.1': 10, 'arr.0': undefined,
    });
  });
  it('returns the current record for a row template column', async () => {
    const view = new Data.DataManager().addTable('t', { data: [{ id: 1, name: 'A' }] })
      .addView('v', [{ value: '=[@]' }]);
    await view.fetch();
    expect(view.getRowData(0)).toEqual({ '=[@]': { id: 1, name: 'A' } });
  });
});

describe('data view filter operators', () => {
  it('matches null and absent fields together and rejects unknown operators', async () => {
    const view = new Data.DataManager().addTable('t', { data: [{ n: 1 }, { n: null }, { n: '' }, {}] }).addView('v');
    await view.fetch();
    expect(view.filter({ field: 'n' })).toBe(2);
    expect(view.filter({ field: 'n', value: null, operator: 'neq' })).toBe(0);
    view.filter();
    expect(view.filter({ field: 'n', value: null, operator: 'neq' })).toBe(2);
    expect(view.filter({ field: 'n', value: 1, operator: 'bogus' })).toBe(0);
  });
  it('compares date filter values as the trial does', async () => {
    const view = new Data.DataManager().addTable('dates', { data: [
      { value: new Date('2020-01-01') }, { value: new Date('2020-01-02') }, { value: null },
    ] }).addView('v');
    await view.fetch();
    for (const operator of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']) {
      expect(view.filter({ field: 'value', operator, value: new Date('2020-01-01') })).toBe(operator === 'eq' ? 1 : 0);
    }
  });

  it('compares values using the trial operators and clears filters', async () => {
    const view = new Data.DataManager().addTable('operators', { data: [
      { value: 'Alpha' }, { value: 'beta' }, { value: 'xyz' }, { value: null }, { value: '' },
    ] }).addView('v');
    await view.fetch();
    const results: Record<string, number> = {
      eq: 0, neq: 5, gt: 2, gte: 2, lt: 2, lte: 2,
      contains: 2, doesnotcontain: 3, startswith: 0, endswith: 2,
    };
    for (const [operator, expected] of Object.entries(results)) {
      view.filter();
      expect(view.filter({ field: 'value', operator, value: 'a' }), operator).toBe(expected);
    }
    expect(view.filter()).toBe(5);
  });
});


describe('calculated row selections', () => {
  it('aggregates whole columns, odd and even positions, and ranges for each row', async () => {
    const formulas = ['=[#odd[n]]', '=[#even[n]]', '=SUM([n])', '=SUM([#odd[n]])',
      '=SUM([#even[n]])', '=SUM([#1:@[n]])', '=SUM([@:#last[n]])',
    '=SUM([#1,@-1:@+1,#last[n]])'];
    const view = new Data.DataManager().addTable('t', { data: [{ n: 10 }, { n: 20 }, { n: 30 }] })
      .addView('v', formulas.map(value => ({ value })));
    await view.fetch();
    const values = [0, 1, 2].map(index => Object.values(view.getRowData(index)));
    expect(values).toEqual([
      [20, 10, 60, 20, 40, 10, 60, 70],
      [20, 10, 60, 20, 40, 30, 50, 100],
      [20, 10, 60, 20, 40, 60, 30, 90],
    ]);
    view.updateItem(1, { n: 25 });
    expect(view.getRowData(2)['=SUM([#1:@[n]])']).toBe(65);
  });
});


describe('quoted calculated field paths', () => {
  it('resolves field and nested attribute names containing spaces or dots', async () => {
    const expressions = ['=[@[first name]]', '=[@[obj].[a aa]]', '=[@[obj].[a.b]]'];
    const view = new Data.DataManager().addTable('t', { data: [
      { 'first name': 'A', obj: { 'a aa': 5, 'a.b': 7 } },
    ] }).addView('v', expressions);
    await view.fetch();
    expect(view.getRowData(0)).toEqual({
      '=[@[first name]]': 'A', '=[@[obj].[a aa]]': 5, '=[@[obj].[a.b]]': 7,
    });
  });
  it('loads relationships referenced by bracketed field names', async () => {
    const manager = new Data.DataManager();
    const suppliers = manager.addTable('suppliers', { data: [{ id: 1, 'unit price': 5 }] });
    const products = manager.addTable('products', { data: [{ supplierId: 1 }] });
    manager.addRelationship(products, 'supplierId', 'supplier', suppliers, 'id', 'products');
    const view = products.addView('v', ['=[@[supplier].[unit price]]']);
    expect(await view.fetch()).toEqual([[{ supplierId: 1 }], [{ id: 1, 'unit price': 5 }]]);
    expect(view.getRowData(0)).toEqual({ '=[@[supplier].[unit price]]': 5 });
  });

});


describe('related calculated column aggregates', () => {
  it('loads relationship data used by a whole-column aggregate', async () => {
    const manager = new Data.DataManager();
    const products = manager.addTable('products', { data: [{ supplierId: 1 }, { supplierId: 2 }] });
    const suppliers = manager.addTable('suppliers', { data: [{ id: 1, price: 5 }, { id: 2, price: 9 }] });
    manager.addRelationship(products, 'supplierId', 'supplier', suppliers, 'id', 'products');
    const view = products.addView('v', ['=SUM([supplier.price])']);
    expect(await view.fetch()).toHaveLength(2);
    expect(view.getRowData(0)).toEqual({ '=SUM([supplier.price])': 14 });
    expect(view.getRowData(1)).toEqual({ '=SUM([supplier.price])': 14 });
  });
});
