// Room name and number reading from PDF text. Text runs (one per text line) are
// grouped into label blocks, each block is parsed into number, name and area,
// and each block is assigned to the room polygon that contains it.
// Plan: .claude/plans/room-detection.md section 7. Works on PDFs with real text;
// PDFs that draw text as outlines have no runs and give no labels.

import type { Vec2 } from '../geometry.js';
import type { Calibration } from '../calibration.js';
import { polygonAreaPt2, polygonContainsPoint, roomLabelPoint, type Room, type RoomInput } from './room.js';

/** One line of text in displayed page space. Structurally the same as TextRun in @mepapp/pdf-engine. */
export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSizePt: number;
}

export interface LabelParams {
  fontTolerance: number; // two lines of one block differ by at most this fraction in font size
  maxCenterOffsetFs: number; // largest horizontal distance between the centres of two lines, in font sizes (label text is centred)
  maxLinePitchFs: number; // largest vertical distance between the centres of two lines, in font sizes
  minFontPt: number; // smaller text is not a room label (wall type tags, notes)
  maxLinesAboveArea: number; // most lines of a label above its area line
  plausibleAreaError: number; // a label area within this fraction of the polygon area is plausible
  warnAreaError: number; // roomAreaWarning reports a difference above this fraction
}

export const DEFAULT_LABEL_PARAMS: LabelParams = {
  fontTolerance: 0.12,
  maxCenterOffsetFs: 0.75,
  maxLinePitchFs: 2.2,
  minFontPt: 5,
  maxLinesAboveArea: 5,
  plausibleAreaError: 0.35,
  warnAreaError: 0.15,
};

export interface RoomLabel {
  anchor: Vec2; // centre of the block
  bounds: [number, number, number, number]; // x0, y0, x1, y1
  lines: string[];
  number: string | null; // room number, for example "0.17" or "Ec.02.02.01"
  code: string | null; // second identifier, for example the drawing code "Ec-226" (only when a number was found too)
  name: string | null; // first line that is not number, code, area or persons
  details: string[]; // the other free lines, for example the function group
  areaM2: number | null;
  persons: number | null;
}

// Patterns from the plan, section 7, extended by the two styles found in the fixtures.
const NUMBER = /^\d{1,2}\.\d+[A-Za-z]?(-\d+)?$/; // 0.17, 1.01A
const NUMBER_PAREN = /^\(([A-Za-z]{1,3}(?:\.\d+){2,4})\)$/; // (Ec.02.02.01)
const CODE = /^[A-Z][a-z]?-\d+[A-Za-z]*$/; // Ec-226, Fd-232T
const NUMBER_GENERIC = /^(?=.*\d)(?=.*[A-Za-z])(?=.*[.-])[A-Za-z0-9][A-Za-z0-9.\-/]{2,23}$/; // any other code without spaces: 10A.00.030, B-2.14
const AREA = /(\d+(?:[.,]\d+)?)\s*m\s*[²2](?![\d.])/;
const PERSONS = /(\d+)\s*pers\b\.?/i;

const stripLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Groups text lines into blocks: same font size, centred on each other, one line below the next. Each block is sorted top to bottom. */
export function clusterTextRuns(items: readonly TextItem[], params: Partial<LabelParams> = {}): TextItem[][] {
  const P = { ...DEFAULT_LABEL_PARAMS, ...params };
  const runs = items.filter((t) => t.text.trim() !== '' && t.fontSizePt >= P.minFontPt);
  const cy = (t: TextItem): number => t.y + t.height / 2;
  const cx = (t: TextItem): number => t.x + t.width / 2;
  runs.sort((a, b) => cy(a) - cy(b));
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (let i = 0; i < runs.length; i++) {
    const a = runs[i]!;
    for (let j = i + 1; j < runs.length; j++) {
      const b = runs[j]!;
      const fs = Math.max(a.fontSizePt, b.fontSizePt);
      if (cy(b) - cy(a) > P.maxLinePitchFs * fs) break;
      if (Math.abs(a.fontSizePt - b.fontSizePt) > P.fontTolerance * fs) continue;
      if (Math.abs(cx(a) - cx(b)) > P.maxCenterOffsetFs * fs) continue;
      if (cy(b) - cy(a) < 0.3 * fs) continue; // the same line twice (overprint), not the next line
      parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, TextItem[]>();
  runs.forEach((t, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(t);
    else groups.set(r, [t]);
  });
  return [...groups.values()];
}

/**
 * Reads one block. Returns null unless the block is a room label: it has an area
 * line, or a room number and at least two lines (a lone number is a dimension or a grid label).
 */
export function parseRoomLabel(block: readonly TextItem[], genericNumber = true): RoomLabel | null {
  const lines = block.map((t) => stripLine(t.text));
  let number: string | null = null;
  let plain: string | null = null;
  let code: string | null = null;
  let areaM2: number | null = null;
  let persons: number | null = null;
  const free: string[] = [];
  // The generic number pattern is a fallback: a name such as "Lift-1" next to a number "0.6-1" is a name.
  const hasStrictNumber = lines.some((line) => NUMBER_PAREN.test(line) || NUMBER.test(line));
  for (const line of lines) {
    const paren = NUMBER_PAREN.exec(line);
    if (paren) {
      number ??= paren[1]!;
      continue;
    }
    if (NUMBER.test(line)) {
      plain ??= line;
      continue;
    }
    if (CODE.test(line)) {
      code ??= line;
      continue;
    }
    if (genericNumber && !hasStrictNumber && plain === null && NUMBER_GENERIC.test(line)) {
      plain = line;
      continue;
    }
    const area = AREA.exec(line);
    const pers = PERSONS.exec(line);
    if (area || pers) {
      if (area && areaM2 === null) areaM2 = Number(area[1]!.replace(',', '.'));
      if (pers && persons === null) persons = Number(pers[1]);
      const rest = stripLine(line.replace(AREA, '').replace(PERSONS, ''));
      if (rest !== '') free.push(rest);
      continue;
    }
    if (/^\d+$/.test(line)) continue; // a dimension value next to the label, not a name
    free.push(line);
  }
  number ??= plain;
  if (number === null && code !== null) {
    number = code;
    code = null;
  }
  if (areaM2 === null && !(number !== null && lines.length >= 2)) return null;
  const x0 = Math.min(...block.map((t) => t.x));
  const y0 = Math.min(...block.map((t) => t.y));
  const x1 = Math.max(...block.map((t) => t.x + t.width));
  const y1 = Math.max(...block.map((t) => t.y + t.height));
  return {
    anchor: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
    bounds: [x0, y0, x1, y1],
    lines,
    number,
    code,
    name: free[0] ?? null,
    details: free.slice(1),
    areaM2,
    persons,
  };
}

/**
 * Label blocks found from the area line: a line with a number and "m²" is the last line of a
 * label, and the lines directly above it (centred on it, one pitch apart, any font size) are the
 * name and number. Works when the lines of one label use different font sizes. The block ends
 * above the area line at the next area line, a line off-centre or a gap. Returns the blocks and
 * the lines that they use.
 */
function areaAnchoredBlocks(items: readonly TextItem[], P: LabelParams): { blocks: TextItem[][]; used: Set<TextItem> } {
  const cy = (t: TextItem): number => t.y + t.height / 2;
  const cx = (t: TextItem): number => t.x + t.width / 2;
  const runs = items.filter((t) => t.text.trim() !== '' && t.fontSizePt >= P.minFontPt);
  const isArea = (t: TextItem): boolean => AREA.test(t.text);
  const blocks: TextItem[][] = [];
  const used = new Set<TextItem>();
  for (const area of runs.filter(isArea)) {
    if (used.has(area)) continue; // the same line drawn twice (overprint)
    const block = [area];
    used.add(area);
    for (const other of runs) {
      if (isArea(other) && Math.abs(cx(other) - cx(area)) < 1 && Math.abs(cy(other) - cy(area)) < 1) used.add(other);
    }
    let last = area;
    for (;;) {
      let best: TextItem | null = null;
      for (const t of runs) {
        const fs = Math.max(t.fontSizePt, last.fontSizePt);
        if (used.has(t) && !isArea(t)) continue;
        if (cy(t) >= cy(last) - 0.3 * fs || cy(last) - cy(t) > P.maxLinePitchFs * fs) continue;
        if (Math.abs(cx(t) - cx(area)) > P.maxCenterOffsetFs * Math.max(t.fontSizePt, area.fontSizePt)) continue;
        if (best === null || cy(t) > cy(best)) best = t;
      }
      if (best === null || isArea(best) || block.length > P.maxLinesAboveArea) break;
      block.unshift(best);
      used.add(best);
      last = best;
    }
    blocks.push(block);
  }
  return { blocks, used };
}

/**
 * Every room label on a page. Labels are first found from their area line (any font size per
 * line, any number format); the remaining text is grouped by font size, which finds labels that
 * have a number and a name but no area.
 */
export function readRoomLabels(items: readonly TextItem[], params: Partial<LabelParams> = {}): RoomLabel[] {
  const P = { ...DEFAULT_LABEL_PARAMS, ...params };
  const labels: RoomLabel[] = [];
  const { blocks, used } = areaAnchoredBlocks(items, P);
  for (const block of blocks) {
    const label = parseRoomLabel(block);
    if (label) labels.push(label);
  }
  for (const block of clusterTextRuns(items.filter((t) => !used.has(t)), params)) {
    const label = parseRoomLabel(block, false); // without an area line only a strict number makes a label
    if (label && label.areaM2 === null) labels.push(label);
  }
  return labels;
}

export interface RoomLabelMatch {
  roomIndex: number;
  label: RoomLabel; // the chosen label
  others: RoomLabel[]; // other labels inside the same polygon: the room may be merged or open
}

/**
 * Assigns labels to rooms (same page, page-space polygons). A label belongs to the
 * room that contains its anchor; when the anchor lies on a wall, to the room that
 * contains most of its lines. With several labels in one room the best one wins:
 * a label whose area is plausible for the polygon, then one with a room number,
 * then the one nearest to the room's label point.
 */
export function matchRoomLabels(rooms: readonly Pick<Room, 'polygon'>[], labels: readonly RoomLabel[], calibration: Calibration | null, params: Partial<LabelParams> = {}): RoomLabelMatch[] {
  const P = { ...DEFAULT_LABEL_PARAMS, ...params };
  // Without a calibration the polygon areas are unknown, so every label area counts as plausible.
  const mmPerPt = calibration ? 1 / calibration.pageUnitsPerRealUnit : NaN;
  const areaM2 = rooms.map((r) => (polygonAreaPt2(r.polygon) * mmPerPt * mmPerPt) / 1e6);
  const points = rooms.map((r) => roomLabelPoint(r));
  const byRoom = new Map<number, RoomLabel[]>();
  for (const label of labels) {
    let k = rooms.findIndex((r) => polygonContainsPoint(r.polygon, label.anchor));
    if (k < 0) {
      const [x0, y0, x1, y1] = label.bounds;
      const probes: Vec2[] = [
        { x: x0, y: label.anchor.y },
        { x: x1, y: label.anchor.y },
        { x: label.anchor.x, y: y0 },
        { x: label.anchor.x, y: y1 },
      ];
      let best = 0;
      rooms.forEach((r, i) => {
        const n = probes.filter((p) => polygonContainsPoint(r.polygon, p)).length;
        if (n > best) {
          best = n;
          k = i;
        }
      });
    }
    if (k < 0) continue;
    const list = byRoom.get(k);
    if (list) list.push(label);
    else byRoom.set(k, [label]);
  }
  const matches: RoomLabelMatch[] = [];
  for (const [roomIndex, list] of byRoom) {
    const plausible = (l: RoomLabel): boolean => l.areaM2 === null || Number.isNaN(areaM2[roomIndex]!) || Math.abs(areaM2[roomIndex]! / l.areaM2 - 1) <= P.plausibleAreaError;
    const dist = (l: RoomLabel): number => Math.hypot(l.anchor.x - points[roomIndex]!.x, l.anchor.y - points[roomIndex]!.y);
    const ranked = [...list].sort((a, b) => Number(!plausible(a)) - Number(!plausible(b)) || Number(a.number === null) - Number(b.number === null) || dist(a) - dist(b));
    matches.push({ roomIndex, label: ranked[0]!, others: ranked.slice(1) });
  }
  return matches.sort((a, b) => a.roomIndex - b.roomIndex);
}

/** Copies the chosen labels (calibration null: no area check when choosing) into freshly detected rooms (name, number, label area, details). The rooms stay unlocked: a re-run of detect-all reads them again. */
export function withRoomLabels(rooms: readonly RoomInput[], labels: readonly RoomLabel[], calibration: Calibration | null, params: Partial<LabelParams> = {}): RoomInput[] {
  const out = rooms.map((r) => ({ ...r }));
  for (const m of matchRoomLabels(rooms, labels, calibration, params)) {
    const room = out[m.roomIndex]!;
    room.name = m.label.name;
    room.number = m.label.number;
    if (m.label.areaM2 !== null) room.labelAreaM2 = m.label.areaM2;
    if (m.label.details.length > 0) room.details = m.label.details;
    if (m.others.length > 0) room.otherLabels = m.others.map((l) => [l.number, l.name].filter(Boolean).join(' ') || l.lines.join(' '));
  }
  return out;
}

export interface RoomAreaWarning {
  computedM2: number;
  labelM2: number;
  deviation: number; // computed / label - 1
}

/** The computed area differs from the area printed in the drawing by more than the tolerance, or null. */
export function roomAreaWarning(room: Pick<Room, 'polygon' | 'labelAreaM2'>, calibration: Calibration, tolerance = DEFAULT_LABEL_PARAMS.warnAreaError): RoomAreaWarning | null {
  if (room.labelAreaM2 === undefined || room.labelAreaM2 <= 0) return null;
  const mmPerPt = 1 / calibration.pageUnitsPerRealUnit;
  const computedM2 = (polygonAreaPt2(room.polygon) * mmPerPt * mmPerPt) / 1e6;
  const deviation = computedM2 / room.labelAreaM2 - 1;
  return Math.abs(deviation) > tolerance ? { computedM2, labelM2: room.labelAreaM2, deviation } : null;
}
