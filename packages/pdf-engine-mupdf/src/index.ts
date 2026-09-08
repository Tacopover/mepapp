// MuPDF.js adapter implementing the PdfEngine interface from @mepapp/pdf-engine.
// Nothing outside this package may import `mupdf` directly.

import * as mupdf from 'mupdf';
import type {
  AnnotationSpec,
  FlattenRequest,
  PageInfo,
  PdfDocumentHandle,
  PdfEngine,
  RasterOptions,
  StoredAnnotation,
} from '@mepapp/pdf-engine';

const VALID_ROTATIONS = [0, 90, 180, 270] as const;

function escapePdfLiteralString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Hand-written PDF text-drawing operators for a FreeText annotation's custom
// appearance stream — only used when the textbox is rotated (see the
// 'textbox' case in addAnnotation below); the unrotated case still uses
// mupdf's own setDefaultAppearance()+update() auto-appearance. Local
// coordinates: (0,0) is the box's bottom-left, matching the appearance's own
// BBox, not the page.
function freeTextAppearanceContents(text: string, heightPt: number, fontSize: number, rgb: [number, number, number]): string {
  const padding = 3;
  const leading = fontSize * 1.2;
  const lines = text.split('\n');
  const startY = heightPt - padding - fontSize;
  const ops = ['q', `${rgb[0]} ${rgb[1]} ${rgb[2]} rg`, 'BT', `/Helv ${fontSize} Tf`, `1 0 0 1 ${padding} ${startY} Tm`];
  lines.forEach((line, i) => {
    if (i > 0) ops.push(`0 ${-leading} Td`);
    ops.push(`(${escapePdfLiteralString(line)}) Tj`);
  });
  ops.push('ET', 'Q');
  return ops.join('\n');
}

function readMediaBox(page: mupdf.PDFPage): [number, number, number, number] {
  const box = page.getObject().getInheritable('MediaBox');
  const values = box.asJS() as number[];
  return [values[0], values[1], values[2], values[3]];
}

function readRotation(page: mupdf.PDFPage): PageInfo['rotationDegrees'] {
  const rotate = page.getObject().getInheritable('Rotate');
  if (rotate.isNull() || !rotate.isNumber()) {
    return 0;
  }
  const normalized = (((Math.round(rotate.asNumber() / 90) * 90) % 360) + 360) % 360;
  return (VALID_ROTATIONS as readonly number[]).includes(normalized)
    ? (normalized as PageInfo['rotationDegrees'])
    : 0;
}

function annotationToSpec(annot: mupdf.PDFAnnotation, pageIndex: number): AnnotationSpec | null {
  const type = annot.getType();
  switch (type) {
    case 'Ink': {
      const strokes = annot.getInkList();
      const first = strokes[0] ?? [];
      return {
        kind: 'freehand',
        pageIndex,
        geometry: { kind: 'freehand', points: first.map(([x, y]) => ({ x, y })) },
      };
    }
    case 'Line': {
      const [[fx, fy], [tx, ty]] = annot.getLine();
      const isArrow = annot.getLineEndingStyles().end === 'ClosedArrow';
      return {
        kind: isArrow ? 'arrow' : 'line',
        pageIndex,
        geometry: { kind: isArrow ? 'arrow' : 'line', from: { x: fx, y: fy }, to: { x: tx, y: ty } },
      };
    }
    case 'Square': {
      const [x0, y0, x1, y1] = annot.getRect();
      return { kind: 'rectangle', pageIndex, geometry: { kind: 'rectangle', rect: { x0, y0, x1, y1 } } };
    }
    case 'Circle': {
      const [x0, y0, x1, y1] = annot.getRect();
      return {
        kind: 'circle',
        pageIndex,
        geometry: { kind: 'circle', center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, radius: (x1 - x0) / 2 },
      };
    }
    case 'Highlight': {
      const quads = annot.getQuadPoints();
      const flat = quads[0] ?? [0, 0, 0, 0, 0, 0, 0, 0];
      const xs = [flat[0], flat[2], flat[4], flat[6]];
      const ys = [flat[1], flat[3], flat[5], flat[7]];
      const rect = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      return { kind: 'highlight', pageIndex, geometry: { kind: 'highlight', rect } };
    }
    case 'FreeText': {
      // A rotated textbox stashes its own bookkeeping keys (see addAnnotation
      // below) because getRect() returns the rotated AABB, not the original
      // local rect — reverse-solving the local rect from the AABB + angle is
      // singular at exactly 45/135/225/315 degrees, which is also this app's
      // default rotate-snap angle. An unrotated or pre-existing textbox has
      // neither key and falls back to getRect() directly, unchanged from
      // before this feature existed.
      const localRectRaw = annot.getObject().get('MepAppLocalRect');
      const rotationRaw = annot.getObject().get('MepAppRotationDegrees');
      const rotationDegrees = rotationRaw.isNumber() ? rotationRaw.asNumber() : 0;
      let rect: { x0: number; y0: number; x1: number; y1: number };
      if (localRectRaw.isArray() && localRectRaw.length === 4) {
        const [x0, y0, x1, y1] = localRectRaw.asJS() as number[];
        rect = { x0, y0, x1, y1 };
      } else {
        const [x0, y0, x1, y1] = annot.getRect();
        rect = { x0, y0, x1, y1 };
      }
      return {
        kind: 'textbox',
        pageIndex,
        geometry: { kind: 'textbox', rect, text: annot.getContents(), rotationDegrees },
      };
    }
    case 'Text': {
      const [x0, y0] = annot.getRect();
      return {
        kind: 'stickyNote',
        pageIndex,
        geometry: { kind: 'stickyNote', position: { x: x0, y: y0 }, text: annot.getContents() },
      };
    }
    case 'PolyLine': {
      const vertices = annot.getVertices();
      return {
        kind: 'polyline',
        pageIndex,
        geometry: { kind: 'polyline', points: vertices.map(([x, y]) => ({ x, y })) },
      };
    }
    case 'Stamp': {
      const [x0, y0, x1, y1] = annot.getRect();
      const rotationRaw = annot.getObject().get('MepAppRotationDegrees');
      const rotationDegrees = rotationRaw.isNumber() ? rotationRaw.asNumber() : 0;
      // pngBytes is not reconstructed from the appearance stream on read-back
      // (see the AnnotationGeometry doc comment in @mepapp/pdf-engine) —
      // geometry is all reconciliation needs.
      return {
        kind: 'stamp',
        pageIndex,
        geometry: { kind: 'stamp', position: { x: x0, y: y0 }, widthPt: x1 - x0, heightPt: y1 - y0, rotationDegrees, pngBytes: new Uint8Array(0) },
      };
    }
    default:
      return null; // foreign annotation type this adapter doesn't author — not one of ours to round-trip
  }
}

class MupdfDocumentHandle implements PdfDocumentHandle {
  constructor(private readonly doc: mupdf.PDFDocument) {}

  getPageCount(): number {
    return this.doc.countPages();
  }

  getPageInfo(pageIndex: number): PageInfo {
    const page = this.doc.loadPage(pageIndex);
    const [x0, y0, x1, y1] = readMediaBox(page);
    const rotationDegrees = readRotation(page);
    return {
      widthPt: x1 - x0,
      heightPt: y1 - y0,
      rotationDegrees,
    };
  }

  async renderPageToRaster(pageIndex: number, opts: RasterOptions): Promise<ImageBitmap> {
    const page = this.doc.loadPage(pageIndex);
    const info = this.getPageInfo(pageIndex);
    const zoom = opts.dpi / 72;
    // Documented mupdf.js usage is a plain DPI-scale matrix; MuPDF is expected
    // to bake the page's own /Rotate entry into the raster automatically, the
    // same way every mupdf-based viewer relies on it. This has not been
    // verified against a real rotated fixture PDF yet (none exists in
    // fixtures/pdfs) — the check below makes a wrong assumption loud instead
    // of silently producing a mis-rotated backdrop.
    const matrix: mupdf.Matrix = [zoom, 0, 0, zoom, 0, 0];
    // showExtras=false: this raster is only ever used as the static backdrop
    // behind the interactive PixiJS overlay (apps/web's loadPdfPage). Every
    // stamp/segment/fitting annotation is already drawn live on top of it
    // from the domain model, so baking annotations into the backdrop too
    // left a non-interactive duplicate of every one of them sitting exactly
    // where the real, movable sprite reappeared on the next open.
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, false);
    const expectedWidth =
      info.rotationDegrees === 90 || info.rotationDegrees === 270
        ? Math.round(info.heightPt * zoom)
        : Math.round(info.widthPt * zoom);
    const expectedHeight =
      info.rotationDegrees === 90 || info.rotationDegrees === 270
        ? Math.round(info.widthPt * zoom)
        : Math.round(info.heightPt * zoom);
    if (
      info.rotationDegrees !== 0 &&
      (Math.abs(pixmap.getWidth() - expectedWidth) > 1 || Math.abs(pixmap.getHeight() - expectedHeight) > 1)
    ) {
      console.warn(
        `[pdf-engine-mupdf] page ${pageIndex} has rotationDegrees=${info.rotationDegrees} but the ` +
          `rendered raster is ${pixmap.getWidth()}x${pixmap.getHeight()}px, expected about ` +
          `${expectedWidth}x${expectedHeight}px. MuPDF may not be auto-rotating this page the way this ` +
          `adapter assumed — verify the backdrop orientation visually against this fixture.`,
      );
    }
    const png = pixmap.asPNG();
    pixmap.destroy();
    return createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }));
  }

  async addAnnotation(spec: AnnotationSpec): Promise<string> {
    const page = this.doc.loadPage(spec.pageIndex);
    // A caller-supplied id (a domain object's own id) becomes the annotation's
    // /NM verbatim, so it round-trips as the correlation key on reopen — see
    // AnnotationSpec.id's doc comment in @mepapp/pdf-engine.
    const id = spec.id ?? `annot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const rgb = spec.style?.colorRGBA ? ([spec.style.colorRGBA[0], spec.style.colorRGBA[1], spec.style.colorRGBA[2]] as [number, number, number]) : undefined;
    const geometry = spec.geometry;

    let annot: mupdf.PDFAnnotation;
    // Set only by the rotated-textbox case below, which writes its own
    // custom appearance via setAppearance() directly — calling update()
    // afterward would let mupdf regenerate (and overwrite) it from Rect/DA,
    // the same auto-appearance path every other kind still relies on.
    let skipUpdate = false;
    switch (geometry.kind) {
      case 'freehand':
        annot = page.createAnnotation('Ink');
        annot.setInkList([geometry.points.map((p) => [p.x, p.y])]);
        break;
      case 'line':
      case 'arrow':
        annot = page.createAnnotation('Line');
        annot.setLine([geometry.from.x, geometry.from.y], [geometry.to.x, geometry.to.y]);
        annot.setLineEndingStyles('None', geometry.kind === 'arrow' ? 'ClosedArrow' : 'None');
        break;
      case 'rectangle':
        annot = page.createAnnotation('Square');
        annot.setRect([geometry.rect.x0, geometry.rect.y0, geometry.rect.x1, geometry.rect.y1]);
        break;
      case 'highlight':
        annot = page.createAnnotation('Highlight');
        annot.setQuadPoints([
          [geometry.rect.x0, geometry.rect.y0, geometry.rect.x1, geometry.rect.y0, geometry.rect.x0, geometry.rect.y1, geometry.rect.x1, geometry.rect.y1],
        ]);
        break;
      case 'circle':
        annot = page.createAnnotation('Circle');
        annot.setRect([
          geometry.center.x - geometry.radius,
          geometry.center.y - geometry.radius,
          geometry.center.x + geometry.radius,
          geometry.center.y + geometry.radius,
        ]);
        break;
      case 'textbox':
        annot = page.createAnnotation('FreeText');
        annot.setContents(geometry.text);
        if (geometry.rotationDegrees === 0) {
          annot.setRect([geometry.rect.x0, geometry.rect.y0, geometry.rect.x1, geometry.rect.y1]);
          annot.setDefaultAppearance('Helv', 12, rgb ?? [0, 0, 0]);
        } else {
          // No PDF annotation subtype (FreeText included) has a native
          // rotation field — verified against mupdf's own PDFAnnotation API,
          // which has no setRotate/getRotate. The only real mechanism is a
          // hand-authored appearance stream: draw the text in a local,
          // unrotated box (bbox), then bake the tilt into the appearance's
          // own transform matrix. Rect is set to the exact AABB of that
          // transformed bbox, so the PDF viewer's own fit-appearance-into-Rect
          // step (spec algorithm 8.1) is an identity — no extra distortion.
          const width = geometry.rect.x1 - geometry.rect.x0;
          const height = geometry.rect.y1 - geometry.rect.y0;
          const centerX = (geometry.rect.x0 + geometry.rect.x1) / 2;
          const centerY = (geometry.rect.y0 + geometry.rect.y1) / 2;
          const bbox: mupdf.Rect = [0, 0, width, height];
          const transform = mupdf.Matrix.concat(
            mupdf.Matrix.concat(mupdf.Matrix.translate(-width / 2, -height / 2), mupdf.Matrix.rotate(geometry.rotationDegrees)),
            mupdf.Matrix.translate(centerX, centerY),
          );
          const fontResources = this.doc.newDictionary();
          const fontDict = this.doc.newDictionary();
          fontDict.put('Helv', this.doc.addSimpleFont(new mupdf.Font('Helvetica'), 'Latin'));
          fontResources.put('Font', fontDict);
          const contents = freeTextAppearanceContents(geometry.text, height, 12, rgb ?? [0, 0, 0]);
          annot.setRect(mupdf.Rect.transform(bbox, transform));
          annot.setAppearance('N', null, transform, bbox, fontResources, contents);
          // Our own bookkeeping keys (ignored by other readers), the same
          // pattern the 'stamp' case below already uses — getRect() only
          // returns the rotated AABB, not the original local rect, and
          // reverse-solving one from the other is singular at exactly
          // 45/135/225/315 degrees. See annotationToSpec's FreeText case.
          annot.getObject().put('MepAppRotationDegrees', geometry.rotationDegrees);
          annot.getObject().put('MepAppLocalRect', [geometry.rect.x0, geometry.rect.y0, geometry.rect.x1, geometry.rect.y1]);
          skipUpdate = true;
        }
        break;
      case 'stickyNote':
        annot = page.createAnnotation('Text');
        annot.setRect([geometry.position.x, geometry.position.y, geometry.position.x, geometry.position.y]);
        annot.setContents(geometry.text);
        break;
      case 'polyline':
        annot = page.createAnnotation('PolyLine');
        annot.setVertices(geometry.points.map((p) => [p.x, p.y]));
        break;
      case 'stamp':
        annot = page.createAnnotation('Stamp');
        annot.setRect([
          geometry.position.x,
          geometry.position.y,
          geometry.position.x + geometry.widthPt,
          geometry.position.y + geometry.heightPt,
        ]);
        // pngBytes must already be oriented as it should appear on the page —
        // this adapter does not rotate pixels itself. rotationDegrees is
        // stashed as our own bookkeeping key (ignored by other readers, which
        // just see the already-oriented image) purely so reconcilePdfSync can
        // compare it against the domain model's rotation without having to
        // reverse-engineer it from pixel content.
        annot.setStampImage(new mupdf.Image(geometry.pngBytes));
        annot.getObject().put('MepAppRotationDegrees', geometry.rotationDegrees);
        break;
    }

    if (rgb && geometry.kind !== 'textbox' && geometry.kind !== 'stamp') annot.setColor(rgb);
    if (spec.style?.strokeWidthPt !== undefined) annot.setBorderWidth(spec.style.strokeWidthPt);
    annot.setName(id);
    if (!skipUpdate) annot.update();
    return id;
  }

  async listAnnotations(pageIndex: number): Promise<StoredAnnotation[]> {
    const page = this.doc.loadPage(pageIndex);
    const results: StoredAnnotation[] = [];
    for (const annot of page.getAnnotations()) {
      const id = annot.getName();
      if (!id) continue; // not one of ours — skip rather than fail on foreign annotations
      const spec = annotationToSpec(annot, pageIndex);
      if (spec) results.push({ ...spec, id });
    }
    return results;
  }

  async deleteAnnotation(annotationId: string): Promise<void> {
    for (let i = 0; i < this.doc.countPages(); i++) {
      const page = this.doc.loadPage(i);
      for (const annot of page.getAnnotations()) {
        if (annot.getName() === annotationId) {
          page.deleteAnnotation(annot);
          return;
        }
      }
    }
    throw new Error(`deleteAnnotation: no annotation found with id ${annotationId}`);
  }

  async setEmbeddedFile(name: string, bytes: Uint8Array): Promise<void> {
    try {
      this.doc.deleteEmbeddedFile(name);
    } catch {
      // No existing embedded file by this name — nothing to replace.
    }
    // addEmbeddedFile only creates the filespec/stream objects; the document's
    // /Names/EmbeddedFiles tree (what getEmbeddedFiles reads) is only updated
    // by insertEmbeddedFile — verified empirically, not documented clearly.
    const fileSpec = this.doc.addEmbeddedFile(name, 'application/json', bytes, new Date(), new Date(), false);
    this.doc.insertEmbeddedFile(name, fileSpec);
  }

  async getEmbeddedFile(name: string): Promise<Uint8Array | null> {
    const fileSpec = this.doc.getEmbeddedFiles()[name];
    if (!fileSpec) return null;
    const contents = this.doc.getEmbeddedFileContents(fileSpec);
    return contents ? contents.asUint8Array() : null;
  }

  async flattenOverlay(req: FlattenRequest): Promise<void> {
    if (req.overlaySnapshot.kind === 'vector') {
      throw new Error('flattenOverlay does not support vector (SVG) snapshots yet — only raster is implemented.');
    }
    const page = this.doc.loadPage(req.pageIndex);
    const { pngBytes, pageRect } = req.overlaySnapshot;
    const image = new mupdf.Image(pngBytes);
    const pageObj = page.getObject();

    let resources = pageObj.get('Resources');
    if (!resources.isDictionary()) {
      resources = this.doc.newDictionary();
      pageObj.put('Resources', resources);
    }
    let xobjects = resources.get('XObject');
    if (!xobjects.isDictionary()) {
      xobjects = this.doc.newDictionary();
      resources.put('XObject', xobjects);
    }
    const imageRef = this.doc.addImage(image);
    const resourceName = `MepAppOverlay${Date.now().toString(36)}`;
    xobjects.put(resourceName, imageRef);

    const width = pageRect.x1 - pageRect.x0;
    const height = pageRect.y1 - pageRect.y0;
    const contentStream = `q ${width} 0 0 ${height} ${pageRect.x0} ${pageRect.y0} cm /${resourceName} Do Q`;
    const extraContents = this.doc.addStream(contentStream, null);

    const existingContents = pageObj.get('Contents');
    if (existingContents.isNull()) {
      pageObj.put('Contents', extraContents);
    } else if (existingContents.isArray()) {
      existingContents.push(extraContents);
    } else {
      const newContents = this.doc.newArray();
      newContents.push(existingContents);
      newContents.push(extraContents);
      pageObj.put('Contents', newContents);
    }
  }

  async save(): Promise<Uint8Array> {
    return this.doc.saveToBuffer('incremental').asUint8Array();
  }
}

export class MupdfEngine implements PdfEngine {
  readonly name = 'mupdf';

  async openDocument(bytes: Uint8Array): Promise<PdfDocumentHandle> {
    const doc = new mupdf.PDFDocument(bytes);
    return new MupdfDocumentHandle(doc);
  }
}
