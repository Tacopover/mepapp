// Dev-time codegen: scans fixtures/stamps/{Terminals-english,Equipment-english}
// plus scripts/stamp-discipline-map.csv (hand-filled by a domain expert — the
// old D<n>_ filename prefixes don't map reliably onto core's Discipline
// union, see .claude/plans/stamp-migration-and-draw-from-spec.md §A1) and
// writes:
//   - packages/core/src/stamp-library.generated.ts (GENERATED_STAMP_LIBRARY)
//   - apps/web/public/stamps/<filename>.svg (a flat copy of every referenced asset)
//
// Never run at build time or import fs anywhere under packages/* — core stays
// I/O-free (see stamp-library.ts's own header comment); this script's
// *output* is plain committed data, same as the 4 hand-typed entries it sits
// alongside. Re-run manually (`pnpm gen:stamps`) whenever the fixture
// folders or the discipline-map CSV change.
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

// Ids that already exist as hand-typed entries in stamp-library.ts and whose
// migration-relevant field values (category, in project.ts's v1->v2 backfill
// step, keyed by definitionId) must not silently change — see plan-file
// note. Generating an entry for this exact fixture file is skipped entirely
// so the hand-typed 'fire-hose-reel' (category 'equipment') stays
// authoritative. Every other hand-typed id (ventilation-grille-rh-supply,
// luminaire-rectangular, switch) has no such dependency and is intentionally
// superseded — stamp-library.ts drops those 3 literal entries in favor of
// the generated ones sharing the same id.
const EXCLUDED_FILENAMES = new Set(['D4_Fire_hose_reel.svg']);

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

/** Strips a leading "D<n>_" (English) or "<digits>_" (Dutch) discipline-code prefix, turns remaining underscores into spaces, then title-cases each word — matches the 4 hand-typed entries' label style ("Fire Hose Reel", "Supply Grille"). Already-uppercase tokens (USB, CO2, PIR, LUTO, 230V, 3FPE) are left untouched. */
function humanizeLabel(base) {
  const stripped = base.replace(/^(?:D\d+_|\d+_)/, '');
  return stripped
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

function readSvgSize(svgPath) {
  const content = stripBom(readFileSync(svgPath, 'utf8'));
  const widthMatch = content.match(/\bwidth="([\d.]+)"/);
  const heightMatch = content.match(/\bheight="([\d.]+)"/);
  if (!widthMatch || !heightMatch) throw new Error(`Could not read width/height from ${svgPath}`);
  return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
}

/** Palette-tile nominal size only (StampDefinition.nativeWidth/Height doc comment — real placed size is recomputed from the art's actual pixel dimensions at 300 DPI). Preserves the SVG's own aspect ratio, capping the longer side at NATIVE_BASELINE, matching how the hand-typed luminaire-rectangular entry derived its 16.87 from a 676x190 viewBox. */
const NATIVE_BASELINE = 48;
function nativeSizeFor(svgPath) {
  const { width, height } = readSvgSize(svgPath);
  if (width >= height) return { nativeWidth: NATIVE_BASELINE, nativeHeight: round2((NATIVE_BASELINE * height) / width) };
  return { nativeWidth: round2((NATIVE_BASELINE * width) / height), nativeHeight: NATIVE_BASELINE };
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

// SymbolShapeStyle.strokeWidth is a fraction, not a raw pixel value — the
// renderer does `strokeWidth * Math.min(widthPx, heightPx)` (matching the
// dialog's own DEFAULT_STYLE.strokeWidth: 0.01), the same width-vs-height-
// independent convention `radius`/`fontSize` already follow above.
function styleOf(shape, vbw, vbh) {
  return { stroke: shape.stroke, strokeWidth: shape.strokeWidth / Math.min(vbw, vbh), fill: normalizedFill(shape.fill) };
}

// mepshapes coordinates are absolute pixels against the file's own
// ViewBoxWidth/ViewBoxHeight; SymbolShape coordinates are fractional 0..1,
// normalized independently per axis (see packages/ui/src/symbolShapeCanvas.ts's
// `x * widthPx` / `y * heightPx`) — so x-ish fields divide by vbw, y-ish by vbh.
// radius is a single scalar with no independent X/Y in SymbolShape — a circle
// can't be expressed as separate width/height fractions without becoming an
// ellipse on a non-square viewBox, so it divides by Math.min(vbw, vbh),
// matching strokeWidth above and how the renderer/hit-test apply it
// (radius * Math.min(widthPx, heightPx) for both axes). fontSize divides by
// vbh, matching the renderer's single-axis (heightPx) use for text size.
function convertShape(shape, vbw, vbh) {
  const id = randomUUID();
  const style = styleOf(shape, vbw, vbh);
  switch (shape.type) {
    case 'line':
      return { id, kind: 'line', x1: shape.x1 / vbw, y1: shape.y1 / vbh, x2: shape.x2 / vbw, y2: shape.y2 / vbh, style };
    case 'rect':
      return { id, kind: 'rect', x: shape.x / vbw, y: shape.y / vbh, width: shape.w / vbw, height: shape.h / vbh, style };
    case 'circle':
      return { id, kind: 'circle', cx: shape.cx / vbw, cy: shape.cy / vbh, radius: shape.r / Math.min(vbw, vbh), style };
    case 'arc': {
      // ctx.ellipse always sweeps forward (increasing angle) from startAngle to
      // endAngle — a negative sweepAngle in the fixture means the intended arc
      // runs the other way, so swap start/end to keep endAngle > startAngle,
      // otherwise the canvas draws the major (wrong) arc instead.
      const rawStart = shape.startAngle;
      const rawEnd = shape.startAngle + shape.sweepAngle;
      const lo = Math.min(rawStart, rawEnd);
      const hi = Math.max(rawStart, rawEnd);
      return {
        id,
        kind: 'arc',
        cx: shape.cx / vbw,
        cy: shape.cy / vbh,
        radius: shape.r / Math.min(vbw, vbh),
        startAngle: (lo * Math.PI) / 180,
        endAngle: (hi * Math.PI) / 180,
        style,
      };
    }
    case 'text':
      return { id, kind: 'text', x: shape.x / vbw, y: shape.y / vbh, text: shape.content, fontSize: shape.fontSize / vbh, style };
    case 'arrow':
      return { id, kind: 'arrow', x1: shape.x1 / vbw, y1: shape.y1 / vbh, x2: shape.x2 / vbw, y2: shape.y2 / vbh, style };
    case 'ellipse':
      return { id, kind: 'ellipse', cx: shape.cx / vbw, cy: shape.cy / vbh, radiusX: shape.rx / vbw, radiusY: shape.ry / vbh, style };
    case 'polygon': {
      const points = [];
      for (let i = 0; i < shape.points.length; i += 2) {
        points.push({ x: shape.points[i] / vbw, y: shape.points[i + 1] / vbh });
      }
      return { id, kind: 'polygon', points, style };
    }
    default:
      throw new Error(`Unknown mepshapes shape type "${shape.type}"`);
  }
}

/** Returns undefined (not []) when the fixture has no .mepshapes.json — matches StampDefinition.shapes's already-optional convention (unlike `ports`, which is always an array). */
function loadShapes(folderPath, base) {
  const mepshapesPath = join(folderPath, `${base}.mepshapes.json`);
  const data = readJsonIfExists(mepshapesPath);
  if (!data) return undefined;
  return data.Shapes.map((shape) => convertShape(shape, data.ViewBoxWidth, data.ViewBoxHeight));
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
      if (EXCLUDED_FILENAMES.has(filename)) continue;
      const base = filename.replace(/\.svg$/, '');
      const svgPath = join(folderPath, filename);
      const mepconfigPath = join(folderPath, `${base}.mepconfig.json`);

      const disciplineRow = disciplineMap.get(filename);
      if (!disciplineRow) throw new Error(`${filename} has no row in ${DISCIPLINE_MAP_CSV}`);

      const config = readJsonIfExists(mepconfigPath);
      const ports = config ? config.ports.map(({ id, name, fractionX, fractionY }) => ({ id, name, fractionX, fractionY })) : [];
      const shapes = loadShapes(folderPath, base);

      const label = humanizeLabel(base);
      const dutchBase = nameMapping.get(base);
      const labelNl = dutchBase ? humanizeLabel(dutchBase) : undefined;
      const baseSlug = slugify(base);
      const { nativeWidth, nativeHeight } = nativeSizeFor(svgPath);

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

  // The 3 hand-typed entries this generation intentionally supersedes (same
  // fixture art now migrated with authored port data) — asserted here so a
  // future fixture rename doesn't silently stop overriding them.
  for (const expectedId of ['ventilation-grille-rh-supply', 'luminaire-rectangular', 'switch']) {
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
