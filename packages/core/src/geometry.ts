// Pure 2D transform math shared by render (screen) and pdf-engine (flatten) consumers.
// No rendering, no I/O — see the package-level rule in index.ts.

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * An element's placement. Rotation is a single absolute scalar, normalized to
 * [0, 360), never a composed/incremental delta — the matrix in composeTransform
 * is rebuilt fresh from this scalar every time, which is what makes repeated
 * rotation drift-free (see rotateBy below and check 1 in the plan).
 */
export interface Transform2D {
  position: Vec2;
  rotationDegrees: number;
  scale: Vec2;
}

export interface Mat2x3 {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export function normalizeDegrees(degrees: number): number {
  const r = degrees % 360;
  return r < 0 ? r + 360 : r;
}

/** Advances rotation by a delta, replacing the stored scalar — never accumulates a matrix. */
export function rotateBy(transform: Transform2D, deltaDegrees: number): Transform2D {
  return {
    ...transform,
    rotationDegrees: normalizeDegrees(transform.rotationDegrees + deltaDegrees),
  };
}

/**
 * Builds the local-to-world matrix fresh from the transform's absolute scalar
 * angle. Order: scale, then rotate about the local origin, then translate.
 * Positive rotationDegrees is clockwise on screen (Y-down canvas space).
 */
export function composeTransform(transform: Transform2D): Mat2x3 {
  const radians = (transform.rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    a: cos * transform.scale.x,
    b: sin * transform.scale.x,
    c: -sin * transform.scale.y,
    d: cos * transform.scale.y,
    tx: transform.position.x,
    ty: transform.position.y,
  };
}

export function applyMatrix(m: Mat2x3, p: Vec2): Vec2 {
  return {
    x: m.a * p.x + m.c * p.y + m.tx,
    y: m.b * p.x + m.d * p.y + m.ty,
  };
}

/** Algebraic inverse of a 2x3 affine matrix. Throws if the matrix is singular. */
export function invertMatrix(m: Mat2x3): Mat2x3 {
  const det = m.a * m.d - m.b * m.c;
  if (det === 0) {
    throw new Error('invertMatrix: matrix is singular');
  }
  const a = m.d / det;
  const b = -m.b / det;
  const c = -m.c / det;
  const d = m.a / det;
  return {
    a,
    b,
    c,
    d,
    tx: (m.c * m.ty - m.d * m.tx) / det,
    ty: (m.b * m.tx - m.a * m.ty) / det,
  };
}

/**
 * Rotates a point about a pivot by deltaDegrees. Used for both hit-testing
 * (inverse-rotate the click point, then test against the unrotated rect) and
 * multi-rotate (orbit each element's position around the selection centroid).
 */
export function rotatePointAround(p: Vec2, pivot: Vec2, deltaDegrees: number): Vec2 {
  const radians = (deltaDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

/**
 * Hit test against an element's true rotated extents: un-rotate the query
 * point about the element's own center, then test against its axis-aligned
 * half-width/half-height. This matches the old app's click-selection
 * (ElementHitTestService.PointInRotatedRect) and is also used for rubber-band
 * selection in the new app, unlike the old app's center-point-only rectangle
 * selection.
 */
export function pointInRotatedRect(
  point: Vec2,
  transform: Transform2D,
  halfWidth: number,
  halfHeight: number,
): boolean {
  const local = rotatePointAround(point, transform.position, -transform.rotationDegrees);
  const dx = local.x - transform.position.x;
  const dy = local.y - transform.position.y;
  return Math.abs(dx) <= halfWidth && Math.abs(dy) <= halfHeight;
}

/**
 * Rubber-band selection test: does an axis-aligned drag rectangle intersect
 * an element's true rotated extents? Uses the separating-axis test over the
 * four candidate axes (the drag rect's two axes, plus the element's own two
 * rotated axes) — a deliberate improvement over the old app's rubber-band
 * selection, which only tested each element's center point against the drag
 * rectangle and ignored rotation and size entirely.
 */
export function rectIntersectsRotatedRect(
  rectMin: Vec2,
  rectMax: Vec2,
  transform: Transform2D,
  halfWidth: number,
  halfHeight: number,
): boolean {
  const localCorners: Vec2[] = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];
  const rotatedCorners = localCorners.map((local) => {
    const rotated = rotatePointAround(local, { x: 0, y: 0 }, transform.rotationDegrees);
    return { x: rotated.x + transform.position.x, y: rotated.y + transform.position.y };
  });
  const rectCorners: Vec2[] = [
    { x: rectMin.x, y: rectMin.y },
    { x: rectMax.x, y: rectMin.y },
    { x: rectMax.x, y: rectMax.y },
    { x: rectMin.x, y: rectMax.y },
  ];
  const radians = (transform.rotationDegrees * Math.PI) / 180;
  const axes: Vec2[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: Math.cos(radians), y: Math.sin(radians) },
    { x: -Math.sin(radians), y: Math.cos(radians) },
  ];
  for (const axis of axes) {
    const rectProjections = rectCorners.map((c) => c.x * axis.x + c.y * axis.y);
    const rotatedProjections = rotatedCorners.map((c) => c.x * axis.x + c.y * axis.y);
    const rectMinProj = Math.min(...rectProjections);
    const rectMaxProj = Math.max(...rectProjections);
    const rotatedMinProj = Math.min(...rotatedProjections);
    const rotatedMaxProj = Math.max(...rotatedProjections);
    if (rectMaxProj < rotatedMinProj || rotatedMaxProj < rectMinProj) {
      return false;
    }
  }
  return true;
}

export function centroid(points: Vec2[]): Vec2 {
  if (points.length === 0) {
    throw new Error('centroid requires at least one point');
  }
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * Rigid-body multi-rotate: every element orbits the selection centroid by
 * deltaDegrees, and every element's own rotation advances by the same delta.
 * This preserves each element's position relative to every other selected
 * element exactly (the group rotates together as one shape) — see check 4
 * and the MultiSelectOperations.RotateSelection reference semantics.
 */
export function multiRotate(elements: Transform2D[], deltaDegrees: number): Transform2D[] {
  if (elements.length === 0) {
    return [];
  }
  const pivot = centroid(elements.map((e) => e.position));
  return elements.map((e) => ({
    ...e,
    position: rotatePointAround(e.position, pivot, deltaDegrees),
    rotationDegrees: normalizeDegrees(e.rotationDegrees + deltaDegrees),
  }));
}

/**
 * A Symbol Creator port: a local fractional offset within the element's own
 * unrotated bounding box, with no intrinsic angle. Its world position is
 * computed by applying the element's live transform at query time — never a
 * stored absolute/world angle.
 */
export interface PortSpec {
  id: string;
  name: string;
  fractionX: number;
  fractionY: number;
}

export function getWorldPortPosition(
  port: PortSpec,
  transform: Transform2D,
  width: number,
  height: number,
): Vec2 {
  const local: Vec2 = {
    x: (port.fractionX - 0.5) * width,
    y: (port.fractionY - 0.5) * height,
  };
  return applyMatrix(composeTransform(transform), local);
}
