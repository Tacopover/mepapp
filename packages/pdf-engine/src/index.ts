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

export interface PageRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Geometry is always in PDF page-space (points, origin bottom-left, per the
// PDF spec). Each variant's `kind` matches the AnnotationSpec.kind that uses it.
export type AnnotationGeometry =
  | { kind: 'freehand'; points: Array<{ x: number; y: number }> }
  | { kind: 'line' | 'arrow'; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: 'rectangle' | 'highlight'; rect: PageRect }
  | { kind: 'circle'; center: { x: number; y: number }; radius: number }
  | { kind: 'textbox'; rect: PageRect; text: string }
  | { kind: 'stickyNote'; position: { x: number; y: number }; text: string };

export interface AnnotationSpec {
  kind: AnnotationKind;
  pageIndex: number;
  geometry: AnnotationGeometry;
  style?: { colorRGBA?: [number, number, number, number]; strokeWidthPt?: number };
}

// What listAnnotations returns: a spec plus the id addAnnotation assigned it,
// so a caller can round-trip straight into deleteAnnotation(id).
export interface StoredAnnotation extends AnnotationSpec {
  id: string;
}

export interface FlattenRequest {
  pageIndex: number;
  // a pre-rendered raster or vector snapshot of the PixiJS overlay for this page,
  // already composed at the correct page-space position/rotation/scale —
  // the PdfEngine's job here is only to bake it into the page, not to know
  // anything about stamps, rotation, or the domain model.
  overlaySnapshot: { kind: 'raster'; pngBytes: Uint8Array; pageRect: PageRect }
                 | { kind: 'vector'; svg: string; pageRect: PageRect };
}

export interface PdfDocumentHandle {
  getPageCount(): number;
  getPageInfo(pageIndex: number): PageInfo;
  renderPageToRaster(pageIndex: number, opts: RasterOptions): Promise<ImageBitmap>;
  addAnnotation(spec: AnnotationSpec): Promise<string>; // returns an annotation id
  listAnnotations(pageIndex: number): Promise<StoredAnnotation[]>;
  deleteAnnotation(annotationId: string): Promise<void>;
  flattenOverlay(req: FlattenRequest): Promise<void>; // mutates the page in place
  save(): Promise<Uint8Array>;
}

export interface PdfEngine {
  readonly name: string; // 'mupdf' | 'pdfium' | 'pdfjs' — for diagnostics only
  openDocument(bytes: Uint8Array): Promise<PdfDocumentHandle>;
}
