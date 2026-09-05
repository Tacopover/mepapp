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

  async addAnnotation(_spec: AnnotationSpec): Promise<string> {
    throw new Error('addAnnotation is not implemented yet — out of scope until Step 4 (annotation round trip).');
  }

  async listAnnotations(_pageIndex: number): Promise<AnnotationSpec[]> {
    throw new Error('listAnnotations is not implemented yet — out of scope until Step 4 (annotation round trip).');
  }

  async deleteAnnotation(_annotationId: string): Promise<void> {
    throw new Error('deleteAnnotation is not implemented yet — out of scope until Step 4 (annotation round trip).');
  }

  async flattenOverlay(_req: FlattenRequest): Promise<void> {
    throw new Error('flattenOverlay is not implemented yet — out of scope until Step 4 (annotation round trip).');
  }

  async save(): Promise<Uint8Array> {
    throw new Error('save is not implemented yet — out of scope until Step 4 (annotation round trip).');
  }
}

export class MupdfEngine implements PdfEngine {
  readonly name = 'mupdf';

  async openDocument(bytes: Uint8Array): Promise<PdfDocumentHandle> {
    const doc = new mupdf.PDFDocument(bytes);
    return new MupdfDocumentHandle(doc);
  }
}
