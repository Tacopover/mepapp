// Read-only vector and text extraction for the MuPDF adapter. Runs the page
// through a mupdf.Device and records path edges as flat segments. Coordinates
// are in displayed page space (points, origin top-left, y down, /Rotate
// applied) — see the note above PATH_KIND in @mepapp/pdf-engine.

import * as mupdf from 'mupdf';
import { PATH_CLOSED_FLAG, PATH_KIND } from '@mepapp/pdf-engine';
import type { TextRun, VectorPageData, VectorPathOptions } from '@mepapp/pdf-engine';

const DEFAULT_FLATTEN_TOLERANCE_PT = 0.25;
const DEFAULT_LUM_MAX = 0.94;
const DEFAULT_ALPHA_MIN = 0.35;
const SEGMENT_STRIDE = 8;
const MAX_CURVE_DEPTH = 12;

type Rect = [number, number, number, number];

const INFINITE_RECT: Rect = [-1e9, -1e9, 1e9, 1e9];

// Recursive de Casteljau split; calls emit(endPoint) for each flat piece.
function flattenCurve(
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
  tolerance: number,
  emit: (x: number, y: number) => void,
  depth = 0,
): void {
  const dx = x3 - x0;
  const dy = y3 - y0;
  const len = Math.hypot(dx, dy) || 1e-9;
  const d1 = Math.abs((x1 - x0) * dy - (y1 - y0) * dx) / len;
  const d2 = Math.abs((x2 - x0) * dy - (y2 - y0) * dx) / len;
  if (depth > MAX_CURVE_DEPTH || Math.max(d1, d2) <= tolerance) {
    emit(x3, y3);
    return;
  }
  const abx = (x0 + x1) / 2, aby = (y0 + y1) / 2;
  const bcx = (x1 + x2) / 2, bcy = (y1 + y2) / 2;
  const cdx = (x2 + x3) / 2, cdy = (y2 + y3) / 2;
  const abcx = (abx + bcx) / 2, abcy = (aby + bcy) / 2;
  const bcdx = (bcx + cdx) / 2, bcdy = (bcy + cdy) / 2;
  const mx = (abcx + bcdx) / 2, my = (abcy + bcdy) / 2;
  flattenCurve(x0, y0, abx, aby, abcx, abcy, mx, my, tolerance, emit, depth + 1);
  flattenCurve(mx, my, bcdx, bcdy, cdx, cdy, x3, y3, tolerance, emit, depth + 1);
}

// Liang-Barsky. Returns the clipped end points [x0, y0, x1, y1], or null when the segment is fully outside.
function clipSegment(x0: number, y0: number, x1: number, y1: number, r: Rect): Rect | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - r[0], r[2] - x0, y0 - r[1], r[3] - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

// Colour components -> 0..1 RGB. Gray (1), RGB (3) and CMYK (4) are handled; anything else counts as black.
function colorToRgb(c: number[]): { r: number; g: number; b: number } {
  if (c.length === 1) return { r: c[0], g: c[0], b: c[0] };
  if (c.length >= 4) {
    const k = c[3];
    return { r: (1 - c[0]) * (1 - k), g: (1 - c[1]) * (1 - k), b: (1 - c[2]) * (1 - k) };
  }
  if (c.length === 3) return { r: c[0], g: c[1], b: c[2] };
  return { r: 0, g: 0, b: 0 };
}

export function extractVectorPaths(page: mupdf.Page, opts: VectorPathOptions = {}): VectorPageData {
  const tolerance = opts.flattenTolerancePt ?? DEFAULT_FLATTEN_TOLERANCE_PT;
  const lumMax = opts.lumMax ?? DEFAULT_LUM_MAX;
  const alphaMin = opts.alphaMin ?? DEFAULT_ALPHA_MIN;
  const maxSegments = opts.maxSegments ?? Infinity;

  // Growable output; doubles when full so a big page does not build a huge JS array of numbers.
  let out = new Float64Array(1 << 16);
  let segmentCount = 0;
  let truncated = false;
  let subpathCounter = 0;
  let hiddenDepth = 0; // > 0 inside a soft mask or tiling pattern
  const clips: Rect[] = [INFINITE_RECT];
  const zeroStroke = new mupdf.StrokeState({ lineCap: 'Butt', lineJoin: 'Miter', lineWidth: 0, miterLimit: 10 });
  const top = () => clips[clips.length - 1];
  const pushClip = (r: Rect) => {
    const t = top();
    clips.push([Math.max(t[0], r[0]), Math.max(t[1], r[1]), Math.min(t[2], r[2]), Math.min(t[3], r[3])]);
  };

  const emitSegment = (x0: number, y0: number, x1: number, y1: number, width: number, color: number, kind: number, id: number) => {
    if ((segmentCount + 1) * SEGMENT_STRIDE > out.length) {
      const grown = new Float64Array(out.length * 2);
      grown.set(out);
      out = grown;
    }
    const o = segmentCount * SEGMENT_STRIDE;
    out[o] = x0; out[o + 1] = y0; out[o + 2] = x1; out[o + 3] = y1;
    out[o + 4] = width; out[o + 5] = color; out[o + 6] = kind; out[o + 7] = id;
    segmentCount++;
    if (segmentCount >= maxSegments) truncated = true;
  };

  function addPath(path: mupdf.Path, ctm: mupdf.Matrix, width: number, color: number, isStroke: boolean): void {
    const clip = top();
    if (clip[2] <= clip[0] || clip[3] <= clip[1]) return;
    const kindLine = isStroke ? PATH_KIND.strokedLine : PATH_KIND.filledEdge;
    const kindCurve = isStroke ? PATH_KIND.strokedCurve : PATH_KIND.filledCurve;
    // Pending edges of the current subpath (x0, y0, x1, y1, kind). Written out
    // on subpath end, because the closed flag is only known at that point.
    const pending: number[] = [];
    let curX = 0, curY = 0, startX = 0, startY = 0, hasCur = false, id = -1;
    let lastKind: number = kindLine;
    const tx = (x: number, y: number): [number, number] => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
    const flush = (closed: boolean) => {
      for (let i = 0; i < pending.length; i += 5) {
        const c = clipSegment(pending[i], pending[i + 1], pending[i + 2], pending[i + 3], clip);
        if (!c) continue;
        if (c[0] === c[2] && c[1] === c[3]) continue;
        emitSegment(c[0], c[1], c[2], c[3], width, color, pending[i + 4] + (closed ? PATH_CLOSED_FLAG : 0), id);
        if (truncated) break;
      }
      pending.length = 0;
    };
    const push = (x0: number, y0: number, x1: number, y1: number, kind: number) => {
      if (x0 !== x1 || y0 !== y1) {
        pending.push(x0, y0, x1, y1, kind);
        lastKind = kind;
      }
    };
    path.walk({
      moveTo(x, y) {
        flush(false);
        id = subpathCounter++;
        [curX, curY] = tx(x, y);
        startX = curX; startY = curY; hasCur = true;
        lastKind = kindLine;
      },
      lineTo(x, y) {
        const [nx, ny] = tx(x, y);
        if (hasCur) push(curX, curY, nx, ny, kindLine);
        curX = nx; curY = ny;
      },
      curveTo(x1, y1, x2, y2, x3, y3) {
        const [bx, by] = tx(x1, y1);
        const [cx, cy] = tx(x2, y2);
        const [dx, dy] = tx(x3, y3);
        let lastX = curX, lastY = curY;
        flattenCurve(curX, curY, bx, by, cx, cy, dx, dy, tolerance, (px, py) => {
          push(lastX, lastY, px, py, kindCurve);
          lastX = px; lastY = py;
        });
        curX = dx; curY = dy;
      },
      closePath() {
        if (hasCur) {
          // The closing edge takes the curve kind when the subpath's last edge was a curve piece.
          push(curX, curY, startX, startY, lastKind > 1 ? kindCurve : kindLine);
          curX = startX; curY = startY;
        }
        flush(true);
      },
    });
    flush(false);
  }

  // Returns the 24-bit colour to record, or null when the paint is skipped.
  const paintColor = (color: number[], alpha: number): number | null => {
    if (alpha < alphaMin) return null;
    const rgb = colorToRgb(color);
    if ((rgb.r + rgb.g + rgb.b) / 3 > lumMax) return null;
    return (Math.round(rgb.r * 255) << 16) | (Math.round(rgb.g * 255) << 8) | Math.round(rgb.b * 255);
  };
  const scaleOf = (m: mupdf.Matrix) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const skip = () => truncated || hiddenDepth > 0;

  const device = new mupdf.Device({
    strokePath(path, stroke, ctm, cs, color, alpha) {
      try {
        if (skip()) return;
        const dashes = stroke.getDashes();
        if (dashes && dashes.length) return;
        const rgb = paintColor(color, alpha);
        if (rgb === null) return;
        addPath(path, ctm, stroke.getLineWidth() * scaleOf(ctm), rgb, true);
      } finally {
        path.destroy(); stroke.destroy(); cs.destroy();
      }
    },
    fillPath(path, _evenOdd, ctm, cs, color, alpha) {
      try {
        if (skip()) return;
        const rgb = paintColor(color, alpha);
        if (rgb === null) return;
        addPath(path, ctm, 0, rgb, false);
      } finally {
        path.destroy(); cs.destroy();
      }
    },
    clipPath(path, _evenOdd, ctm) {
      try {
        pushClip(path.getBounds(zeroStroke, ctm));
      } finally {
        path.destroy();
      }
    },
    clipStrokePath(path, stroke, ctm) {
      try {
        pushClip(path.getBounds(stroke, ctm));
      } finally {
        path.destroy(); stroke.destroy();
      }
    },
    // Text and image-mask clips are not tracked: they count as "no clip", but
    // are still pushed so each popClip pairs with a push.
    clipText(text) { pushClip(INFINITE_RECT); text.destroy(); },
    clipStrokeText(text, stroke) { pushClip(INFINITE_RECT); text.destroy(); stroke.destroy(); },
    clipImageMask(image) { pushClip(INFINITE_RECT); image.destroy(); },
    popClip() { if (clips.length > 1) clips.pop(); },
    beginMask() { hiddenDepth++; },
    endMask() { hiddenDepth--; },
    beginTile() { hiddenDepth++; return 0; },
    endTile() { hiddenDepth--; },
  });
  try {
    // Identity matrix: MuPDF applies the page's /Rotate and the y flip itself,
    // so device coordinates are already displayed page space.
    page.run(device, mupdf.Matrix.identity);
    device.close();
  } finally {
    device.destroy();
    zeroStroke.destroy();
  }
  return { segments: out.slice(0, segmentCount * SEGMENT_STRIDE), segmentCount, truncated };
}

export function extractTextRuns(page: mupdf.Page): TextRun[] {
  const stext = page.toStructuredText('preserve-whitespace');
  const runs: TextRun[] = [];
  let text = '';
  let size = 0;
  let bbox: mupdf.Rect = [0, 0, 0, 0];
  try {
    // walk() gives unrounded line boxes; asJSON() rounds them to whole points.
    stext.walk({
      beginLine(lineBox) {
        text = '';
        size = 0;
        bbox = lineBox;
      },
      onChar(c, _origin, _font, charSize) {
        text += c;
        if (charSize > size) size = charSize;
      },
      endLine() {
        runs.push({ text, x: bbox[0], y: bbox[1], width: bbox[2] - bbox[0], height: bbox[3] - bbox[1], fontSizePt: size });
      },
    });
  } finally {
    stext.destroy();
  }
  return runs;
}
