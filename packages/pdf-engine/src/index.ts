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
  | 'textbox' | 'stickyNote' | 'highlight' | 'stamp';

export interface PageRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Geometry is always in PDF page-space (points, origin bottom-left, per the
// PDF spec). Each variant's `kind` matches the AnnotationSpec.kind that uses it.
// `stamp` is a placed image (e.g. an equipment symbol): pngBytes is required
// when creating one (addAnnotation draws it into a custom appearance stream),
// but listAnnotations returns it as an empty placeholder — the appearance
// stream's image isn't reconstructed on read-back, only geometry is, which is
// all reconciliation (see reconcilePdfSync in @mepapp/core) needs.
export type AnnotationGeometry =
  | { kind: 'freehand'; points: Array<{ x: number; y: number }> }
  | { kind: 'line' | 'arrow'; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: 'rectangle' | 'highlight'; rect: PageRect }
  | { kind: 'circle'; center: { x: number; y: number }; radius: number }
  | { kind: 'textbox'; rect: PageRect; text: string }
  | { kind: 'stickyNote'; position: { x: number; y: number }; text: string }
  | { kind: 'stamp'; position: { x: number; y: number }; widthPt: number; heightPt: number; rotationDegrees: number; pngBytes: Uint8Array };

export interface AnnotationSpec {
  kind: AnnotationKind;
  pageIndex: number;
  geometry: AnnotationGeometry;
  style?: { colorRGBA?: [number, number, number, number]; strokeWidthPt?: number };
  // When supplied, becomes the annotation's own PDF-native unique name (the
  // spec's /NM field) instead of an engine-generated one. This is how a
  // domain object's own id (Segment.id/Fitting.id/PlacedStamp.id) becomes the
  // correlation key between @mepapp/core's project document and the PDF's
  // annotation objects — no separate id-mapping table needed. Caller is
  // responsible for uniqueness; addAnnotation does not check for collisions.
  id?: string;
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
  // Embeds (or replaces) a named file attachment at the document level — used
  // to carry @mepapp/core's project JSON inside the PDF itself, so a single
  // .pdf is the whole project (no sidecar file to lose or mismatch).
  setEmbeddedFile(name: string, bytes: Uint8Array): Promise<void>;
  // Returns the named embedded file's bytes, or null if the document doesn't
  // carry one by that name (e.g. a PDF that was never saved from MepApp).
  getEmbeddedFile(name: string): Promise<Uint8Array | null>;
  save(): Promise<Uint8Array>;
}

export interface PdfEngine {
  readonly name: string; // 'mupdf' | 'pdfium' | 'pdfjs' — for diagnostics only
  openDocument(bytes: Uint8Array): Promise<PdfDocumentHandle>;
}
