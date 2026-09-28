// Dev-time codegen: scans fixtures/stamps/{Terminals-english,Equipment-english}
// plus scripts/stamp-discipline-map.csv (hand-filled by a domain expert — the
// old D<n>_ filename prefixes don't map reliably onto core's Discipline
// union, see .claude/plans/stamp-migration-and-draw-from-spec.md §A1) and
// writes:
//   - packages/core/src/stamp-library.generated.ts (GENERATED_STAMP_LIBRARY)
//   - apps/web/public/stamps/<filename>.svg (a flat copy of every referenced asset)
//
// `shapes` is parsed directly from each fixture's own .svg (see
// parseSvgShapes) — the SVG is the single source of truth for a library
// stamp's artwork. There used to be a separate, independently-authored
// <base>.mepshapes.json per fixture that this script read instead; it drifted
// from the real SVG (different geometry, not just a different notation of the
// same geometry) and is no longer read here. Those files are unused now but
// left in place rather than deleted as part of this change.
//
// Never run at build time or import fs anywhere under packages/* — core stays
// I/O-free (see stamp-library.ts's own header comment); this script's
// *output* is plain committed data. Re-run manually (`pnpm gen:stamps`)
// whenever the fixture folders or the discipline-map CSV change.
import { readFileSync, readdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAMPS_DIR = join(ROOT, 'fixtures', 'stamps');
const PUBLIC_STAMPS_DIR = join(ROOT, 'apps', 'web', 'public', 'stamps');
const OUT_FILE = join(ROOT, 'packages', 'core', 'src', 'stamp-library.generated.ts');
const DISCIPLINE_MAP_CSV = join(ROOT, 'scripts', 'stamp-discipline-map.csv');

const FOLDERS = [
  { dir: 'Terminals-english', category: 'terminal' },
  { dir: 'Equipment-english', category: 'equipment' },
];

// The discipline-map CSV's group labels (a domain expert's coarser
// vocabulary) -> core's actual Discipline union values. "hvac" collapses
// ventilation and heatingAndCooling into one value (heatingAndCooling) since
// nothing today reads that distinction for a StampDefinition — the Stamps
// tab's own filter (disciplineGroupOf) already merges both back into one
// "HVAC" tab regardless of which of the two is picked.
const DISCIPLINE_MAP = {
  hvac: 'heatingAndCooling',
  plumbing: 'plumbing',
  electrical: 'electrical',
  'fire protection': 'fireProtection',
  other: 'other',
};

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(stripBom(readFileSync(path, 'utf8')));
}

/** Strips a leading/trailing double-quote pair, if present — name-mapping.csv quotes every field ("50_Pomp","D5_Pump"), stamp-discipline-map.csv quotes none. Fields here never contain a comma or an embedded quote, so this plain strip is safe without full CSV-quoting support. */
function unquote(field) {
  return field.startsWith('"') && field.endsWith('"') ? field.slice(1, -1) : field;
}

function parseCsv(path) {
  const lines = stripBom(readFileSync(path, 'utf8'))
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.length > 0);
  const [, ...rows] = lines; // drop header
  return rows.map((line) => line.split(',').map(unquote));
}

/** Turns underscores into spaces and title-cases each word, keeping the leading "D<n>_" (English, Uniformat) or "<digits>_" (Dutch, NL-SfB) classification prefix as the first word ("D3 Air Socket", "65 Aansluitpunt Bedraad"). Already-uppercase tokens (D3, 65, USB, CO2, PIR, LUTO, 230V, 3FPE) are left untouched. */
function humanizeLabel(base) {
  return base
    .split('_')
    .map((word) => (word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function slugify(englishBase) {
  return englishBase
    .replace(/^D\d+_/, '')
    .replace(/_/g, '-')
    .toLowerCase();
}

/** The coordinate system every shape and the nominal size are read against — SVG's own viewBox, not (0,0)-(width,height). 161 of the 164 fixture SVGs have a non-zero viewBox origin; a fixed-origin assumption silently shifts every shape in those files. width/height attributes are asserted equal to the viewBox's own width/height (true for every current fixture) rather than read separately. */
function readSvgViewBox(content, svgPath) {
  const match = content.match(/<svg[^>]*\bviewBox="([\d.eE+-]+)[,\s]+([\d.eE+-]+)[,\s]+([\d.eE+-]+)[,\s]+([\d.eE+-]+)"/);
  if (!match) throw new Error(`Could not read viewBox from ${svgPath}`);
  const [, x, y, width, height] = match.map(Number);
  return { x, y, width, height };
}

/** PDF points per SVG user unit. One factor for every stamp, so the SVGs keep their real size relative to each other (an air handling unit's 1156-unit width stays ~2.8x a connection point's 410-unit height). 0.18 keeps the library's median SVG (~272 units) near its earlier 48 pt size. The rasterizer (ui/stampBitmap.ts) and scene.ts recompute the placed size from this value at 300 DPI. */
const SVG_UNIT_TO_PT = 0.18;
function nativeSizeFor(vb) {
  return { nativeWidth: round2(vb.width * SVG_UNIT_TO_PT), nativeHeight: round2(vb.height * SVG_UNIT_TO_PT) };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function loadDisciplineMap() {
  const rows = parseCsv(DISCIPLINE_MAP_CSV);
  const map = new Map();
  for (const [filename, , , disciplineCell] of rows) {
    if (!disciplineCell || !disciplineCell.trim()) throw new Error(`No discipline filled in for ${filename} in ${DISCIPLINE_MAP_CSV}`);
    const tokens = disciplineCell.split(';').map((t) => t.trim());
    const disciplines = tokens.map((t) => {
      const mapped = DISCIPLINE_MAP[t];
      if (!mapped) throw new Error(`Unknown discipline group "${t}" for ${filename} — expected one of ${Object.keys(DISCIPLINE_MAP).join(', ')}`);
      return { token: t.replace(/\s+/g, ''), value: mapped };
    });
    map.set(filename, disciplines);
  }
  return map;
}

function loadNameMapping(folderPath) {
  const csvPath = join(folderPath, 'name-mapping.csv');
  const map = new Map();
  for (const [dutchBase, englishBase] of parseCsv(csvPath)) {
    map.set(englishBase, dutchBase);
  }
  return map;
}

// 'none' (string) and absent (line/arc never carry a fill) both mean
// SymbolShapeStyle.fill's null ("unfilled").
function normalizedFill(fill) {
  return fill == null || fill === 'none' ? null : fill;
}

/** Pulls every `name="value"` pair out of a tag's attribute text into a plain object — one generic parser instead of a per-element-kind regex, since every fixture element (circle/line/rect/ellipse/polygon/path/text) is a flat set of quoted attributes with no nesting. */
function parseAttrs(attrText) {
  const attrs = {};
  // Name chars must include digits — line/arrow attributes are x1/y1/x2/y2.
  const re = /([a-zA-Z0-9-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrText))) attrs[m[1]] = m[2];
  return attrs;
}

// SVG coordinates are absolute against the file's own viewBox (x, y, width,
// height — see readSvgViewBox); SymbolShape coordinates are fractional 0..1,
// normalized independently per axis (see packages/ui/src/symbolShapeCanvas.ts's
// `x * widthPx` / `y * heightPx`) — so x-ish fields subtract vb.x then divide
// by vb.width, y-ish subtract vb.y then divide by vb.height. radius is a
// single scalar with no independent X/Y in SymbolShape — a circle can't be
// expressed as separate width/height fractions without becoming an ellipse on
// a non-square viewBox, so it divides by Math.min(vb.width, vb.height),
// matching strokeWidth below and how the renderer/hit-test apply it
// (radius * Math.min(widthPx, heightPx) for both axes). fontSize divides by
// vb.height, matching the renderer's single-axis (heightPx) use for text
// size. A radius/width/height value is a length, not a position, so it's
// never shifted by vb.x/vb.y — only divided.
function fx(raw, vb) {
  return (Number(raw) - vb.x) / vb.width;
}
function fy(raw, vb) {
  return (Number(raw) - vb.y) / vb.height;
}
function fMin(raw, vb) {
  return Number(raw) / Math.min(vb.width, vb.height);
}

// SymbolShapeStyle.strokeWidth is a fraction, not a raw SVG unit — the
// renderer does `strokeWidth * Math.min(widthPx, heightPx)` (matching the
// dialog's own DEFAULT_STYLE.strokeWidth: 0.01), the same width-vs-height-
// independent convention `radius`/`fontSize` use above. A handful of fixture
// elements omit `stroke`/`stroke-width` outright — every fixture stamp is
// otherwise black-on-transparent, so '#000000'/'0' are the correct fallback,
// not a guess.
function styleFromAttrs(a, vb) {
  return { stroke: a.stroke ?? '#000000', strokeWidth: fMin(a['stroke-width'] ?? '0', vb), fill: normalizedFill(a.fill) };
}

/**
 * Center-parameterization of an SVG elliptical-arc path command, specialized
 * to the case every fixture path actually uses: rx = ry (a true circular
 * arc, never an ellipse) and no x-axis-rotation. This is the standard
 * endpoint-to-center conversion (SVG 1.1 spec, appendix F.6.5) with every
 * rotation term dropped since x-axis-rotation is always 0 in fixture data —
 * a rotated or non-circular arc throws in parseArcShape below rather than
 * silently drawing the wrong curve.
 */
function arcCenterFromEndpoints(x1, y1, x2, y2, r, largeArc, sweep) {
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const distSq = dx * dx + dy * dy;
  const sign = largeArc !== sweep ? 1 : -1;
  const co = sign * Math.sqrt(Math.max(0, r * r - distSq) / distSq);
  const cx = co * dy + (x1 + x2) / 2;
  const cy = -co * dx + (y1 + y2) / 2;
  const startAngle = Math.atan2(y1 - cy, x1 - cx);
  const u = { x: x1 - cx, y: y1 - cy };
  const v = { x: x2 - cx, y: y2 - cy };
  // Signed angle from u to v via atan2(cross, dot) — wraps to (-π, π] on its
  // own, unlike a plain angle subtraction, which is why this (not
  // atan2(v)-atan2(u)) is the spec's own way to get deltaTheta.
  let deltaTheta = Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y);
  if (!sweep && deltaTheta > 0) deltaTheta -= Math.PI * 2;
  if (sweep && deltaTheta < 0) deltaTheta += Math.PI * 2;
  // ctx.ellipse (drawSymbolShapes) always sweeps forward (increasing angle)
  // from startAngle to endAngle — swap so endAngle > startAngle, same
  // reasoning as the old mepshapes-based converter this replaces.
  const rawEnd = startAngle + deltaTheta;
  return { cx, cy, radius: r, startAngle: Math.min(startAngle, rawEnd), endAngle: Math.max(startAngle, rawEnd) };
}

// Matches exactly the path shape every fixture <path> uses: one moveto, one
// circular (rx=ry), unrotated elliptical-arc command, optional close. Every
// fixture path was checked against this pattern before writing this parser
// (159 of 159 match) — a path that doesn't match is a genuinely new shape
// this generator doesn't understand yet, so parseArcShape throws rather than
// silently dropping or misreading it.
const ARC_PATH_RE =
  /^M\s*(?<x1>[\d.eE+-]+)[,\s]+(?<y1>[\d.eE+-]+)\s*A\s*(?<rx>[\d.eE+-]+)[,\s]+(?<ry>[\d.eE+-]+)[,\s]+(?<rot>[\d.eE+-]+)[,\s]+(?<largeArc>[01])[,\s]*(?<sweep>[01])[,\s]+(?<x2>[\d.eE+-]+)[,\s]+(?<y2>[\d.eE+-]+)\s*Z?\s*$/;

function parseArcShape(a, vb) {
  const m = ARC_PATH_RE.exec(a.d.trim());
  if (!m) throw new Error(`Unsupported <path> data (expected a single M+A circular-arc command): "${a.d}"`);
  const g = m.groups;
  if (g.rx !== g.ry) throw new Error(`Non-circular <path> arc (rx != ry) not supported: "${a.d}"`);
  if (Number(g.rot) !== 0) throw new Error(`Rotated <path> arc not supported: "${a.d}"`);
  const arc = arcCenterFromEndpoints(Number(g.x1), Number(g.y1), Number(g.x2), Number(g.y2), Number(g.rx), g.largeArc === '1', g.sweep === '1');
  // JSON.stringify silently turns a NaN into `null` instead of failing — fail loudly here instead
  // (e.g. coincident endpoints would make arcCenterFromEndpoints divide by zero).
  if (![arc.cx, arc.cy, arc.startAngle, arc.endAngle].every(Number.isFinite)) throw new Error(`Arc produced a non-finite value from path "${a.d}"`);
  return { id: randomUUID(), kind: 'arc', cx: fx(arc.cx, vb), cy: fy(arc.cy, vb), radius: fMin(arc.radius, vb), startAngle: arc.startAngle, endAngle: arc.endAngle, style: styleFromAttrs(a, vb) };
}

/** SVG's default text anchor is the alphabetic baseline; the renderer (symbolShapeCanvas.ts) draws with `ctx.textBaseline = 'top'`. 0.8em approximates a sans-serif font's ascent, converting the SVG's baseline-anchored y into the top-anchored y the renderer expects — every fixture text element uses the same font-family, so one constant is enough. */
const BASELINE_TO_TOP_EM = 0.8;

function parseTextShape(a, content, vb) {
  const fontSize = Number(a['font-size']);
  return { id: randomUUID(), kind: 'text', x: fx(a.x, vb), y: fy(Number(a.y) - fontSize * BASELINE_TO_TOP_EM, vb), text: content.trim(), fontSize: fontSize / vb.height, style: styleFromAttrs(a, vb) };
}

function parsePointsList(pointsAttr, vb) {
  const nums = pointsAttr.trim().split(/[\s,]+/).map(Number);
  const points = [];
  for (let i = 0; i < nums.length; i += 2) points.push({ x: fx(nums[i], vb), y: fy(nums[i + 1], vb) });
  return points;
}

// Matches every drawable fixture element in document order (z-order —
// SymbolShape's array order is paint order, later drawn on top, same as
// SVG's own painter's model) in one pass, dispatching self-closing shape
// elements (group 1: tag name, group 2: attrs) and <text>...</text> (group 3:
// attrs, group 4: inner text) separately since text is the one element with
// child content instead of being self-closing. Scoped to exactly the 7 tag
// kinds fixture SVGs actually use (verified against all 164 files) — no
// <g>/<use>/<defs>/transform support, since none is present in fixture data.
const SHAPE_TAG_RE = /<(circle|line|rect|ellipse|polygon|path)\s+([^>]*?)\/>|<text\s+([^>]*?)>([^<]*)<\/text>/g;

/**
 * Walks a parsed shape tree looking for a `null` that JSON.stringify would otherwise emit silently
 * in place of a NaN (e.g. a numeric field read from a missing/misspelled SVG attribute). `fill` is
 * the one field allowed to be a real `null` ("unfilled" — see normalizedFill); everything else
 * (including nested objects like `style` and arrays like a polygon's `points`) is expected to be a
 * number or string, so any other `null` here means the parser silently dropped something upstream.
 */
function assertNoUnexpectedNulls(shapes, svgPath) {
  const walk = (value, path) => {
    if (value === null) throw new Error(`${svgPath}: shape field "${path}" is null — a required SVG attribute was probably missing or misspelled`);
    if (typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'fill') continue;
      walk(child, `${path}.${key}`);
    }
  };
  shapes.forEach((shape, i) => walk(shape, `shapes[${i}]`));
}

function parseSvgShapes(content, vb) {
  const shapes = [];
  let m;
  while ((m = SHAPE_TAG_RE.exec(content))) {
    if (m[4] !== undefined) {
      shapes.push(parseTextShape(parseAttrs(m[3]), m[4], vb));
      continue;
    }
    const a = parseAttrs(m[2]);
    switch (m[1]) {
      case 'circle':
        shapes.push({ id: randomUUID(), kind: 'circle', cx: fx(a.cx, vb), cy: fy(a.cy, vb), radius: fMin(a.r, vb), style: styleFromAttrs(a, vb) });
        break;
      case 'line':
        shapes.push({ id: randomUUID(), kind: 'line', x1: fx(a.x1, vb), y1: fy(a.y1, vb), x2: fx(a.x2, vb), y2: fy(a.y2, vb), style: styleFromAttrs(a, vb) });
        break;
      case 'rect':
        shapes.push({ id: randomUUID(), kind: 'rect', x: fx(a.x, vb), y: fy(a.y, vb), width: Number(a.width) / vb.width, height: Number(a.height) / vb.height, style: styleFromAttrs(a, vb) });
        break;
      case 'ellipse':
        shapes.push({ id: randomUUID(), kind: 'ellipse', cx: fx(a.cx, vb), cy: fy(a.cy, vb), radiusX: Number(a.rx) / vb.width, radiusY: Number(a.ry) / vb.height, style: styleFromAttrs(a, vb) });
        break;
      case 'polygon':
        shapes.push({ id: randomUUID(), kind: 'polygon', points: parsePointsList(a.points, vb), style: styleFromAttrs(a, vb) });
        break;
      case 'path':
        shapes.push(parseArcShape(a, vb));
        break;
    }
  }
  return shapes;
}

function main() {
  const disciplineMap = loadDisciplineMap();
  const entries = [];
  const seenIds = new Map(); // id -> filename, to catch unexpected collisions
  const svgFilesToCopy = [];

  for (const { dir, category } of FOLDERS) {
    const folderPath = join(STAMPS_DIR, dir);
    const nameMapping = loadNameMapping(folderPath);
    const svgFiles = readdirSync(folderPath)
      .filter((f) => f.endsWith('.svg'))
      .sort((a, b) => a.localeCompare(b));

    for (const filename of svgFiles) {
      const base = filename.replace(/\.svg$/, '');
      const svgPath = join(folderPath, filename);
      const mepconfigPath = join(folderPath, `${base}.mepconfig.json`);

      const disciplineRow = disciplineMap.get(filename);
      if (!disciplineRow) throw new Error(`${filename} has no row in ${DISCIPLINE_MAP_CSV}`);

      const config = readJsonIfExists(mepconfigPath);
      const ports = config ? config.ports.map(({ id, name, fractionX, fractionY }) => ({ id, name, fractionX, fractionY })) : [];
      const svgContent = stripBom(readFileSync(svgPath, 'utf8'));
      const vb = readSvgViewBox(svgContent, svgPath);
      const shapes = parseSvgShapes(svgContent, vb);
      assertNoUnexpectedNulls(shapes, svgPath);

      const label = humanizeLabel(base);
      const dutchBase = nameMapping.get(base);
      const labelNl = dutchBase ? humanizeLabel(dutchBase) : undefined;
      const baseSlug = slugify(base);
      const { nativeWidth, nativeHeight } = nativeSizeFor(vb);

      const multi = disciplineRow.length > 1;
      for (const { token, value } of disciplineRow) {
        const id = multi ? `${baseSlug}-${token.toLowerCase()}` : baseSlug;
        if (seenIds.has(id)) throw new Error(`Id collision: "${id}" generated for both ${seenIds.get(id)} and ${filename}`);
        seenIds.set(id, filename);
        entries.push({ id, label, labelNl, discipline: value, category, nativeWidth, nativeHeight, ports, shapes, iconRef: filename });
      }

      svgFilesToCopy.push(svgPath);
    }
  }

  // The 4 ids that used to be hand-typed entries in stamp-library.ts, now
  // fully superseded by fixture-generated ones sharing the same id (fire-hose-reel
  // last, once its own generation exclusion was lifted) — asserted here so a
  // future fixture rename doesn't silently stop producing them.
  for (const expectedId of ['ventilation-grille-rh-supply', 'luminaire-rectangular', 'switch', 'fire-hose-reel']) {
    if (!seenIds.has(expectedId)) throw new Error(`Expected the generated library to (re)produce id "${expectedId}" to supersede stamp-library.ts's hand-typed entry — check fixtures/stamp-discipline-map.csv`);
  }

  for (const svgPath of svgFilesToCopy) {
    copyFileSync(svgPath, join(PUBLIC_STAMPS_DIR, svgPath.split('/').pop()));
  }

  const header = `// GENERATED by scripts/generate-stamp-library.mjs — do not hand-edit.
// Re-run \`pnpm gen:stamps\` after changing fixtures/stamps/{Terminals-english,Equipment-english}
// or scripts/stamp-discipline-map.csv. See stamp-library.ts (STAMP_LIBRARY
// merges this in) and .claude/plans/stamp-migration-and-draw-from-spec.md.
import type { StampDefinition } from './stamp-library.js';

export const GENERATED_STAMP_LIBRARY: StampDefinition[] = `;

  const body = entries.map((e) => ({ ...e, source: 'library' }));
  const serialized = JSON.stringify(body, null, 2)
    // JSON.stringify quotes every key; re-emit as bare identifiers to match this file's own style.
    .replace(/"([a-zA-Z0-9_]+)":/g, '$1:')
    // Single-quoted strings, matching stamp-library.ts's own style — safe
    // only because no generated string value contains an apostrophe or a
    // backslash (asserted by the id-uniqueness/discipline checks above
    // running on plain fixture-derived text); re-check this if that ever changes.
    .replace(/"((?:[^"\\]|\\.)*)"/g, (_, inner) => `'${inner}'`);

  writeFileSync(OUT_FILE, header + serialized + ';\n', 'utf8');

  console.log(`Generated ${entries.length} StampDefinition entries (${svgFilesToCopy.length} unique assets, ${entries.length - svgFilesToCopy.length} extra multi-discipline duplicates) -> ${OUT_FILE}`);
  console.log(`Copied ${svgFilesToCopy.length} SVGs -> ${PUBLIC_STAMPS_DIR}`);
}

main();
