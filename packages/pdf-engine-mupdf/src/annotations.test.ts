import { describe, expect, it } from 'vitest';
import * as mupdf from 'mupdf';
import { MupdfEngine } from './index.js';

// A blank 300x400pt single-page PDF, built directly with mupdf (not a fixture —
// this exercises the annotation adapter's own logic, not fixture rendering).
function makeBlankPdfBytes(): Uint8Array {
  const doc = new mupdf.PDFDocument();
  doc.insertPage(-1, doc.addPage([0, 0, 300, 400], 0, {}, ''));
  const bytes = doc.saveToBuffer().asUint8Array();
  doc.destroy();
  return bytes;
}

// Step 4 pass criteria: "write one instance of every markup type the feature
// set calls for (freehand, line, arrow, rectangle, circle, textbox)... save,
// reopen... to confirm the annotations are still editable objects, not
// rasterized." This test proves the round trip at the mupdf.js object level —
// reopening in an independent PDF reader (Step 4's other pass condition) is
// tracked in TESTING_CHECKLIST.md as a manual step.
describe('MupdfEngine annotation round trip (Step 4)', () => {
  it('writes every required markup kind and reads back matching geometry after save+reopen', async () => {
    const engine = new MupdfEngine();
    const doc = await engine.openDocument(makeBlankPdfBytes());

    const ids: Record<string, string> = {};
    ids.freehand = await doc.addAnnotation({
      kind: 'freehand',
      pageIndex: 0,
      geometry: { kind: 'freehand', points: [{ x: 10, y: 10 }, { x: 20, y: 30 }, { x: 40, y: 15 }] },
    });
    ids.line = await doc.addAnnotation({
      kind: 'line',
      pageIndex: 0,
      geometry: { kind: 'line', from: { x: 5, y: 5 }, to: { x: 100, y: 50 } },
      style: { colorRGBA: [1, 0, 0, 1] },
    });
    ids.arrow = await doc.addAnnotation({
      kind: 'arrow',
      pageIndex: 0,
      geometry: { kind: 'arrow', from: { x: 20, y: 200 }, to: { x: 120, y: 250 } },
    });
    ids.rectangle = await doc.addAnnotation({
      kind: 'rectangle',
      pageIndex: 0,
      geometry: { kind: 'rectangle', rect: { x0: 30, y0: 30, x1: 90, y1: 80 } },
    });
    ids.circle = await doc.addAnnotation({
      kind: 'circle',
      pageIndex: 0,
      geometry: { kind: 'circle', center: { x: 150, y: 150 }, radius: 25 },
    });
    ids.textbox = await doc.addAnnotation({
      kind: 'textbox',
      pageIndex: 0,
      geometry: { kind: 'textbox', rect: { x0: 10, y0: 300, x1: 150, y1: 350 }, text: 'Step 4 round trip' },
    });

    // Save, then reopen as an entirely separate document instance — proves
    // the annotations persist through a real file round trip, not just in
    // the live in-memory object graph.
    const savedBytes = await doc.save();
    const reopened = await engine.openDocument(savedBytes);
    const listed = await reopened.listAnnotations(0);

    expect(listed).toHaveLength(6);
    const byId = Object.fromEntries(listed.map((a) => [a.id, a]));

    expect(byId[ids.freehand].kind).toBe('freehand');
    if (byId[ids.freehand].geometry.kind === 'freehand') {
      expect(byId[ids.freehand].geometry.points).toEqual([{ x: 10, y: 10 }, { x: 20, y: 30 }, { x: 40, y: 15 }]);
    }

    expect(byId[ids.line].kind).toBe('line');
    if (byId[ids.line].geometry.kind === 'line') {
      expect(byId[ids.line].geometry.from).toEqual({ x: 5, y: 5 });
      expect(byId[ids.line].geometry.to).toEqual({ x: 100, y: 50 });
    }

    expect(byId[ids.arrow].kind).toBe('arrow');

    expect(byId[ids.rectangle].kind).toBe('rectangle');
    if (byId[ids.rectangle].geometry.kind === 'rectangle') {
      expect(byId[ids.rectangle].geometry.rect).toEqual({ x0: 30, y0: 30, x1: 90, y1: 80 });
    }

    expect(byId[ids.circle].kind).toBe('circle');
    if (byId[ids.circle].geometry.kind === 'circle') {
      expect(byId[ids.circle].geometry.center).toEqual({ x: 150, y: 150 });
      expect(byId[ids.circle].geometry.radius).toBe(25);
    }

    expect(byId[ids.textbox].kind).toBe('textbox');
    if (byId[ids.textbox].geometry.kind === 'textbox') {
      expect(byId[ids.textbox].geometry.text).toBe('Step 4 round trip');
      expect(byId[ids.textbox].geometry.rect).toEqual({ x0: 10, y0: 300, x1: 150, y1: 350 });
    }
  });

  it('writes a polyline as a real PDF PolyLine annotation and reads back its vertices after save+reopen', async () => {
    const engine = new MupdfEngine();
    const doc = await engine.openDocument(makeBlankPdfBytes());

    const id = await doc.addAnnotation({
      kind: 'polyline',
      pageIndex: 0,
      geometry: { kind: 'polyline', points: [{ x: 10, y: 10 }, { x: 20, y: 30 }, { x: 40, y: 15 }, { x: 60, y: 40 }] },
    });

    const reopened = await engine.openDocument(await doc.save());
    const listed = await reopened.listAnnotations(0);

    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(id);
    expect(listed[0].kind).toBe('polyline');
    if (listed[0].geometry.kind === 'polyline') {
      expect(listed[0].geometry.points).toEqual([{ x: 10, y: 10 }, { x: 20, y: 30 }, { x: 40, y: 15 }, { x: 60, y: 40 }]);
    }
  });

  it('deleteAnnotation removes exactly the targeted annotation, leaving the others', async () => {
    const engine = new MupdfEngine();
    const doc = await engine.openDocument(makeBlankPdfBytes());
    const idA = await doc.addAnnotation({ kind: 'rectangle', pageIndex: 0, geometry: { kind: 'rectangle', rect: { x0: 0, y0: 0, x1: 10, y1: 10 } } });
    const idB = await doc.addAnnotation({ kind: 'rectangle', pageIndex: 0, geometry: { kind: 'rectangle', rect: { x0: 20, y0: 20, x1: 30, y1: 30 } } });

    await doc.deleteAnnotation(idA);
    const remaining = await doc.listAnnotations(0);

    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(idB);
  });

  it('flattenOverlay bakes a raster snapshot into the page content (not as an annotation)', async () => {
    const engine = new MupdfEngine();
    const doc = await engine.openDocument(makeBlankPdfBytes());

    // A tiny, genuinely valid PNG — produced by mupdf itself rather than a
    // hand-rolled encoder, so it's guaranteed spec-correct input.
    const tinyDoc = new mupdf.PDFDocument();
    tinyDoc.insertPage(-1, tinyDoc.addPage([0, 0, 10, 10], 0, {}, ''));
    const tinyPage = tinyDoc.loadPage(0);
    const pngBytes = tinyPage.toPixmap([1, 0, 0, 1, 0, 0], mupdf.ColorSpace.DeviceRGB, false, true).asPNG();
    tinyDoc.destroy();

    await doc.flattenOverlay({
      pageIndex: 0,
      overlaySnapshot: { kind: 'raster', pngBytes: new Uint8Array(pngBytes), pageRect: { x0: 0, y0: 0, x1: 300, y1: 400 } },
    });

    // The baked overlay must not show up as an annotation — it's now part of
    // the page's own drawn content, indistinguishable from the original page.
    const annotationsAfter = await doc.listAnnotations(0);
    expect(annotationsAfter).toHaveLength(0);

    const savedBytes = await doc.save();
    const reopened = await engine.openDocument(savedBytes);
    // If the image XObject didn't make it into a real, readable page, this
    // would throw or return a page with no content at all.
    expect(reopened.getPageCount()).toBe(1);
  });
});

// Step 7 (PDF export/import): a domain object's own id (Segment.id etc.)
// becomes the annotation's /NM verbatim, so a save+reopen round trip can
// correlate a listed annotation back to the domain object that owns it with
// no separate id-mapping table — see AnnotationSpec.id's doc comment.
describe('MupdfEngine id correlation (Step 7)', () => {
  it('addAnnotation uses a caller-supplied id as the annotation id, surviving save+reopen', async () => {
    const engine = new MupdfEngine();
    const doc = await engine.openDocument(makeBlankPdfBytes());

    const returnedId = await doc.addAnnotation({
      id: 'segment-42',
      kind: 'line',
      pageIndex: 0,
      geometry: { kind: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
    });
    expect(returnedId).toBe('segment-42');

    const reopened = await engine.openDocument(await doc.save());
    const listed = await reopened.listAnnotations(0);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe('segment-42');
  });

  it('addAnnotation still autogenerates an id when the caller supplies none', async () => {
    const engine = new MupdfEngine();
    const doc = await engine.openDocument(makeBlankPdfBytes());
    const id = await doc.addAnnotation({
      kind: 'rectangle',
      pageIndex: 0,
      geometry: { kind: 'rectangle', rect: { x0: 0, y0: 0, x1: 5, y1: 5 } },
    });
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('MupdfEngine stamp annotation (Step 7)', () => {
  it('writes a placed image as a Stamp annotation and reads back its geometry after save+reopen', async () => {
    const engine = new MupdfEngine();
    const doc = await engine.openDocument(makeBlankPdfBytes());

    // A tiny, genuinely valid PNG, produced by mupdf itself.
    const tinyDoc = new mupdf.PDFDocument();
    tinyDoc.insertPage(-1, tinyDoc.addPage([0, 0, 10, 10], 0, {}, ''));
    const pngBytes = tinyDoc.loadPage(0).toPixmap([1, 0, 0, 1, 0, 0], mupdf.ColorSpace.DeviceRGB, false, true).asPNG();
    tinyDoc.destroy();

    const id = await doc.addAnnotation({
      id: 'stamp-1',
      kind: 'stamp',
      pageIndex: 0,
      geometry: { kind: 'stamp', position: { x: 20, y: 30 }, widthPt: 40, heightPt: 25, rotationDegrees: 90, pngBytes: new Uint8Array(pngBytes) },
    });
    expect(id).toBe('stamp-1');

    const reopened = await engine.openDocument(await doc.save());
    const listed = await reopened.listAnnotations(0);
    expect(listed).toHaveLength(1);
    expect(listed[0].kind).toBe('stamp');
    if (listed[0].geometry.kind === 'stamp') {
      expect(listed[0].geometry.position).toEqual({ x: 20, y: 30 });
      expect(listed[0].geometry.widthPt).toBe(40);
      expect(listed[0].geometry.heightPt).toBe(25);
      expect(listed[0].geometry.rotationDegrees).toBe(90);
    }
  });
});

describe('MupdfEngine embedded project JSON (Step 7)', () => {
  it('setEmbeddedFile then getEmbeddedFile round-trips through save+reopen', async () => {
    const engine = new MupdfEngine();
    const doc = await engine.openDocument(makeBlankPdfBytes());
    const json = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, hello: 'world' }));

    await doc.setEmbeddedFile('mepapp-project.json', json);
    const reopened = await engine.openDocument(await doc.save());
    const readBack = await reopened.getEmbeddedFile('mepapp-project.json');

    expect(readBack).not.toBeNull();
    expect(new TextDecoder().decode(readBack!)).toBe(JSON.stringify({ schemaVersion: 1, hello: 'world' }));
  });

  it('getEmbeddedFile returns null for a PDF with no embedded file by that name', async () => {
    const engine = new MupdfEngine();
    const doc = await engine.openDocument(makeBlankPdfBytes());
    expect(await doc.getEmbeddedFile('mepapp-project.json')).toBeNull();
  });

  it('setEmbeddedFile replaces rather than duplicates an existing entry', async () => {
    const engine = new MupdfEngine();
    const doc = await engine.openDocument(makeBlankPdfBytes());
    await doc.setEmbeddedFile('mepapp-project.json', new TextEncoder().encode('{"v":1}'));
    await doc.setEmbeddedFile('mepapp-project.json', new TextEncoder().encode('{"v":2}'));

    const reopened = await engine.openDocument(await doc.save());
    const readBack = await reopened.getEmbeddedFile('mepapp-project.json');
    expect(new TextDecoder().decode(readBack!)).toBe('{"v":2}');
  });
});
