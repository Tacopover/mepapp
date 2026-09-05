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
      const [x0, y0, x1, y1] = annot.getRect();
      return {
        kind: 'textbox',
        pageIndex,
        geometry: { kind: 'textbox', rect: { x0, y0, x1, y1 }, text: annot.getContents() },
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
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
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
    const id = `annot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const rgb = spec.style?.colorRGBA ? ([spec.style.colorRGBA[0], spec.style.colorRGBA[1], spec.style.colorRGBA[2]] as [number, number, number]) : undefined;
    const geometry = spec.geometry;

    let annot: mupdf.PDFAnnotation;
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
        annot.setRect([geometry.rect.x0, geometry.rect.y0, geometry.rect.x1, geometry.rect.y1]);
        annot.setContents(geometry.text);
        annot.setDefaultAppearance('Helv', 12, rgb ?? [0, 0, 0]);
        break;
      case 'stickyNote':
        annot = page.createAnnotation('Text');
        annot.setRect([geometry.position.x, geometry.position.y, geometry.position.x, geometry.position.y]);
        annot.setContents(geometry.text);
        break;
    }

    if (rgb && geometry.kind !== 'textbox') annot.setColor(rgb);
    if (spec.style?.strokeWidthPt !== undefined) annot.setBorderWidth(spec.style.strokeWidthPt);
    annot.setName(id);
    annot.update();
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
