// Mask to polygon: boundary tracing, Douglas-Peucker simplification, shoelace area.
// Ring coordinates are flat arrays [x0, y0, x1, y1, ...].

export type Ring = number[];

// Signed area of a flat ring by the shoelace formula. In a y-down space, a
// clockwise ring on screen has a positive area.
export function signedRingArea(ring: readonly number[]): number {
  const n = ring.length >> 1;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += ring[2 * i]! * ring[2 * j + 1]! - ring[2 * j]! * ring[2 * i + 1]!;
  }
  return s / 2;
}

const DX = [1, 0, -1, 0]; // 0 right, 1 down, 2 left, 3 up (y down)
const DY = [0, 1, 0, -1];

/**
 * Traces the boundaries of the set pixels of a mask. Vertices are pixel
 * corners: corner (x, y) is the top-left corner of pixel (x, y). Only the
 * turning vertices are returned. Outer boundaries run clockwise on screen
 * (positive signed area) and hole boundaries run counter-clockwise (negative).
 * Pixels that touch only at a corner count as separate (4-connectivity).
 */
export function traceMaskBoundaries(mask: Uint8Array, w: number, h: number): Ring[] {
  let bx0 = w;
  let by0 = h;
  let bx1 = -1;
  let by1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!mask[row + x]) continue;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    }
  }
  if (bx1 < 0) return [];
  const gw = bx1 - bx0 + 2; // vertex grid size
  const gh = by1 - by0 + 2;
  const edges = new Uint8Array(gw * gh); // bit d set: an edge leaves the vertex in direction d
  const set = (x: number, y: number): boolean => x >= bx0 && x <= bx1 && y >= by0 && y <= by1 && mask[y * w + x] === 1;
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      if (!mask[y * w + x]) continue;
      const vx = x - bx0;
      const vy = y - by0;
      if (!set(x, y - 1)) edges[vy * gw + vx]! |= 1; // top edge, going right
      if (!set(x + 1, y)) edges[vy * gw + vx + 1]! |= 2; // right edge, going down
      if (!set(x, y + 1)) edges[(vy + 1) * gw + vx + 1]! |= 4; // bottom edge, going left
      if (!set(x - 1, y)) edges[(vy + 1) * gw + vx]! |= 8; // left edge, going up
    }
  }
  const rings: Ring[] = [];
  for (let v = 0; v < edges.length; v++) {
    while (edges[v]) {
      let d0 = 0;
      while (!(edges[v]! & (1 << d0))) d0++;
      const ring: Ring = [];
      let cur = v;
      let d = d0;
      for (;;) {
        if (cur !== v || d !== d0) edges[cur]! &= ~(1 << d); // the start edge stays set until the ring closes
        const cx = (cur % gw) + DX[d]!;
        const cy = ((cur / gw) | 0) + DY[d]!;
        cur = cy * gw + cx;
        // Turn preference: right, straight, left. Right turns keep diagonal pixels apart.
        let nd = -1;
        for (const t of [1, 0, 3]) {
          const cand = (d + t) % 4;
          if (edges[cur]! & (1 << cand)) {
            nd = cand;
            break;
          }
        }
        if (nd !== d) ring.push(cx + bx0, cy + by0);
        if (cur === v && nd === d0) break;
        d = nd;
      }
      edges[v]! &= ~(1 << d0);
      if (ring.length >= 6) rings.push(ring);
    }
  }
  return rings;
}

// Distance from point p to the segment a-b.
function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Douglas-Peucker on an open chain of points (flat), keeping both end points.
function simplifyChain(pts: readonly number[], tol: number): number[] {
  const n = pts.length >> 1;
  if (n <= 2) return [...pts];
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let fd = tol;
    for (let i = a + 1; i < b; i++) {
      const d = pointSegDist(pts[2 * i]!, pts[2 * i + 1]!, pts[2 * a]!, pts[2 * a + 1]!, pts[2 * b]!, pts[2 * b + 1]!);
      if (d > fd) {
        fd = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i]!, pts[2 * i + 1]!);
  return out;
}

// Douglas-Peucker on a closed ring. The ring is split at the vertex farthest from vertex 0.
export function simplifyRing(ring: readonly number[], tol: number): Ring {
  const n = ring.length >> 1;
  if (n <= 3 || tol <= 0) return [...ring];
  let far = 0;
  let fd = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(ring[2 * i]! - ring[0]!, ring[2 * i + 1]! - ring[1]!);
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const first = simplifyChain(ring.slice(0, 2 * far + 2), tol);
  const second = simplifyChain([...ring.slice(2 * far), ring[0]!, ring[1]!], tol);
  // first ends at vertex `far`, second starts there and ends at vertex 0: drop the duplicated end points.
  const out = [...first.slice(0, first.length - 2), ...second.slice(0, second.length - 2)];
  return out.length >= 6 ? out : [...ring];
}

// Even-odd point in ring test.
export function pointInRing(x: number, y: number, ring: readonly number[]): boolean {
  const n = ring.length >> 1;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[2 * i]!;
    const yi = ring[2 * i + 1]!;
    const xj = ring[2 * j]!;
    const yj = ring[2 * j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
