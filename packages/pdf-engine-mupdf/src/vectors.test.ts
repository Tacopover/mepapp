import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as mupdf from 'mupdf';
import { MupdfEngine } from './index.js';

const FIXTURE_DIR = fileURLToPath(new URL('../../../fixtures/pdfs/', import.meta.url));
const fixturePath = (name: string) => `${FIXTURE_DIR}${name}`;

// Every PDF present in fixtures/pdfs/ gets a smoke test. Some files are
// untracked (kept out of git by decision), so the list depends on the checkout.
const PDF_NAMES = existsSync(FIXTURE_DIR) ? readdirSync(FIXTURE_DIR).filter((n) => n.toLowerCase().endsWith('.pdf')).sort() : [];

// Test_doc.pdf has about 1M strokes: cap it so the test stays fast.
const SMOKE_MAX_SEGMENTS: Record<string, number> = { 'Test_doc.pdf': 50_000 };

async function open(name: string) {
  return new MupdfEngine().openDocument(new Uint8Array(readFileSync(fixturePath(name))));
}

describe('MupdfEngine vector/text extraction: smoke test per fixture', () => {
  it('finds at least one fixture PDF', () => {
    expect(PDF_NAMES.length).toBeGreaterThan(0);
  });

  for (const name of PDF_NAMES) {
    it(`${name}: segments, text runs and layers are well formed`, async () => {
      const doc = await open(name);
      const info = doc.getPageInfo(0);
      const swap = info.rotationDegrees === 90 || info.rotationDegrees === 270;
      const width = swap ? info.heightPt : info.widthPt;
      const height = swap ? info.widthPt : info.heightPt;

      const maxSegments = SMOKE_MAX_SEGMENTS[name];
      const data = await doc.getVectorPaths(0, maxSegments ? { maxSegments } : undefined);
      expect(data.segments.length).toBe(8 * data.segmentCount);
      expect(data.segmentCount).toBeGreaterThan(0);
      if (maxSegments) {
        expect(data.truncated).toBe(true);
        expect(data.segmentCount).toBe(maxSegments);
      }

      // Clipping keeps content near the page; allow one page size of margin
      // because the outermost clip is unbounded.
      const marginX = width;
      const marginY = height;
      for (let i = 0; i < data.segmentCount; i++) {
        const o = i * 8;
        for (let k = 0; k < 8; k++) {
          if (!Number.isFinite(data.segments[o + k])) throw new Error(`${name}: segment ${i} field ${k} is not finite`);
        }
        const inRange =
          data.segments[o] >= -marginX && data.segments[o] <= width + marginX &&
          data.segments[o + 2] >= -marginX && data.segments[o + 2] <= width + marginX &&
          data.segments[o + 1] >= -marginY && data.segments[o + 1] <= height + marginY &&
          data.segments[o + 3] >= -marginY && data.segments[o + 3] <= height + marginY;
        if (!inRange) throw new Error(`${name}: segment ${i} is far outside the ${width}x${height} page`);
        expect(data.segments[o + 4]).toBeGreaterThanOrEqual(0);
        expect(data.segments[o + 5]).toBeGreaterThanOrEqual(0);
        expect(data.segments[o + 5]).toBeLessThanOrEqual(0xffffff);
        expect(data.segments[o + 6]).toBeLessThan(8); // kind 0..3 plus closed bit 4
      }

      const runs = await doc.getTextRuns(0);
      for (const run of runs) {
        expect(Number.isFinite(run.x + run.y + run.width + run.height + run.fontSizePt)).toBe(true);
      }
      const layers = await doc.listLayers();
      expect(Array.isArray(layers)).toBe(true);
    }, 120_000);
  }
});

describe('MupdfEngine vector extraction: exact expectations on tracked fixtures', () => {
  it.skipIf(!PDF_NAMES.includes('arch_simple_A4.pdf'))('arch_simple_A4.pdf has 12 stroked lines', async () => {
    const doc = await open('arch_simple_A4.pdf');
    const data = await doc.getVectorPaths(0);
    let stroked = 0;
    for (let i = 0; i < data.segmentCount; i++) {
      if ((data.segments[i * 8 + 6] & 3) === 0 && data.segments[i * 8 + 4] > 0) stroked++;
    }
    expect(stroked).toBe(12);
    expect(data.truncated).toBe(false);
  });

  it.skipIf(!PDF_NAMES.includes('00_arch_ground_floor.pdf'))('00_arch_ground_floor.pdf is within 1% of 55,460 segments', async () => {
    const doc = await open('00_arch_ground_floor.pdf');
    const data = await doc.getVectorPaths(0);
    expect(data.truncated).toBe(false);
    expect(Math.abs(data.segmentCount - 55_460) / 55_460).toBeLessThan(0.01);
  });
});

describe('MupdfEngine vector extraction: options', () => {
  it.skipIf(!PDF_NAMES.includes('arch_simple_A4.pdf'))('maxSegments truncates and reports it', async () => {
    const doc = await open('arch_simple_A4.pdf');
    const data = await doc.getVectorPaths(0, { maxSegments: 5 });
    expect(data.truncated).toBe(true);
    expect(data.segmentCount).toBe(5);
    expect(data.segments.length).toBe(40);
  });
});

// One stroked line from (10,20) to (110,20) in PDF content space (origin bottom-left, y up) on a 300x400pt page.
function makeLinePdfBytes(rotation: number): Uint8Array {
  const doc = new mupdf.PDFDocument();
  doc.insertPage(-1, doc.addPage([0, 0, 300, 400], rotation, {}, '2 w 10 20 m 110 20 l S'));
  const bytes = doc.saveToBuffer().asUint8Array();
  doc.destroy();
  return bytes;
}

describe('MupdfEngine vector extraction: displayed page space', () => {
  // Expected values follow contentToDisplayTransform in @mepapp/core calibration.ts.
  const cases: Array<[number, number[]]> = [
    [0, [10, 380, 110, 380]],
    [90, [20, 10, 20, 110]],
    [180, [290, 20, 190, 20]],
    [270, [380, 290, 380, 190]],
  ];
  for (const [rotation, expected] of cases) {
    it(`page /Rotate ${rotation} maps to top-left, y-down coordinates`, async () => {
      const doc = await new MupdfEngine().openDocument(makeLinePdfBytes(rotation));
      const data = await doc.getVectorPaths(0);
      expect(data.segmentCount).toBe(1);
      expected.forEach((v, i) => expect(data.segments[i]).toBeCloseTo(v, 3));
      expect(data.segments[4]).toBeCloseTo(2, 3); // stroke width
    });
  }
});
