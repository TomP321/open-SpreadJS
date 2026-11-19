/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { Workbook } = GC.Spread.Sheets;
const { DataChartType, Aggregate } = GC.Spread.Sheets.DataCharts;

function sheetWithTable() {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    const table = wb.dataManager().addTable('Sales', {
        data: [
            { Region: 'East', Product: 'Juice', Category: 'Drinks', Sales: 140, Qty: 9 },
            { Region: 'East', Product: 'Milk', Category: 'Drinks', Sales: 431, Qty: 38 },
            { Region: 'North', Product: 'Juice', Category: 'Drinks', Sales: 250, Qty: 23 },
            { Region: 'North', Product: 'Milk', Category: 'Drinks', Sales: 666, Qty: 39 },
        ],
    });
    return { wb, sheet, table };
}

describe('sheet.dataCharts collection', () => {
    it('adds, lists, gets and removes data charts through the public surface', () => {
        const { sheet } = sheetWithTable();
        const dc = sheet.dataCharts.add('DC1', 120, 40, 460, 300, DataChartType.column);
        expect(sheet.dataCharts.all()).toHaveLength(1);
        expect(sheet.dataCharts.get('DC1')).toBe(dc);
        expect(dc.name()).toBe('DC1');
        expect([dc.x(), dc.y(), dc.width(), dc.height()]).toEqual([120, 40, 460, 300]);
        expect(sheet.dataCharts.get('nope')).toBeUndefined();
        sheet.dataCharts.remove('nope'); // missing name: no-op (trial)
        expect(sheet.dataCharts.all()).toHaveLength(1);
        sheet.dataCharts.remove('DC1');
        expect(sheet.dataCharts.all()).toHaveLength(0);
    });

    it('auto-renames duplicate names and falls back for empty names (trial)', () => {
        const { sheet } = sheetWithTable();
        const first = sheet.dataCharts.add('DC', 0, 0, 100, 100, DataChartType.column);
        const dup = sheet.dataCharts.add('DC', 10, 10, 100, 100, DataChartType.pie);
        const empty = sheet.dataCharts.add('', 20, 20, 100, 100, DataChartType.pie);
        expect(first.name()).toBe('DC');
        expect(dup.name()).toBe('DC_1');
        expect(empty.name()).toBe('Chart 1');
    });

    it('defaults missing size to 200x160 and type to Column', () => {
        const { sheet } = sheetWithTable();
        const dc = sheet.dataCharts.add('Default', 5, 5, undefined as never, undefined as never, undefined as never);
        expect([dc.width(), dc.height()]).toEqual([200, 160]);
        expect(dc.getChartConfig().plots[0].type).toBe('Column');
    });

    it('zIndex returns the paint index, -1 for unknown names and re-orders on set', () => {
        const { sheet } = sheetWithTable();
        sheet.dataCharts.add('A', 0, 0, 100, 100, DataChartType.column);
        sheet.dataCharts.add('B', 0, 0, 100, 100, DataChartType.column);
        expect(sheet.dataCharts.zIndex('A')).toBe(0);
        expect(sheet.dataCharts.zIndex('missing')).toBe(-1);
        sheet.dataCharts.zIndex('A', 1);
        expect(sheet.dataCharts.all().map(item => item.name())).toEqual(['B', 'A']);
    });

    it('clear empties the collection', () => {
        const { sheet } = sheetWithTable();
        sheet.dataCharts.add('A', 0, 0, 100, 100, DataChartType.column);
        sheet.dataCharts.add('B', 0, 0, 100, 100, DataChartType.column);
        sheet.dataCharts.clear();
        expect(sheet.dataCharts.all()).toHaveLength(0);
    });
});

describe('DataChart members', () => {
    it('mirrors the trial flag defaults', () => {
        const { sheet } = sheetWithTable();
        const dc = sheet.dataCharts.add('DC', 10, 20, 300, 200, DataChartType.column);
        expect(dc.allowMove()).toBe(true);
        expect(dc.allowResize()).toBe(true);
        expect(dc.alt()).toBe('');
        expect(dc.canPrint()).toBe(true);
        expect(dc.dynamicMove()).toBe(true);
        expect(dc.dynamicSize()).toBe(true);
        expect(dc.isLocked()).toBe(true);
        expect(dc.isSelected()).toBe(false);
        expect(dc.isVisible()).toBe(true);
        dc.alt('cover');
        expect(dc.alt()).toBe('cover');
    });

    it('anchor accessors are derived from the geometry', () => {
        const { sheet } = sheetWithTable();
        const dc = sheet.dataCharts.add('DC', 120, 40, 460, 300, DataChartType.column);
        expect(dc.startRow()).toBe(2);
        expect(dc.startColumn()).toBe(1);
        expect(dc.startColumnOffset()).toBe(120 - 62);
        expect(dc.endRow()).toBe(Math.floor(340 / 20));
        expect(dc.startRow(4));
        expect(dc.y()).toBe(80);
    });

    it('emits FloatingObjectSelectionChanged on selection', () => {
        const { sheet } = sheetWithTable();
        const dc = sheet.dataCharts.add('DC', 10, 10, 300, 200, DataChartType.column);
        const events: unknown[] = [];
        sheet.bind(GC.Spread.Sheets.Events.FloatingObjectSelectionChanged, (_s: unknown, e: unknown) => events.push(e));
        dc.isSelected(true);
        expect(events).toHaveLength(1);
    });

    it('follows row/column insertions and deletions (trial anchoring)', () => {
        const { sheet } = sheetWithTable();
        const dc = sheet.dataCharts.add('DC', 120, 40, 460, 300, DataChartType.column);
        sheet.addRows(0, 2);
        expect([dc.x(), dc.y()]).toEqual([120, 80]);
        expect([dc.startRow(), dc.endRow()]).toEqual([4, 19]);
        sheet.deleteRows(0, 2);
        expect(dc.y()).toBe(40);
        sheet.addColumns(0, 1);
        expect(dc.x()).toBe(120 + 62);
        sheet.deleteColumns(0, 1);
        expect(dc.x()).toBe(120);
    });
});

describe('DataChart config', () => {
    it('getChartConfig returns the trial default config after add', () => {
        const { sheet } = sheetWithTable();
        const dc = sheet.dataCharts.add('DC', 10, 10, 300, 200, DataChartType.column);
        const config = dc.getChartConfig() as any;
        expect(config.tableName).toBeUndefined();
        expect(config.plots).toHaveLength(1);
        expect(config.plots[0].type).toBe('Column');
        expect(config.plots[0].encodings).toEqual({});
        expect(config.plots[0].config.palette[0]).toBe('#91cd77');
        expect(config.plots[0].config.updateAnimation).toEqual({ duration: 600 });
        expect(config.config.header.title).toBe('Data Chart Title');
        expect(config.config.dvStyle.fill).toEqual({ type: 'CssColor', color: '#ffffff' });
    });

    it('setChartConfig replaces the config and getChartConfig round-trips it', () => {
        const { sheet } = sheetWithTable();
        const dc = sheet.dataCharts.add('DC', 10, 10, 300, 200, DataChartType.column);
        dc.setChartConfig({
            tableName: 'Sales',
            plots: [{ type: DataChartType.column, encodings: { values: [{ field: 'Sales', aggregate: Aggregate.sum }], category: { field: 'Product' } } }],
        } as never);
        expect(dc.getChartConfig()).toEqual({
            tableName: 'Sales',
            plots: [{ type: 'Column', encodings: { values: [{ field: 'Sales', aggregate: 1 }], category: { field: 'Product' } } }],
            config: {},
        });
    });

    it('setChartConfig infers the VALUE_NAMES colour encoding on request', () => {
        const { sheet } = sheetWithTable();
        const dc = sheet.dataCharts.add('DC', 10, 10, 300, 200, DataChartType.column);
        const config = {
            tableName: 'Sales',
            plots: [{ type: DataChartType.column, encodings: { values: [{ field: 'Sales' }], category: { field: 'Product' } } }],
        } as never;
        dc.setChartConfig(config, false);
        expect((dc.getChartConfig() as any).plots[0].encodings.color).toBeUndefined();
        dc.setChartConfig(config, true);
        expect((dc.getChartConfig() as any).plots[0].encodings.color).toEqual({ field: 'VALUE_NAMES' });
    });

    it('accepts enum keys and enum values for plot types', () => {
        const { sheet } = sheetWithTable();
        const dc = sheet.dataCharts.add('DC', 10, 10, 300, 200, 'pie' as never);
        expect(dc.getChartConfig().plots[0].type).toBe('Pie');
        dc.setChartConfig({ plots: [{ type: 'bar' as never }] } as never);
        expect(dc.getChartConfig().plots[0].type).toBe('Bar');
    });
});

describe('DataChart data binding', () => {
    it('refreshes the paint model when the bound table changes', async () => {
        const { buildChartModel, modelFingerprint } = await import('../src/datacharts/paint.js');
        const { sheet, table } = sheetWithTable();
        const dc = sheet.dataCharts.add('DC', 10, 10, 300, 200, DataChartType.column);
        dc.setChartConfig({
            tableName: 'Sales',
            plots: [{ type: DataChartType.column, encodings: { values: [{ field: 'Sales', aggregate: Aggregate.sum }], category: { field: 'Product' } } }],
        } as never);
        const readRows = () => Array.from({ length: table.length() }, (_, i) => table.get(i) as never);
        await table.fetch();
        const fp1 = modelFingerprint(dc as never);
        const model1 = buildChartModel(dc as never, readRows());
        expect(model1.plots[0].series[0].points.map(p => p.value)).toEqual([390, 1097]);
        table.insertItem(4, { Region: 'East', Product: 'Juice', Category: 'Drinks', Sales: 100, Qty: 1 });
        expect(modelFingerprint(dc as never)).not.toBe(fp1);
        const model2 = buildChartModel(dc as never, readRows());
        expect(model2.plots[0].series[0].points.map(p => p.value)).toEqual([490, 1097]);
    });

    it('unbound charts use the trial blank-sample model', async () => {
        const { blankModel } = await import('../src/datacharts/paint.js');
        const model = blankModel();
        expect(model.plots[0].categories).toEqual(['C1', 'C2', 'C3', 'C4']);
        expect(model.plots[0].series.map(s => s.name)).toEqual(['a', 'b', 'c']);
    });
});

describe('DataChart serialisation', () => {
    it('serialises into the shapes section with shapeType 9 and the trial keys', () => {
        const { sheet } = sheetWithTable();
        const dc = sheet.dataCharts.add('DC1', 120, 40, 460, 300, DataChartType.column);
        dc.setChartConfig({
            tableName: 'Sales',
            config: { header: { title: 'T' } },
            plots: [{ type: DataChartType.column, encodings: { values: [{ field: 'Sales', aggregate: Aggregate.sum }], category: { field: 'Product' } } }],
        } as never);
        const json = sheet.toJSON() as Record<string, any>;
        const shapes = json.shapes as Record<string, any>[];
        expect(shapes).toHaveLength(1);
        const shape = shapes[0];
        expect(shape.shapeType).toBe(9);
        expect(shape.name).toBe('DC1');
        expect(Object.keys(shape).sort().join(',')).toBe(
            'allowMove,allowResize,allowRotate,alt,canPrint,dynamicMove,dynamicSize,isLocked,name,shapeData,shapeType,showHandle',
        );
        expect(shape.shapeData.graphicFrame.shapeType).toBe(9);
        expect(shape.shapeData.graphicFrame.nvGraphicFramePr.cNvPr.name).toBe('DC1');
        expect(shape.shapeData.graphicFrame.xfrm.off).toEqual({ x: 120, y: 40 });
        expect(shape.shapeData.graphicFrame.xfrm.ext).toEqual({ cx: 460, cy: 300 });
        expect(shape.shapeData.graphicFrame.graphic.graphicData.dataChart.chartConfig.tableName).toBe('Sales');
    });

    it('round-trips through sheet.fromJSON', async () => {
        const { wb, sheet } = sheetWithTable();
        sheet.dataCharts.add('DC1', 120, 40, 460, 300, DataChartType.column);
        sheet.dataCharts.add('DC2', 20, 20, 200, 200, DataChartType.pie);
        const json = JSON.parse(JSON.stringify(wb.toJSON()));
        const wb2 = new Workbook();
        wb2.fromJSON(json);
        const sheet2 = wb2.getActiveSheet();
        expect(sheet2.dataCharts.all().map(item => item.name())).toEqual(['DC1', 'DC2']);
        expect(sheet2.dataCharts.get('DC1')!.getChartConfig()).toEqual(sheet.dataCharts.get('DC1')!.getChartConfig());
        expect(sheet2.dataCharts.get('DC1')!.x()).toBe(120);
        // The shapes section must not be duplicated back into extraJSON.
        const json2 = wb2.toJSON() as Record<string, any>;
        expect(json2.sheets ? (json2.sheets.Sheet1 ?? json2.sheets[0]).shapes : json2.shapes).toBeDefined();
    });

    it('shapeType-9 entries are not routed to shapes or charts', async () => {
        const { wb, sheet } = sheetWithTable();
        sheet.dataCharts.add('DC1', 120, 40, 460, 300, DataChartType.column);
        const json = JSON.parse(JSON.stringify(wb.toJSON()));
        const wb2 = new Workbook();
        wb2.fromJSON(json);
        const sheet2 = wb2.getActiveSheet();
        expect(sheet2.shapes.all()).toHaveLength(0);
        expect(sheet2.charts.all()).toHaveLength(0);
        expect(sheet2.dataCharts.all()).toHaveLength(1);
    });
});
