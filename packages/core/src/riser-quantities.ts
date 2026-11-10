// Riser takeoff: the spans between the member levels of each riser, the Risers table, the building network
// labels, the graph reach of a seed and the Building networks roll-up. Pure data, no I/O. Types are in riser.ts.

import type { BuildingFile, BuildingLevel } from './building.js';
import type { QuantityCell, QuantityTable } from './quantities.js';
import type { Riser, RiserEndKind, RiserMember } from './riser.js';
import type { DerivedRiserFlow } from './riser-flow.js';

export interface RiserSpan {
  riser: Riser;
  /** Lower member level (or, for an end row, the level of the end member). */
  fromLevelId: string;
  /** Upper member level; '' for an end row. */
  toLevelId: string;
  lengthMm: number;
  /** Floor crossings; 0 for an end row. */
  crossings: number;
  /** Lower member. */
  fromMember?: RiserMember;
  /** Upper member; absent for an end row. */
  toMember?: RiserMember;
  /** Set only on an end row. */
  endLabel?: 'to roof/ground' | 'to cap';
}

interface SortedMember {
  member: RiserMember;
  level: BuildingLevel;
}

/** The members of a riser on known levels, lowest level first. Equal elevations keep the member order. */
function sortedMembers(file: BuildingFile, riser: Riser): SortedMember[] {
  const levels = new Map(file.levels.map((level) => [level.id, level]));
  return riser.members
    .map((member) => ({ member, level: levels.get(member.levelId) }))
    .filter((item): item is SortedMember => item.level !== undefined)
    .sort((a, b) => a.level.elevationMm - b.level.elevationMm);
}

function endRow(riser: Riser, kind: RiserEndKind, item: SortedMember, warnings: string[]): RiserSpan | null {
  if (kind === 'member') return null;
  if (riser.endAllowanceMm <= 0) {
    warnings.push(`Riser ${riser.name} has ${kind === 'open' ? 'an open' : 'a capped'} end with no end allowance.`);
    return null;
  }
  return {
    riser,
    fromLevelId: item.member.levelId,
    toLevelId: '',
    lengthMm: riser.endAllowanceMm,
    crossings: 0,
    fromMember: item.member,
    endLabel: kind === 'open' ? 'to roof/ground' : 'to cap',
  };
}

export function riserSpans(file: BuildingFile, riser: Riser): { spans: RiserSpan[]; warnings: string[] } {
  const spans: RiserSpan[] = [];
  const warnings: string[] = [];
  const members = sortedMembers(file, riser);
  if (members.length === 1) warnings.push(`Riser ${riser.name} has one member. Length unknown.`);
  if (members.length < 2) return { spans, warnings };

  const bottom = endRow(riser, riser.bottomEnd, members[0]!, warnings);
  if (bottom) spans.push(bottom);
  for (let i = 0; i + 1 < members.length; i++) {
    const lower = members[i]!;
    const upper = members[i + 1]!;
    const lowerMm = lower.level.elevationMm;
    const upperMm = upper.level.elevationMm;
    const between = file.levels.filter((level) => level.elevationMm > lowerMm && level.elevationMm < upperMm).length;
    const lengthMm = upperMm - lowerMm + (upper.member.connectionHeightMm ?? 0) - (lower.member.connectionHeightMm ?? 0);
    spans.push({
      riser,
      fromLevelId: lower.member.levelId,
      toLevelId: upper.member.levelId,
      lengthMm,
      crossings: between + 1,
      fromMember: lower.member,
      toMember: upper.member,
    });
    if (lowerMm === upperMm) {
      warnings.push(
        lengthMm === 0
          ? `Levels ${lower.level.name}, ${upper.level.name} have the same elevation (${lowerMm} mm). Riser ${riser.name} has a span of length 0.`
          : `Levels ${lower.level.name}, ${upper.level.name} have the same elevation (${lowerMm} mm). The span of riser ${riser.name} between them is ${Math.round(lengthMm) / 1000} m long, from the connection heights only.`,
      );
    }
  }
  const top = endRow(riser, riser.topEnd, members[members.length - 1]!, warnings);
  if (top) spans.push(top);
  return { spans, warnings };
}

/** One size when both sides agree or one side is unknown; both sizes joined with " / " when they differ. */
function sizeCell(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null || a === b) return a;
  return `${a} / ${b}`;
}

export interface RiserTableOptions {
  /** Keep only the spans that touch this level (fromLevelId or toLevelId equals it; an end row counts by its fromLevelId; a one-member riser counts when its member is on this level). A riser with no row left gives no row. */
  levelId?: string;
  /** Result of deriveRiserFlow(file, perLevelFlow), keyed by riser id. Used for the columns "Flow direction" and "Source level". */
  derived?: Record<string, DerivedRiserFlow>;
}

export function riserTable(
  file: BuildingFile,
  sizeOf: (member: RiserMember) => string | null,
  options: RiserTableOptions = {},
): QuantityTable {
  const levelName = new Map(file.levels.map((level) => [level.id, level.name]));
  const rows: QuantityCell[][] = [];
  for (const riser of file.risers) {
    const common: QuantityCell[] = [file.name, riser.name, riser.shaftName ?? '', riser.networkType.name];
    const derivedFlow = options.derived?.[riser.id];
    const sourceId = derivedFlow?.sourceLevelId ?? riser.sourceLevelId;
    const source = sourceId === undefined ? '' : (levelName.get(sourceId) ?? '');
    const setByHand = riser.flow !== 'unknown' || riser.sourceLevelId !== undefined;
    const flowSetBy = setByHand
      ? 'Set by hand'
      : derivedFlow && (derivedFlow.fromSolve || derivedFlow.sourceLevelId !== undefined)
        ? 'From the flow solve'
        : 'Not known yet';
    const tail: QuantityCell[] = [derivedFlow?.flow ?? riser.flow, source, flowSetBy];
    const members = sortedMembers(file, riser);
    if (members.length === 1) {
      const member = members[0]!.member;
      if (options.levelId === undefined || member.levelId === options.levelId) {
        rows.push([...common, levelName.get(member.levelId) ?? '', '', null, null, null, sizeOf(member), ...tail]);
      }
      continue;
    }
    for (const span of riserSpans(file, riser).spans) {
      if (options.levelId !== undefined && span.fromLevelId !== options.levelId && span.toLevelId !== options.levelId) continue;
      rows.push([
        ...common,
        levelName.get(span.fromLevelId) ?? '',
        span.endLabel ?? (levelName.get(span.toLevelId) ?? ''),
        Math.round(span.lengthMm) / 1000,
        span.crossings,
        span.crossings,
        sizeCell(span.fromMember ? sizeOf(span.fromMember) : null, span.toMember ? sizeOf(span.toMember) : null),
        ...tail,
      ]);
    }
  }
  return {
    name: 'Risers',
    headers: [
      'Building',
      'Riser',
      'Shaft',
      'Network type',
      'From level',
      'To level',
      'Floor-to-floor length (m)',
      'Floor crossings',
      'Fire crossings to check',
      'Size',
      'Flow direction',
      'Source level',
      'Flow set by',
    ],
    rows,
  };
}

export function riserTakeoffWarnings(file: BuildingFile): string[] {
  if (file.risers.length === 0) return [];
  const warnings = file.risers.flatMap((riser) => riserSpans(file, riser).warnings);
  warnings.push('Flow is not summed across levels.');
  warnings.push('Each floor crossing of a duct needs a fire damper or a fire-stopped penetration. Check the local rules.');
  return warnings;
}

/** Fitting ids of the members of all risers whose sheetId is in sheetIds. Each id once, in order of first use. */
export function riserFittingIdsForSheets(file: BuildingFile, sheetIds: readonly string[]): string[] {
  const wanted = new Set(sheetIds);
  const fittingIds = new Set<string>();
  for (const riser of file.risers) {
    for (const member of riser.members) {
      if (wanted.has(member.sheetId)) fittingIds.add(member.fittingId);
    }
  }
  return [...fittingIds];
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  /** The root of the set of `node`. A node that is not known starts a set of its own. */
  find(node: string): string {
    if (!this.parent.has(node)) this.parent.set(node, node);
    let root = node;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let current = node;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

interface NetworkPart {
  sheetId: string;
  networkLabel: string;
}

interface RiserGraph {
  sets: UnionFind;
  /** Network nodes by node key, in order of first registration. */
  networks: Map<string, NetworkPart>;
}

const riserNode = (riserId: string): string => `r:${riserId}`;

function networkNode(graph: RiserGraph, part: NetworkPart): string {
  const key = `n:${part.sheetId}|${part.networkLabel}`;
  if (!graph.networks.has(key)) graph.networks.set(key, part);
  return key;
}

/** Joins each riser with each per-document network of its members. Risers and networks that touch one network share a set. */
function riserGraph(file: BuildingFile, networksOf: (member: RiserMember) => string[]): RiserGraph {
  const graph: RiserGraph = { sets: new UnionFind(), networks: new Map() };
  for (const riser of file.risers) {
    const node = riserNode(riser.id);
    graph.sets.find(node);
    for (const member of riser.members) {
      for (const networkLabel of networksOf(member)) {
        graph.sets.union(node, networkNode(graph, { sheetId: member.sheetId, networkLabel }));
      }
    }
  }
  return graph;
}

/** Labels "Building network <type> <n>" for each network of a riser. Key: `${sheetId}|${networkLabel}`. */
export function buildingNetworkLabels(file: BuildingFile, networksOf: (member: RiserMember) => string[]): Map<string, string> {
  const graph = riserGraph(file, networksOf);
  const partsOfRoot = new Map<string, NetworkPart[]>();
  for (const [node, part] of graph.networks) {
    const root = graph.sets.find(node);
    partsOfRoot.set(root, [...(partsOfRoot.get(root) ?? []), part]);
  }
  const labels = new Map<string, string>();
  const perType = new Map<string, number>();
  const seen = new Set<string>();
  for (const riser of file.risers) {
    const root = graph.sets.find(riserNode(riser.id));
    if (seen.has(root)) continue;
    seen.add(root);
    const parts = partsOfRoot.get(root);
    if (!parts) continue;
    const type = riser.networkType.name;
    const n = (perType.get(type) ?? 0) + 1;
    perType.set(type, n);
    for (const part of parts) labels.set(`${part.sheetId}|${part.networkLabel}`, `Building network ${type} ${n}`);
  }
  return labels;
}

export interface RiserGraphSeed {
  riserIds?: readonly string[];
  network?: { sheetId: string; networkLabel: string };
}

/** The risers and networks that share a set with the seed. An unknown seed riser id is ignored. */
export function riserGraphReach(
  file: BuildingFile,
  seed: RiserGraphSeed,
  networksOf: (member: RiserMember) => string[],
): { riserIds: string[]; networks: { sheetId: string; networkLabel: string }[] } {
  const graph = riserGraph(file, networksOf);
  const seedNodes: string[] = [];
  for (const riserId of seed.riserIds ?? []) {
    if (file.risers.some((riser) => riser.id === riserId)) seedNodes.push(riserNode(riserId));
  }
  if (seed.network) seedNodes.push(networkNode(graph, seed.network));
  const reached = new Set(seedNodes.map((node) => graph.sets.find(node)));
  const riserIds = file.risers.filter((riser) => reached.has(graph.sets.find(riserNode(riser.id)))).map((riser) => riser.id);
  const networks = [...graph.networks]
    .filter(([node]) => reached.has(graph.sets.find(node)))
    .map(([, part]) => ({ sheetId: part.sheetId, networkLabel: part.networkLabel }))
    .sort((a, b) => a.sheetId.localeCompare(b.sheetId) || a.networkLabel.localeCompare(b.networkLabel));
  return { riserIds, networks };
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

export function buildingNetworkRollup(args: { segmentRows: QuantityTable; spans: RiserSpan[] }): QuantityTable {
  const { segmentRows, spans } = args;
  const typeColumn = segmentRows.headers.indexOf('Network type');
  const lengthColumn = segmentRows.headers.indexOf('Length (m)');
  const rows = typeColumn < 0 || lengthColumn < 0 ? [] : segmentRows.rows;
  const types = new Set<string>();
  const segmentSum = new Map<string, number>();
  for (const row of rows) {
    const type = row[typeColumn];
    if (typeof type !== 'string') continue;
    types.add(type);
    const length = row[lengthColumn];
    segmentSum.set(type, (segmentSum.get(type) ?? 0) + (typeof length === 'number' ? length : 0));
  }
  const riserSum = new Map<string, number>();
  const riserIds = new Map<string, Set<string>>();
  for (const span of spans) {
    const type = span.riser.networkType.name;
    types.add(type);
    riserSum.set(type, (riserSum.get(type) ?? 0) + span.lengthMm / 1000);
    const ids = riserIds.get(type) ?? new Set<string>();
    ids.add(span.riser.id);
    riserIds.set(type, ids);
  }
  return {
    name: 'Building networks',
    headers: ['Network type', 'Segment length (m)', 'Riser floor-to-floor length (m)', 'Risers'],
    rows: [...types].map((type) => [type, round3(segmentSum.get(type) ?? 0), round3(riserSum.get(type) ?? 0), riserIds.get(type)?.size ?? 0]),
  };
}
