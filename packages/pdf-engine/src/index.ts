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
  | 'textbox' | 'stickyNote' | 'highlight' | 'polyline' | 'stamp';

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
  | { kind: 'textbox'; rect: PageRect; text: string; rotationDegrees: number }
  | { kind: 'stickyNote'; position: { x: number; y: number }; text: string }
  | { kind: 'polyline'; points: Array<{ x: number; y: number }> }
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

// Vector/text extraction (read-only), used by room detection. These types use
// DISPLAYED page space: points, origin at the TOP-LEFT of the upright page,
// y pointing DOWN, with the page's own /Rotate already applied. This is the
// "display space" of packages/core/src/calibration.ts, so results feed the
// calibration math directly. It differs from the annotation geometry above
// (PDF content space, origin bottom-left, y up, /Rotate not applied).

// Values of a vector segment's `kind` field. Bit value 4 (PATH_CLOSED_FLAG) is
// added to the kind when the segment belongs to a closed subpath.
export const PATH_KIND = {
  strokedLine: 0, // straight segment of a stroked path
  filledEdge: 1, // edge of a filled polygon
  strokedCurve: 2, // flattened piece of a stroked curve
  filledCurve: 3, // flattened piece of a filled curve
} as const;

export const PATH_CLOSED_FLAG = 4;

export interface VectorPathOptions {
  flattenTolerancePt?: number; // max distance between a curve and its line pieces; default 0.25
  lumMax?: number; // skip paint lighter than this luminance (0 black..1 white); default 0.94
  alphaMin?: number; // skip paint with less opacity than this; default 0.35
  maxSegments?: number; // safety cap: when reached, extraction stops and `truncated` is true
}

// Flat segment list. Segment i occupies 8 numbers at segments[8*i ..]:
//   0 x0, 1 y0, 2 x1, 3 y1        end points, displayed page space
//   4 strokeWidthPt               0 for fills
//   5 colorRgb                    24-bit integer, 0xRRGGBB
//   6 kind                        a PATH_KIND value, plus PATH_CLOSED_FLAG (4) if the subpath is closed
//   7 subpathId                   segments of one subpath share an id; ids are unique per page
// Segments are already clipped to the active clip rectangle. Skipped content:
// dashed strokes, paint lighter than lumMax or below alphaMin, and anything
// drawn inside soft masks or tiling patterns.
export interface VectorPageData {
  segments: Float64Array; // length is 8 * segmentCount
  segmentCount: number;
  truncated: boolean; // true when maxSegments stopped the extraction early
}

// One line of text. x,y is the top-left corner of the line's bounding box, in
// displayed page space. Pages that draw text as outlines return no runs.
export interface TextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSizePt: number;
}

// An optional-content group (a PDF "layer"). `visible` is the state in the
// document's default configuration.
export interface LayerInfo {
  name: string;
  visible: boolean;
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
  // Read-only vector/text extraction; coordinates are in displayed page space
  // (see the note above PATH_KIND).
  getVectorPaths(pageIndex: number, opts?: VectorPathOptions): Promise<VectorPageData>;
  getTextRuns(pageIndex: number): Promise<TextRun[]>;
  // Document-wide list (layers are not per page in PDF).
  listLayers(): Promise<LayerInfo[]>;
  // Frees the engine's memory for this document. Every later call on the handle throws.
  close(): void;
}

export interface PdfEngine {
  readonly name: string; // 'mupdf' | 'pdfium' | 'pdfjs' — for diagnostics only
  openDocument(bytes: Uint8Array): Promise<PdfDocumentHandle>;
}
