export interface PageInfo {
  widthPt: number;
  heightPt: number;
  rotationDegrees: 0 | 90 | 180 | 270; // page's own /Rotate entry
}

export interface RasterOptions {
  dpi: number; // backdrop render resolution, independent of on-screen zoom
}

export type AnnotationKind =
  | 'freehand' | 'line' | 'arrow' | 'rectangle' | 'circle'
  | 'textbox' | 'stickyNote' | 'highlight';

export interface AnnotationSpec {
  kind: AnnotationKind;
  pageIndex: number;
  // geometry in PDF page-space (points, origin bottom-left, per the PDF spec),
  // shape depends on `kind` — a polyline for freehand, two points for line/arrow,
  // a rect for rectangle/highlight, center+radius for circle, rect+text for textbox.
  geometry: unknown;
  style?: { colorRGBA?: [number, number, number, number]; strokeWidthPt?: number };
}

export interface FlattenRequest {
  pageIndex: number;
  // a pre-rendered raster or vector snapshot of the PixiJS overlay for this page,
  // already composed at the correct page-space position/rotation/scale —
  // the PdfEngine's job here is only to bake it into the page, not to know
  // anything about stamps, rotation, or the domain model.
  overlaySnapshot: { kind: 'raster'; pngBytes: Uint8Array; pageRect: DOMRectReadOnly }
                 | { kind: 'vector'; svg: string; pageRect: DOMRectReadOnly };
}

export interface PdfDocumentHandle {
  getPageCount(): number;
  getPageInfo(pageIndex: number): PageInfo;
  renderPageToRaster(pageIndex: number, opts: RasterOptions): Promise<ImageBitmap>;
  addAnnotation(spec: AnnotationSpec): Promise<string>; // returns an annotation id
  listAnnotations(pageIndex: number): Promise<AnnotationSpec[]>;
  deleteAnnotation(annotationId: string): Promise<void>;
  flattenOverlay(req: FlattenRequest): Promise<void>; // mutates the page in place
  save(): Promise<Uint8Array>;
}

export interface PdfEngine {
  readonly name: string; // 'mupdf' | 'pdfium' | 'pdfjs' — for diagnostics only
  openDocument(bytes: Uint8Array): Promise<PdfDocumentHandle>;
}
