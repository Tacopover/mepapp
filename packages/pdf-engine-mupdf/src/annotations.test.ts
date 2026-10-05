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
      geometry: { kind: 'textbox', rect: { x0: 10, y0: 300, x1: 150, y1: 350 }, text: 'Step 4 round trip', rotationDegrees: 0 },
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
      expect(byId[ids.textbox].geometry.rotationDegrees).toBe(0);
    }
  });

  it('writes a rotated textbox with a custom appearance stream and reads back its angle and original rect after save+reopen', async () => {
    const engine = new MupdfEngine();
    const doc = await engine.openDocument(makeBlankPdfBytes());

    const id = await doc.addAnnotation({
      kind: 'textbox',
      pageIndex: 0,
      geometry: { kind: 'textbox', rect: { x0: 20, y0: 50, x1: 120, y1: 80 }, text: 'Diagonal label', rotationDegrees: 45 },
    });

    const reopened = await engine.openDocument(await doc.save());
    const listed = await reopened.listAnnotations(0);

    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(id);
    expect(listed[0].kind).toBe('textbox');
    if (listed[0].geometry.kind === 'textbox') {
      expect(listed[0].geometry.text).toBe('Diagonal label');
      expect(listed[0].geometry.rotationDegrees).toBe(45);
      // The original local (unrotated) rect round-trips verbatim — not the
      // rotated AABB that getRect() alone would return.
      expect(listed[0].geometry.rect).toEqual({ x0: 20, y0: 50, x1: 120, y1: 80 });
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

// A PNG drawn by mupdf from a content stream: lets a test pick which side of
// the image is red and which is blue, to check the image's orientation.
function makePngBytes(width: number, height: number, contents: string): Uint8Array {
  const doc = new mupdf.PDFDocument();
  doc.insertPage(-1, doc.addPage([0, 0, width, height], 0, {}, contents));
  const png = new Uint8Array(doc.loadPage(0).toPixmap([1, 0, 0, 1, 0, 0], mupdf.ColorSpace.DeviceRGB, false, true).asPNG());
  doc.destroy();
  return png;
}

/** The pixel box [x0, y0, x1, y1] that `matches` covers on page 0 as MuPDF displays it (page /Rotate applied, 1 px per pt). */
function renderedBox(pdfBytes: Uint8Array, matches: (r: number, g: number, b: number) => boolean): number[] | null {
  const doc = new mupdf.PDFDocument(pdfBytes);
  const pixmap = doc.loadPage(0).toPixmap([1, 0, 0, 1, 0, 0], mupdf.ColorSpace.DeviceRGB, false, true);
  const width = pixmap.getWidth();
  const pixels = pixmap.getPixels();
  let box: number[] | null = null;
  for (let i = 0; i < pixels.length; i += 3) {
    if (!matches(pixels[i], pixels[i + 1], pixels[i + 2])) continue;
    const x = (i / 3) % width;
    const y = Math.floor(i / 3 / width);
    box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x + 1), Math.max(box[3], y + 1)] : [x, y, x + 1, y + 1];
  }
  doc.destroy();
  return box;
}

describe('MupdfEngine stamp annotation on a rotated page (round-trip investigation, issue 3)', () => {
  // The image is red on its left half and blue on its right half as it should
  // show on screen. The caller hands it in turned back by the page's /Rotate
  // (see @mepapp/render's writeAnnotationForId), drawn here directly.
  // expectedRawRect is the world rect x 20..60, y 30..50 mapped into the
  // unrotated 300x400 user space by hand from ISO 32000's /Rotate definition
  // (clockwise for display), independent of MuPDF's own conversion.
  const cases = [
    { rotation: 90, png: makePngBytes(10, 20, '1 0 0 rg 0 0 10 10 re f 0 0 1 rg 0 10 10 10 re f'), expectedRawRect: [30, 20, 50, 60] },
    { rotation: 180, png: makePngBytes(20, 10, '1 0 0 rg 10 0 10 10 re f 0 0 1 rg 0 0 10 10 re f'), expectedRawRect: [240, 30, 280, 50] },
    { rotation: 270, png: makePngBytes(10, 20, '1 0 0 rg 0 10 10 10 re f 0 0 1 rg 0 0 10 10 re f'), expectedRawRect: [250, 340, 270, 380] },
  ];

  for (const { rotation, png, expectedRawRect } of cases) {
    it(`/Rotate ${rotation}: the saved stamp shows where it was placed, the right way up, and reads back unchanged`, async () => {
      const engine = new MupdfEngine();
      const rotatedDoc = new mupdf.PDFDocument();
      rotatedDoc.insertPage(-1, rotatedDoc.addPage([0, 0, 300, 400], rotation, {}, ''));
      const bytes = new Uint8Array(rotatedDoc.saveToBuffer().asUint8Array());
      rotatedDoc.destroy();
      const doc = await engine.openDocument(bytes);

      await doc.addAnnotation({
        id: 'stamp-rot',
        kind: 'stamp',
        pageIndex: 0,
        geometry: { kind: 'stamp', position: { x: 20, y: 30 }, widthPt: 40, heightPt: 20, rotationDegrees: 0, pngBytes: png },
      });
      const saved = await doc.save();

      const rawCheck = new mupdf.PDFDocument(saved);
      expect(rawCheck.loadPage(0).getAnnotations()[0].getObject().get('Rect').asJS()).toEqual(expectedRawRect);
      rawCheck.destroy();

      // 1 px of tolerance for the anti-aliased edge where red meets blue.
      const red = renderedBox(saved, (r, g, b) => r > 200 && g < 80 && b < 80);
      const blue = renderedBox(saved, (r, g, b) => b > 200 && r < 80 && g < 80);
      expect(red).not.toBeNull();
      expect(blue).not.toBeNull();
      [20, 30, 40, 50].forEach((value, i) => expect(Math.abs(red![i] - value)).toBeLessThanOrEqual(1));
      [40, 30, 60, 50].forEach((value, i) => expect(Math.abs(blue![i] - value)).toBeLessThanOrEqual(1));

      const reopened = await engine.openDocument(saved);
      const listed = await reopened.listAnnotations(0);
      expect(listed).toHaveLength(1);
      if (listed[0].geometry.kind === 'stamp') {
        expect(listed[0].geometry.position).toEqual({ x: 20, y: 30 });
        expect(listed[0].geometry.widthPt).toBe(40);
        expect(listed[0].geometry.heightPt).toBe(20);
        expect(listed[0].geometry.rotationDegrees).toBe(0);
      }
    });
  }
});

describe('MupdfEngine save() called more than once per open session (round-trip investigation, issue 4)', () => {
  it('does not corrupt the xref chain when save() is called again after further edits, without reopening', async () => {
    const engine = new MupdfEngine();
    const doc = await engine.openDocument(makeBlankPdfBytes());

    await doc.addAnnotation({ kind: 'rectangle', pageIndex: 0, geometry: { kind: 'rectangle', rect: { x0: 0, y0: 0, x1: 10, y1: 10 } } });
    await doc.save(); // first Save click

    await doc.addAnnotation({ kind: 'rectangle', pageIndex: 0, geometry: { kind: 'rectangle', rect: { x0: 20, y0: 20, x1: 30, y1: 30 } } });
    const secondSave = await doc.save(); // second Save click, same handle, no reopen in between

    await doc.addAnnotation({ kind: 'rectangle', pageIndex: 0, geometry: { kind: 'rectangle', rect: { x0: 40, y0: 40, x1: 50, y1: 50 } } });
    const thirdSave = await doc.save(); // third Save click

    const rawSecond = new mupdf.PDFDocument(secondSave);
    expect(rawSecond.wasRepaired()).toBe(false);
    rawSecond.destroy();

    const rawThird = new mupdf.PDFDocument(thirdSave);
    expect(rawThird.wasRepaired()).toBe(false);
    rawThird.destroy();

    const reopened = await engine.openDocument(thirdSave);
    expect(await reopened.listAnnotations(0)).toHaveLength(3);
  });
});

// A broken startxref offset — the kind of damage MuPDF silently repairs on
// open, after which it refuses an incremental write.
function withBrokenStartxref(bytes: Uint8Array): Uint8Array {
  const marker = new TextEncoder().encode('startxref');
  let at = -1;
  for (let i = bytes.length - marker.length; i >= 0 && at < 0; i--) {
    if (marker.every((b, j) => bytes[i + j] === b)) at = i;
  }
  const tail = new TextEncoder().encode('startxref\n999999\n%%EOF\n');
  const out = new Uint8Array(at + tail.length);
  out.set(bytes.subarray(0, at));
  out.set(tail, at);
  return out;
}

describe('MupdfEngine save() on a file MuPDF repaired on open', () => {
  it('writes the file in full, and the next save works too', async () => {
    const damaged = withBrokenStartxref(makeBlankPdfBytes());
    const raw = new mupdf.PDFDocument(damaged);
    expect(raw.wasRepaired()).toBe(true);
    expect(raw.canBeSavedIncrementally()).toBe(false);
    raw.destroy();

    const engine = new MupdfEngine();
    const doc = await engine.openDocument(damaged);
    await doc.addAnnotation({ kind: 'rectangle', pageIndex: 0, geometry: { kind: 'rectangle', rect: { x0: 0, y0: 0, x1: 10, y1: 10 } } });
    await doc.setEmbeddedFile('project.json', new TextEncoder().encode('{"v":1}'));
    const firstSave = await doc.save();

    await doc.addAnnotation({ kind: 'rectangle', pageIndex: 0, geometry: { kind: 'rectangle', rect: { x0: 20, y0: 20, x1: 30, y1: 30 } } });
    const secondSave = await doc.save();

    for (const bytes of [firstSave, secondSave]) {
      const check = new mupdf.PDFDocument(bytes);
      expect(check.wasRepaired()).toBe(false);
      check.destroy();
    }
    const reopened = await engine.openDocument(secondSave);
    expect(await reopened.listAnnotations(0)).toHaveLength(2);
    expect(new TextDecoder().decode((await reopened.getEmbeddedFile('project.json'))!)).toBe('{"v":1}');
  });
});

describe('MupdfEngine save() file size', () => {
  it('does not grow when a stamp moves and the file is saved again', async () => {
    const engine = new MupdfEngine();
    const doc = await engine.openDocument(makeBlankPdfBytes());
    // 200x200 px: about 117 KB per save when the image is stored raw.
    const png = makePngBytes(200, 200, '0 0 1 rg 20 20 160 160 re f');
    const sizes: number[] = [];
    for (let i = 0; i < 4; i++) {
      // A moved stamp is deleted and written again, as @mepapp/render's exportToPdf does.
      if (i > 0) await doc.deleteAnnotation('stamp-1');
      await doc.addAnnotation({
        id: 'stamp-1',
        kind: 'stamp',
        pageIndex: 0,
        geometry: { kind: 'stamp', position: { x: 20 + i * 10, y: 30 }, widthPt: 40, heightPt: 40, rotationDegrees: 0, pngBytes: png },
      });
      await doc.setEmbeddedFile('project.json', new TextEncoder().encode(`{"v":${i}}`));
      sizes.push((await doc.save()).length);
    }
    expect(sizes[3]).toBeLessThanOrEqual(sizes[0] + 512);
  });

  it('appends to a file whose signatures need append-only saves, and keeps its original bytes', async () => {
    const signed = new mupdf.PDFDocument();
    signed.insertPage(-1, signed.addPage([0, 0, 300, 400], 0, {}, ''));
    const acroForm = signed.newDictionary();
    acroForm.put('Fields', signed.newArray());
    acroForm.put('SigFlags', 3);
    signed.getTrailer().get('Root').put('AcroForm', acroForm);
    const original = new Uint8Array(signed.saveToBuffer().asUint8Array());
    signed.destroy();

    const engine = new MupdfEngine();
    const doc = await engine.openDocument(original);
    await doc.addAnnotation({ kind: 'rectangle', pageIndex: 0, geometry: { kind: 'rectangle', rect: { x0: 0, y0: 0, x1: 10, y1: 10 } } });
    const firstSave = await doc.save();
    await doc.addAnnotation({ kind: 'rectangle', pageIndex: 0, geometry: { kind: 'rectangle', rect: { x0: 20, y0: 20, x1: 30, y1: 30 } } });
    const secondSave = await doc.save();

    expect(firstSave.subarray(0, original.length)).toEqual(original);
    expect(secondSave.subarray(0, firstSave.length)).toEqual(firstSave);
    const check = new mupdf.PDFDocument(secondSave);
    expect(check.wasRepaired()).toBe(false);
    check.destroy();
    expect(await (await engine.openDocument(secondSave)).listAnnotations(0)).toHaveLength(2);
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
