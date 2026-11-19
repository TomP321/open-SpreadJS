/* @vitest-environment jsdom*/
/* Unit tests for the vector PDF export (`Workbook.savePDF`, task 16): document
 * structure (xref, page tree, MediaBox), Info entries, base-14 text drawing and
 * the colour/path operators of a painted cell. The document is read back with a
 * small format-aware reader; the raster comparison against our own print
 * rendering lives in apps/compare/scripts/pdf-oracle.mjs. */
import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import GC from '../src/index.js';
import type { Worksheet } from '../src/model.js';
import { collectPrintPages } from '../src/print-doc.js';
import { PdfErrorCode, exportWorkbookPdf, warnPdfReport } from '../src/pdf/export.js';
import {
  PdfCanvasContext,
  PdfLinearGradient,
  PdfPattern,
  PdfResourcePool,
  PX_TO_PT,
  createPdfReport,
} from '../src/pdf/pdf-context.js';
import { BASE14_FONTS, parseCssFont, selectFont, textEmWidth, winAnsiByteFor } from '../src/pdf/pdf-fonts.js';
import { PdfDict, PdfName, PdfWriter, deflate } from '../src/pdf/pdf-writer.js';

const { Workbook, Worksheet: WorksheetClass, LineBorder } = GC.Spread.Sheets;
const Print = GC.Spread.Sheets.Print;

type PdfBook = InstanceType<typeof Workbook>;

/* ------------------------------------------------------------ pdf reader */

interface PdfObject {
  number: number;
  dict: string;
  stream: string | null;
}

interface PdfFile {
  text: string;
  objects: Map<number, PdfObject>;
  trailer: string;
}

/** Read the objects of a document written by `PdfWriter` (its exact layout). */
function readPdf(bytes: Uint8Array): PdfFile {
  const text = Buffer.from(bytes).toString('latin1');
  const objects = new Map<number, PdfObject>();
  const header = /(\d+) 0 obj\n/g;
  const marks: { number: number; start: number; body: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = header.exec(text))) marks.push({ number: Number(match[1]), start: match.index, body: match.index + match[0].length });
  const xrefAt = text.lastIndexOf('\nxref\n');
  for (const [index, mark] of marks.entries()) {
    const next = marks[index + 1]?.start ?? xrefAt;
    const chunk = text.slice(mark.body, next);
    const streamAt = chunk.indexOf('\nstream\n');
    const dict = streamAt >= 0 ? chunk.slice(0, streamAt) : chunk.replace(/\nendobj\n$/, '');
    let stream: string | null = null;
    if (streamAt >= 0) {
      const length = Number(/\/Length (\d+)/.exec(dict)?.[1]);
      const from = mark.body + streamAt + '\nstream\n'.length;
      stream = text.slice(from, from + length);
    }
    objects.set(mark.number, { number: mark.number, dict, stream });
  }
  return { text, objects, trailer: text.slice(xrefAt) };
}

function pagesOf(pdf: PdfFile): PdfObject[] {
  return [...pdf.objects.values()]
    .filter((object) => /\/Type \/Page[\s\n>]/.test(object.dict) && !object.dict.includes('/Type /Pages'))
    .sort((a, b) => Number(/\/Contents (\d+) 0 R/.exec(a.dict)?.[1]) - Number(/\/Contents (\d+) 0 R/.exec(b.dict)?.[1]));
}

/** Content stream of page `index` (inflated when compressed). */
function pageContent(pdf: PdfFile, index: number): string {
  const ref = Number(/\/Contents (\d+) 0 R/.exec(pagesOf(pdf)[index]!.dict)?.[1]);
  const object = pdf.objects.get(ref);
  if (!object?.stream) throw new Error(`page ${index} has no content stream`);
  const raw = Buffer.from(object.stream, 'latin1');
  return object.dict.includes('/FlateDecode') ? Buffer.from(inflateSync(raw)).toString('latin1') : raw.toString('latin1');
}

/** `/BaseFont` of every font the document declares, keyed by its `/Fn` alias. */
function fontAliases(pdf: PdfFile): Map<string, string> {
  const aliases = new Map<string, string>();
  const resources = [...pdf.objects.values()].find((object) => /\/Font <</.test(object.dict));
  for (const entry of resources?.dict.matchAll(/\/(F\d+) (\d+) 0 R/g) ?? []) {
    aliases.set(entry[1]!, /\/BaseFont \/([\w-]+)/.exec(pdf.objects.get(Number(entry[2]))!.dict)?.[1] ?? '');
  }
  return aliases;
}

/* -------------------------------------------------------------- fixtures */

function bookWith(setup: (sheet: Worksheet) => void): PdfBook {
  const workbook = new Workbook() as unknown as PdfBook;
  setup(workbook.getSheet(0) as unknown as Worksheet);
  return workbook;
}

/** 60 rows of text: taller than one Letter page, so pagination yields >1 page. */
function twoPageSheet(sheet: Worksheet): void {
  sheet.setArray(0, 0, Array.from({ length: 60 }, (_, i) => [`Row ${i + 1}`]));
}

describe('PDF document structure', () => {
  it('writes a header, a byte-exact xref table and a trailer', async () => {
    const { bytes } = await exportWorkbookPdf(bookWith(twoPageSheet), {}, 0);
    const text = Buffer.from(bytes).toString('latin1');
    expect(text.startsWith('%PDF-1.7\n%')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);

    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const table = /xref\n0 (\d+)\n([\s\S]*?)\ntrailer/.exec(text);
    expect(table).not.toBeNull();
    const size = Number(table![1]);
    const body = `${table![2]!}\n`;
    const pdf = readPdf(bytes);
    expect(size).toBe(pdf.objects.size + 1);
    // Every xref entry is exactly 20 bytes: `oooooooooo ggggg n \n`.
    expect(body.length).toBe(20 * size);
    expect(body.slice(0, 20)).toBe('0000000000 65535 f \n');
    for (let i = 1; i < size; i++) {
      const entry = /^(\d{10}) 00000 n \n$/.exec(body.slice(20 * i, 20 * (i + 1)));
      expect(entry, `xref entry ${i}`).not.toBeNull();
      // The offset must point at that object's header, byte for byte.
      expect(text.slice(Number(entry![1]), Number(entry![1]) + 20)).toMatch(new RegExp(`^${i} 0 obj`));
      expect(pdf.objects.has(i)).toBe(true);
    }
    const trailer = /trailer\n<<([\s\S]*?)>>/.exec(text)?.[1] ?? '';
    expect(trailer).toContain(`/Size ${size}`);
    for (const key of ['/Root', '/Info', '/ID']) expect(trailer).toContain(key);
    if (typeof CompressionStream === 'function') {
      expect(pdf.objects.get(Number(/\/Contents (\d+) 0 R/.exec(pagesOf(pdf)[0]!.dict)?.[1]))!.dict).toContain('/FlateDecode');
    }
  });

  it('has one PDF page per print page and a consistent page tree', async () => {
    const workbook = bookWith(twoPageSheet);
    const data = new WorksheetClass('Data') as unknown as Worksheet;
    data.setArray(0, 0, [['alpha', 'beta']]);
    workbook.addSheet(1, data as never);
    const expected = collectPrintPages(workbook, [0, 1]).reduce((sum, run) => sum + run.pages.length, 0);
    expect(expected).toBeGreaterThan(2);

    const { bytes, pages } = await exportWorkbookPdf(workbook);
    expect(pages).toBe(expected);
    const pdf = readPdf(bytes);
    expect(pagesOf(pdf)).toHaveLength(expected);
    const tree = [...pdf.objects.values()].find((object) => object.dict.includes('/Type /Pages'))!;
    expect(tree.dict).toContain(`/Count ${expected}`);
    expect((tree.dict.match(/\d+ 0 R/g) ?? []).length).toBe(expected);
    for (const page of pagesOf(pdf)) {
      expect(page.dict).toContain('/Parent');
      expect(page.dict).toContain('/Resources');
      expect(page.dict).toContain('/Contents');
    }
  });

  it('uses the paper size in points as MediaBox (Letter, A4, landscape)', async () => {
    const cases: { name: string; setup: (sheet: Worksheet) => void; box: [number, number] }[] = [
      { name: 'Letter', setup: () => undefined, box: [612, 792] },
      {
        name: 'A4',
        setup: (sheet) => sheet.printInfo().paperSize(new Print.PaperSize(Print.PaperKind.a4) as never),
        box: [595.2756, 841.8898],
      },
      {
        name: 'landscape',
        setup: (sheet) => sheet.printInfo().orientation(Print.PrintPageOrientation.landscape as never),
        box: [792, 612],
      },
    ];
    for (const testCase of cases) {
      const workbook = bookWith((sheet) => {
        sheet.setArray(0, 0, [['x']]);
        testCase.setup(sheet);
      });
      const { bytes } = await exportWorkbookPdf(workbook, {}, 0);
      const model = collectPrintPages(workbook, [0])[0]!.pages[0]!;
      const box = /\/MediaBox \[([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) *\]/.exec(pagesOf(readPdf(bytes))[0]!.dict)!;
      expect([Number(box[1]), Number(box[2])], testCase.name).toEqual([0, 0]);
      expect(Number(box[3]), testCase.name).toBeCloseTo(testCase.box[0], 3);
      expect(Number(box[4]), testCase.name).toBeCloseTo(testCase.box[1], 3);
      // Print pixels are 1/96 inch, so 0.75 pt per px of the paginator's page box.
      expect(model.paperSize.width * PX_TO_PT, testCase.name).toBeCloseTo(Number(box[3]), 4);
      expect(model.paperSize.height * PX_TO_PT, testCase.name).toBeCloseTo(Number(box[4]), 4);
    }
  });

  it('writes the Info entries from the savePDF options', async () => {
    const { bytes } = await exportWorkbookPdf(bookWith((sheet) => sheet.setArray(0, 0, [['x']])), {
      title: 'Quarterly Report',
      author: 'OpenSheets',
      subject: 'Finance',
      keywords: 'a, b',
      creator: 'My App',
      createdAt: new Date(Date.UTC(2026, 10, 12, 8, 9, 10)),
    }, 0);
    const pdf = readPdf(bytes);
    const info = pdf.objects.get(Number(/\/Info (\d+) 0 R/.exec(pdf.trailer)?.[1]))!.dict;
    for (const value of ['(Quarterly Report)', '(OpenSheets)', '(Finance)', '(a, b)', '(My App)', '(OpenSheets PDF writer)', '(D:20261112080910Z)']) {
      expect(info, value).toContain(value);
    }
  });

  it('defaults the Creator and omits metadata that was not given', async () => {
    const { bytes } = await exportWorkbookPdf(bookWith((sheet) => sheet.setArray(0, 0, [['x']])), {}, 0);
    const pdf = readPdf(bytes);
    const info = pdf.objects.get(Number(/\/Info (\d+) 0 R/.exec(pdf.trailer)?.[1]))!.dict;
    expect(info).toContain('/Creator (OpenSheets)');
    expect(info).not.toContain('/Title');
    expect(info).not.toContain('/Keywords');
  });

  it('escapes parentheses and backslashes of literal strings', async () => {
    const { bytes } = await exportWorkbookPdf(bookWith((sheet) => sheet.setValue(0, 0, 'a(b)c\\d')), {}, 0);
    expect(pageContent(readPdf(bytes), 0)).toContain('(a\\(b\\)c\\\\d) Tj');
  });
});

describe('PDF painting of the print pages', () => {
  it('flips y once at page start: the background spans the MediaBox', async () => {
    const { bytes } = await exportWorkbookPdf(bookWith((sheet) => sheet.setArray(0, 0, [['x']])), {}, 0);
    const content = pageContent(readPdf(bytes), 0);
    expect(content.startsWith('q\n1 1 1 rg\n0 792 m\n612 792 l\n612 0 l\n0 0 l\nh\nf\n')).toBe(true);
  });

  it('draws cell text with base-14 fonts and WinAnsi encoding', async () => {
    const { bytes } = await exportWorkbookPdf(bookWith((sheet) => {
      sheet.setValue(0, 0, 'Hello World');
      sheet.getCell(0, 0).font('14pt Arial');
    }), {}, 0);
    const pdf = readPdf(bytes);
    const content = pageContent(pdf, 0);
    expect(content).toContain('(Hello World) Tj');
    expect(content).toMatch(/\/F\d+ 18\.6667 Tf/); // 14pt = 18.6667px of print space
    // The text matrix is upright (positive determinant) although the page is flipped.
    const tm = /BT\n([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) Tm/.exec(content)!;
    expect(Number(tm[1])).toBeGreaterThan(0);
    expect(Number(tm[4])).toBeGreaterThan(0);
    expect(Number(tm[2])).toBe(0);
    expect(Number(tm[3])).toBe(0);
    expect([...fontAliases(pdf).values()]).toContain('Helvetica');
    for (const object of pdf.objects.values()) {
      if (!object.dict.includes('/Type /Font')) continue;
      expect(object.dict).toContain('/Subtype /Type1');
      expect(object.dict).toContain('/Encoding /WinAnsiEncoding');
    }
  });

  it('maps bold, italic, serif and mono families to the base-14 variants', async () => {
    const { bytes } = await exportWorkbookPdf(bookWith((sheet) => {
      const fonts = ['11pt Calibri', 'bold 11pt Arial', 'italic 11pt Arial', 'bold italic 11pt Times New Roman', '11pt Courier New'];
      fonts.forEach((font, col) => {
        sheet.getCell(0, col).font(font);
        sheet.setValue(0, col, `c${col}`);
      });
    }), {}, 0);
    const pdf = readPdf(bytes);
    const content = pageContent(pdf, 0);
    const aliases = fontAliases(pdf);
    const used = new Set([...content.matchAll(/\/(F\d+) [\d.]+ Tf/g)].map((match) => aliases.get(match[1]!)));
    expect([...used].sort()).toEqual(['Courier', 'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Times-BoldItalic']);
  });

  it('paints a filled cell as a coloured closed path', async () => {
    const { bytes } = await exportWorkbookPdf(bookWith((sheet) => {
      sheet.setValue(0, 0, 'A');
      sheet.getCell(0, 0).backColor('red');
    }), {}, 0);
    const content = pageContent(readPdf(bytes), 0);
    expect(content).toContain('1 0 0 rg\n');
    const fill = /1 0 0 rg\n([\s\S]*?)f\n/.exec(content);
    expect(fill, 'the red cell is a filled path').not.toBeNull();
    const points = [...fill![1]!.matchAll(/(-?[\d.-]+) (-?[\d.-]+) [ml]/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(points).toHaveLength(4);
    // Cell A1 sits below the 0.7in left / 0.75in top margin of the printable area.
    expect(points[0]).toEqual([50.4, 738]);
    expect(points[2]![1]).toBeLessThan(points[0]![1]);
  });

  it('strokes borders with colour, width and dash pattern', async () => {
    const { bytes } = await exportWorkbookPdf(bookWith((sheet) => {
      sheet.setValue(0, 0, 'B');
      sheet.getCell(0, 0).setBorder(new LineBorder('blue', 3), { all: true });
    }), {}, 0);
    const content = pageContent(readPdf(bytes), 0);
    expect(content).toContain('0 0 1 RG\n');
    // print.ts draws dashed style 3 as [3, 1] px; the writer scales by 0.75 pt/px.
    expect(content).toContain('[2.25 0.75] 0 d\n');
    expect(content).toContain('0.75 w\n');
    expect((content.match(/\nS\n/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('clips the text of a cell to its rectangle', async () => {
    const { bytes } = await exportWorkbookPdf(bookWith((sheet) => sheet.setValue(0, 0, 'clipped')), {}, 0);
    expect(pageContent(readPdf(bytes), 0)).toContain('W n\n');
  });

  it('draws header and footer text including the page number fields', async () => {
    const { bytes } = await exportWorkbookPdf(bookWith((sheet) => {
      sheet.setValue(0, 0, 'x');
      sheet.printInfo().pageHeaderFooter({
        normal: {
          header: { center: 'Annual Report', left: '&A' },
          footer: { right: 'Page &P of &N' },
        },
      });
    }), {}, 0);
    const content = pageContent(readPdf(bytes), 0);
    expect(content).toContain('(Annual Report) Tj');
    expect(content).toContain('(Page 1 of 1) Tj');
    expect(content).toContain('(Sheet1) Tj');
  });

  it('writes the column and row headers when printing them', async () => {
    const { bytes } = await exportWorkbookPdf(bookWith((sheet) => {
      sheet.setValue(0, 0, 'x');
      sheet.printInfo().showRowHeader(Print.PrintVisibilityType.show).showColumnHeader(Print.PrintVisibilityType.show);
    }), {}, 0);
    const content = pageContent(readPdf(bytes), 0);
    expect(content).toContain('(A) Tj');
    expect(content).toContain('(1) Tj');
  });

  it('replaces non-WinAnsi text with ? and records it in the report', async () => {
    const { bytes, report } = await exportWorkbookPdf(bookWith((sheet) => sheet.setValue(0, 0, 'caf\u00e9 \u4e2d\u6587')), {}, 0);
    // 0xE9 is a non-printable-in-ASCII byte, so the writer escapes it in octal.
    expect(pageContent(readPdf(bytes), 0)).toContain('(caf\\351 ??) Tj');
    expect([...report.missingChars].sort((a, b) => a - b)).toEqual([0x4e2d, 0x6587]);
  });

  it('counts approximated drawing instead of throwing', () => {
    const report = createPdfReport();
    const writer = new PdfWriter();
    const context = new PdfCanvasContext({ width: 100, height: 50, pool: new PdfResourcePool(writer), report });
    context.beginPath();
    context.ellipse(10, 10, 5, 3, 0, 0, Math.PI * 2);
    context.fill();
    expect(report.counts['ellipse']).toBeUndefined();
    context.clearRect(1, 1, 2, 2);
    expect(report.counts['clearRect']).toBe(1);
    context.strokeText('stroked', 5, 5);
    expect(report.counts['strokeText']).toBe(1);
    const gradient = new PdfLinearGradient(0, 0, 10, 0);
    gradient.addColorStop(0, '#ff0000');
    gradient.addColorStop(1, 'rgba(0, 0, 255, 0.5)');
    expect(gradient.stops).toHaveLength(2);
    context.fillStyle = gradient;
    context.strokeStyle = gradient;
    context.strokeRect(0, 0, 10, 10);
    expect(report.counts['stroke:gradient']).toBe(1);
    expect(() => context.setLineDash([3, 1])).not.toThrow();
    expect(context.getLineDash()).toEqual([3, 1]);
    context.font = 'not a font';
    expect(context.font).toBe('10px sans-serif');
    context.fillStyle = 'nonsense';
    expect(report.counts['fillStyle:invalid']).toBe(1);
    expect(() => context.fillText('ok', 1, 1)).not.toThrow();
  });

  it('fills text with the mid colour of a gradient and the colour of a pattern', () => {
    const report = createPdfReport();
    const writer = new PdfWriter();
    const context = new PdfCanvasContext({ width: 100, height: 100, pool: new PdfResourcePool(writer), report });
    const gradient = context.createLinearGradient(0, 0, 10, 0);
    gradient.addColorStop(0, '#ff0000');
    gradient.addColorStop(1, '#0000ff');
    context.fillStyle = gradient;
    context.fillText('g', 5, 5);
    expect(report.counts['fillText:gradient']).toBe(1);
    context.fillStyle = new PdfPattern('#00ff00');
    context.fillText('p', 5, 15);
    expect(report.counts['fillText:pattern']).toBe(1);
    const content = Buffer.from(context.contentData()).toString('latin1');
    expect(content.match(/0\.5 0 0\.5 rg/g)).toHaveLength(1); // mid of the red -> blue ramp
    expect(content).toContain('0 1 0 rg');
    // A gradient stroke uses the same mid-colour rule (`sh` cannot stroke areas).
    context.strokeStyle = gradient;
    context.strokeRect(1, 1, 5, 5);
    expect(Buffer.from(context.contentData()).toString('latin1')).toContain('0.5 0 0.5 RG');
    expect(content).toContain('0 1 0 rg');
  });

  it('warns through console.warn when savePDF approximated something', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const report = createPdfReport();
      report.counts['clearRect'] = 2;
      warnPdfReport(report, 1);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('clearRect x2');
      warn.mockClear();
      warnPdfReport(createPdfReport(), 1);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('PDF writer plumbing', () => {
  it('round-trips a FlateDecode stream through the zlib compressor', async () => {
    const source = new TextEncoder().encode('a'.repeat(4096));
    const { data, compressed } = await deflate(source);
    if (typeof CompressionStream === 'function') {
      expect(compressed).toBe(true);
      expect(data.length).toBeLessThan(source.length);
      expect(inflateSync(Buffer.from(data)).length).toBe(source.length);
    } else {
      expect(compressed).toBe(false);
      expect(data).toEqual(source);
    }
  });

  it('writes an uncompressed stream when the host has no CompressionStream', async () => {
    const original = globalThis.CompressionStream;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- simulating an older host
    delete (globalThis as any).CompressionStream;
    try {
      const writer = new PdfWriter();
      const object = writer.reserve();
      writer.setStream(object, new PdfDict(), new TextEncoder().encode('hello'));
      const bytes = writer.build(new PdfDict().set('Type', new PdfName('Catalog')), null, new Uint8Array(16));
      const text = Buffer.from(bytes).toString('latin1');
      expect(text).toContain('hello');
      expect(text).toContain('/Length 5');
      expect(text).not.toContain('FlateDecode');
      const pdf = readPdf(bytes);
      expect(pdf.objects.get(object)!.stream).toBe('hello');
    } finally {
      globalThis.CompressionStream = original;
    }
  });
});

describe('PDF drawing primitives', () => {
  /** A canvas-like source that answers `getImageData` directly (no DOM needed). */
  function fakeImage(width: number, height: number, fill: (x: number, y: number) => number[]): Record<string, unknown> {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b, a] = fill(x, y);
        const at = (y * width + x) * 4;
        data[at] = r;
        data[at + 1] = g;
        data[at + 2] = b;
        data[at + 3] = a;
      }
    }
    return {
      width,
      height,
      getContext: () => ({ getImageData: () => ({ data }) }),
    };
  }

  /** Paint one small page with compression off so the stream is plain text. */
  async function buildPage(paint: (context: PdfCanvasContext) => void): Promise<{ text: string; report: ReturnType<typeof createPdfReport> }> {
    const original = globalThis.CompressionStream;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exercising the uncompressed writer path
    delete (globalThis as any).CompressionStream;
    const report = createPdfReport();
    const writer = new PdfWriter();
    const pool = new PdfResourcePool(writer);
    const context = new PdfCanvasContext({ width: 200, height: 100, pool, report });
    paint(context);
    await context.finish();
    await pool.flush();
    // The real exporter attaches this to every page; the primitives tests only
    // need it present in the file to assert on the interned resource names.
    writer.addObject(pool.resources());
    const bytes = writer.build(new PdfDict().set('Type', new PdfName('Catalog')), null, new Uint8Array(16));
    globalThis.CompressionStream = original;
    return { text: Buffer.from(bytes).toString('latin1'), report };
  }

  it('embeds drawImage sources as image XObjects with an alpha SMask', async () => {
    const image = fakeImage(4, 2, (x, y) => [x * 60, y * 100, 128, x === 3 ? 128 : 255]);
    const { text, report } = await buildPage((context) => {
      context.drawImage(image as unknown as CanvasImageSource, 10, 10, 40, 20);
    });
    expect(text).toContain('/Subtype /Image');
    expect(text).toContain('/ColorSpace /DeviceRGB');
    expect(text).toContain('/Width 4');
    expect(text).toContain('/Height 2');
    expect(text).toContain('/SMask');
    expect(text).toContain('/ColorSpace /DeviceGray');
    expect(text).toMatch(/\/Im1 Do/);
    // Unit square mapped to the destination rect, y flipped once.
    // Bottom-left corner of the drawn rect: (10,30)px -> (7.5, 75-22.5)pt.
    expect(text).toContain('q\n30 0 0 15 7.5 52.5 cm\n');
    // A supported call must not be reported as approximated.
    expect(report.counts['drawImage']).toBeUndefined();
  });

  it('reuses one XObject when the same image is drawn twice', async () => {
    const image = fakeImage(2, 2, () => [10, 20, 30, 255]);
    const { text } = await buildPage((context) => {
      context.drawImage(image as unknown as CanvasImageSource, 0, 0, 10, 10);
      context.drawImage(image as unknown as CanvasImageSource, 20, 20, 10, 10);
    });
    expect((text.match(/\/Subtype \/Image/g) ?? []).length).toBe(1);
    expect((text.match(/\/Im1 Do/g) ?? []).length).toBe(2);
  });

  it('fills with the average colour of a createPattern source', async () => {
    const tile = fakeImage(2, 2, (x, y) => [x === y ? 255 : 0, 0, 0, 255]);
    const { text, report } = await buildPage((context) => {
      const pattern = context.createPattern(tile as unknown as CanvasImageSource, 'repeat');
      context.fillStyle = pattern;
      context.fillRect(0, 0, 10, 10);
    });
    expect(report.counts['createPattern']).toBe(1);
    expect(report.counts['fill:pattern']).toBe(1);
    // Two of four pixels are white -> average 127.5 -> 0x80.
    expect(text).toContain('0.502 0 0 rg');
  });

  it('paints a linear gradient as an axial shading clipped to the path', async () => {
    const { text, report } = await buildPage((context) => {
      const gradient = context.createLinearGradient(10, 10, 30, 10);
      gradient.addColorStop(0, '#ff0000');
      gradient.addColorStop(1, '#0000ff');
      context.fillStyle = gradient;
      context.fillRect(10, 10, 20, 5);
    });
    expect(report.counts['fill:gradient']).toBeUndefined();
    expect(text).toContain('/Shading << /Sh1');
    expect(text).toContain('/ShadingType 2');
    expect(text).toContain('/FunctionType 2');
    expect(text).toContain('1 0 0');
    expect(text).toContain('0 0 1');
    // Coords follow the page flip: y = 75 pt - 10 px * 0.75 = 67.5 pt.
    expect(text).toContain('/Coords [7.5 67.5 22.5 67.5 ]');
    expect(text).toMatch(/W n\n\/Sh1 sh/);
  });

  it('writes a stitching function for gradients with more than two stops', async () => {
    const { text } = await buildPage((context) => {
      const gradient = context.createLinearGradient(0, 0, 10, 0);
      gradient.addColorStop(0, '#000000');
      gradient.addColorStop(0.5, '#808080');
      gradient.addColorStop(1, '#ffffff');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 10, 10);
    });
    expect(text).toContain('/FunctionType 3');
    expect(text).toContain('/Bounds [0.5 ]');
  });

  it('keeps clip, dash and transform state across save/restore', async () => {
    const { text } = await buildPage((context) => {
      context.save();
      context.beginPath();
      context.rect(5, 5, 10, 10);
      context.clip();
      context.setLineDash([2, 2]);
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(10, 10);
      context.stroke();
      context.restore();
      context.beginPath();
      context.moveTo(1, 1);
      context.lineTo(2, 2);
      context.stroke();
    });
    expect(text).toContain('q\n');
    expect(text).toContain('W n\n');
    expect(text).toContain('[1.5 1.5] 0 d\n');
    expect(text).toContain('1.5 w\n');
    // restore() must reset the dash: the second stroke is solid.
    const after = text.slice(text.lastIndexOf('Q\n'));
    expect(after).toContain('[] 0 d\n');
    expect(after).toContain('0.75 w\n');
  });

  it('applies the CTM of the caller (translate/scale) to paths and text', async () => {
    const { text } = await buildPage((context) => {
      context.scale(2, 2);
      context.translate(5, 5);
      context.font = '10px Arial';
      context.fillText('ab', 0, 0);
      context.beginPath();
      context.arc(10, 10, 4, 0, Math.PI * 2);
      context.fill();
    });
    // (0,0) after scale 2 + translate 5 -> px (10,10) -> pt (7.5, 75-7.5=67.5)
    expect(text).toContain('1.5 0 0 1.5 7.5 67.5 Tm');
    expect(text).toContain('/F1 10 Tf');
    expect(text).toContain('(ab) Tj');
    // A full circle is four cubic segments; all coordinates are transformed.
    expect((text.match(/ c\n/g) ?? []).length).toBe(4);
    // `f` closes the subpaths implicitly, like the canvas fill rule.
    expect(text).toContain('\nf\n');
  });
});

describe('base-14 font tables', () => {
  it('parses CSS shorthands the way a browser normalizes them', () => {
    expect(parseCssFont('11pt Calibri')).toMatchObject({ parsed: true, size: 14.666666666666666, family: 'Calibri' });
    expect(parseCssFont('bold italic 12px Arial')).toMatchObject({ bold: true, italic: true, size: 12 });
    expect(parseCssFont('italic bold 12px Arial')).toMatchObject({ bold: true, italic: true });
    expect(parseCssFont('700 12px Calibri')).toMatchObject({ bold: true, size: 12 });
    expect(parseCssFont('large serif')).toMatchObject({ parsed: true, size: 18, family: 'serif' });
    expect(parseCssFont('12px/1.5 Arial')).toMatchObject({ parsed: true, size: 12, family: 'Arial' });
    expect(parseCssFont('Calibri').parsed).toBe(false);
    expect(parseCssFont('12px').parsed).toBe(false);
  });

  it('picks the closest base-14 family for a CSS family list', () => {
    expect(selectFont('Calibri, sans-serif', 11, false, false).fontKey).toBe('Helvetica');
    expect(selectFont('Arial', 11, true, false).fontKey).toBe('Helvetica-Bold');
    expect(selectFont('Times New Roman, serif', 11, false, true).fontKey).toBe('Times-Italic');
    expect(selectFont('Consolas, monospace', 11, true, true).fontKey).toBe('Courier-BoldOblique');
  });

  it('measures with the AFM advances (public Adobe metrics)', () => {
    expect(textEmWidth('Courier', 'M')).toBeCloseTo(0.6, 6);
    expect(textEmWidth('Courier', 'abc')).toBeCloseTo(1.8, 6);
    expect(textEmWidth('Helvetica', 'III')).toBeCloseTo(3 * 0.278, 6);
    expect(textEmWidth('Helvetica', 'MM')).toBeCloseTo(2 * 0.833, 6);
    expect(textEmWidth('Times-Roman', 'MM')).toBeCloseTo(2 * 0.833, 6);
    expect(textEmWidth('Helvetica-Bold', 'i')).toBeGreaterThan(textEmWidth('Helvetica', 'i'));
    const missing: number[] = [];
    expect(textEmWidth('Helvetica', '\u4e2d', missing)).toBeCloseTo(0.556, 6);
    expect(missing).toEqual([0x4e2d]);
    expect(BASE14_FONTS['Helvetica'].ascender).toBe(718);
    expect(BASE14_FONTS['Times-Roman'].descender).toBeLessThan(0);
  });

  it('maps cp1252-only code points to their WinAnsi bytes', () => {
    expect(winAnsiByteFor(0x20ac)).toBe(128);
    expect(winAnsiByteFor(0x2019)).toBe(146);
    expect(winAnsiByteFor(0xe9)).toBe(233);
    expect(winAnsiByteFor(0xa0)).toBe(160);
    expect(winAnsiByteFor(0x4e2d)).toBeNull();
  });
});

describe('Workbook.savePDF', () => {
  interface SavePdf {
    savePDF(success: (blob: Blob) => void, error?: (error: { errorCode: number; errorMessage: string }) => void, options?: object, sheetIndex?: number): void;
  }
  const asBook = (workbook: PdfBook): SavePdf => workbook as unknown as SavePdf;

  it('exports bound TableSheet values through the print pipeline', async () => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    const table = workbook.dataManager().addTable('people', { data: [{ name: 'Ada' }] });
    const view = table.addView('peopleView', ['name']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'People', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.printInfo().fitPagesWide(1);
    const { bytes } = await exportWorkbookPdf(workbook, {}, 0);
    expect(pageContent(readPdf(bytes), 0)).toContain('(Ada)');
  });

  it('paginates all visible bound TableSheet rows and columns', async () => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    const data = Array.from({ length: 80 }, (_, index) => ({ first: `row${index}`, second: `value${index}` }));
    const table = workbook.dataManager().addTable('people', { data });
    const view = table.addView('peopleView', ['first', 'second']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'People', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    const { bytes } = await exportWorkbookPdf(workbook, {}, 0);
    const pdf = readPdf(bytes);
    expect(pagesOf(pdf).length).toBeGreaterThan(1);
    const contents = pagesOf(pdf).map((_, index) => pageContent(pdf, index)).join(' ');
    expect(contents).toContain('(row0)');
    expect(contents).toContain('(value0)');
    expect(contents).toContain('(row79)');
    expect(contents).toContain('(value79)');
    workbook.destroy();
  });

  it('is implemented: no NotImplemented fallback on the prototype', () => {
    const prototype = Workbook.prototype as unknown as Record<symbol | string, unknown>;
    expect(typeof prototype.savePDF).toBe('function');
    expect(prototype[Symbol.for('@opensheets/NotImplemented')]).toBeUndefined();
    const stub = Symbol.for('@opensheets/NotImplemented');
    expect((prototype.savePDF as Record<symbol, unknown>)[stub]).toBeUndefined();
  });

  it('calls successCallback with an application/pdf blob', async () => {
    const workbook = bookWith((sheet) => sheet.setArray(0, 0, [['x']]));
    const blob = await new Promise<Blob>((resolve, reject) => {
      asBook(workbook).savePDF(resolve, (error) => reject(error), undefined, 0);
    });
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500);
    const reader = blob as unknown as { arrayBuffer?(): Promise<ArrayBuffer> };
    if (typeof reader.arrayBuffer === 'function') {
      const bytes = new Uint8Array(await reader.arrayBuffer());
      expect(Buffer.from(bytes.subarray(0, 8)).toString('latin1')).toBe('%PDF-1.7');
    } else {
      // jsdom's Blob has no arrayBuffer(): read the head through a FileReader.
      const head = await new Promise<string>((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => resolve(Buffer.from(fileReader.result as ArrayBuffer).toString('latin1'));
        fileReader.onerror = () => reject(fileReader.error);
        fileReader.readAsArrayBuffer(blob.slice(0, 8));
      });
      expect(head).toBe('%PDF-1.7');
    }
  });

  it('exports every visible sheet and skips hidden ones', async () => {
    const workbook = bookWith(twoPageSheet);
    const hidden = new WorksheetClass('Hidden') as unknown as Worksheet;
    hidden.setArray(0, 0, [['nope']]);
    workbook.addSheet(1, hidden as never);
    hidden.visible(0);
    const visible = new WorksheetClass('Visible') as unknown as Worksheet;
    visible.setArray(0, 0, [['yes']]);
    workbook.addSheet(2, visible as never);

    const all = await exportWorkbookPdf(workbook);
    const expected = collectPrintPages(workbook, [0, 2]).reduce((sum, run) => sum + run.pages.length, 0);
    expect(all.pages).toBe(expected);
    expect(all.pages).toBeGreaterThan(2);
  });

  it('reports an invalid sheet index through errorCallback', async () => {
    const workbook = bookWith((sheet) => sheet.setArray(0, 0, [['x']]));
    const error = await new Promise<{ errorCode: number; errorMessage: string }>((resolve, reject) => {
      asBook(workbook).savePDF(() => reject(new Error('should not succeed')), resolve, undefined, 7);
    });
    expect(error.errorCode).toBe(PdfErrorCode.invalidSheetIndex);
    expect(error.errorMessage.length).toBeGreaterThan(0);
  });

  it('reports a painting failure through errorCallback and never throws', async () => {
    const workbook = bookWith((sheet) => sheet.setArray(0, 0, [['x']]));
    const sheet = workbook.getSheet(0) as unknown as { _usedRange(): { row: number; col: number } };
    const spy = vi.spyOn(sheet, '_usedRange').mockImplementation(() => {
      throw new Error('boom');
    });
    const failure = await new Promise<{ errorCode: number; errorMessage: string } | null>((resolve) => {
      asBook(workbook).savePDF(() => resolve(null), (error) => resolve(error));
    });
    spy.mockRestore();
    expect(failure).not.toBeNull();
    expect(failure!.errorCode).toBe(PdfErrorCode.exportFailed);
    expect(failure!.errorMessage).toContain('boom');
  });
});
