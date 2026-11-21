// Flow through the risers of a building: the spans and members of each riser, the groups of risers that share a
// network, the source of each group and the demand that each span carries. Pure data, no I/O. Types of a riser are in riser.ts.

import type { BuildingFile } from './building.js';
import { riserSpans, sortedMembers, type RiserSpan } from './riser-quantities.js';
import type { Riser, RiserMember } from './riser.js';
import type { RiserNetworkSummary, SheetSummary } from './sheet-summary.js';

export interface RiserNetworksLive {
  projectUuid: string;
  riserNetworks: RiserNetworkSummary[];
}

export interface BuildingFlowSpan {
  riserId: string;
  fromLevelId: string;
  toLevelId: string;
  /** Members at the two ends. */
  fromFittingId: string;
  toFittingId: string;
  capacity: number | null;
  state: 'ok' | 'unknown';
  /** False when a level behind the span has no data: the number reads "at least". */
  complete: boolean;
}

export interface BuildingFlowMember {
  riserId: string;
  levelId: string;
  sheetId: string;
  fittingId: string;
  role: 'source' | 'entry' | 'exit' | 'none';
  capacityIn: number | null;
  demandBeyond: number | null;
}

export interface BuildingFlowGroup {
  riserIds: string[];
  total: number;
  /** True when no level of the group is missing data. */
  complete: boolean;
  state: 'ok' | 'unknown';
  sourceLevelId?: string;
}

export interface BuildingFlowResult {
  risers: Record<string, { spans: BuildingFlowSpan[]; members: BuildingFlowMember[] }>;
  groups: BuildingFlowGroup[];
  warnings: string[];
}

/** One network of one level that holds riser fittings. A missing node has no data and counts as zero. */
interface FlowNode {
  key: string;
  terminal: number;
  hasSource: boolean;
  missing: boolean;
  /** Unique by level id. */
  levels: { id: string; name: string }[];
}

interface FlowEdge {
  riser: Riser;
  from: string;
  to: string;
  fromMember: RiserMember;
  toMember: RiserMember;
  out: BuildingFlowSpan;
  capacity: number;
  complete: boolean;
}

interface FlowComponent {
  edges: FlowEdge[];
  nodes: FlowNode[];
  risers: Riser[];
  total: number;
  complete: boolean;
  state: 'ok' | 'unknown';
  sourceKey?: string;
  sourceLevelId?: string;
  parentEdgeOf: Map<string, FlowEdge>;
}

type JoinedSpan = RiserSpan & { fromMember: RiserMember; toMember: RiserMember };

function isJoined(span: RiserSpan): span is JoinedSpan {
  return span.fromMember !== undefined && span.toMember !== undefined;
}

export function solveBuildingFlow(
  file: BuildingFile,
  summaries: ReadonlyMap<string, SheetSummary>,
  live?: RiserNetworksLive,
): BuildingFlowResult {
  const warnings: string[] = [];
  const warn = (text: string): void => {
    if (!warnings.includes(text)) warnings.push(text);
  };
  const levelNames = new Map(file.levels.map((level) => [level.id, level.name]));
  const levelName = (levelId: string): string => levelNames.get(levelId) ?? levelId;
  const who = (names: string[]): string => (names.length === 1 ? `Riser ${names[0]}` : `Risers ${names.join(', ')}`);
  const verb = (names: string[], singular: string, plural: string): string => (names.length === 1 ? singular : plural);

  const nodeByKey = new Map<string, FlowNode>();
  const nodeOfMember = new Map<RiserMember, string>();

  const resolve = (riser: Riser, member: RiserMember): string => {
    const known = nodeOfMember.get(member);
    if (known !== undefined) return known;
    const level = levelName(member.levelId);
    const missing = (reason: string): string => {
      const key = `missing|${member.sheetId}`;
      if (!nodeByKey.has(key)) {
        nodeByKey.set(key, { key, terminal: 0, hasSource: false, missing: true, levels: [{ id: member.levelId, name: level }] });
      }
      warn(reason);
      nodeOfMember.set(member, key);
      return key;
    };
    const sheet = file.sheets.find((item) => item.id === member.sheetId);
    if (sheet === undefined || sheet.projectUuid === null) return missing(`Level ${level} is not linked to a PDF yet.`);
    const uuid = sheet.projectUuid;
    let data: RiserNetworkSummary[];
    if (live && live.projectUuid === uuid) {
      data = live.riserNetworks;
    } else {
      const summary = summaries.get(uuid);
      if (summary === undefined) return missing(`Level ${level} has no saved summary. Read the summaries.`);
      if (summary.riserNetworks === undefined) {
        return missing(`The summary of level ${level} has no riser data. Read the summaries.`);
      }
      data = summary.riserNetworks;
    }
    const entry = data.find((item) => item.fittingIds.includes(member.fittingId));
    if (entry === undefined) return missing(`Level ${level} has no segment at the riser fitting.`);
    if (entry.networkTypeId !== riser.networkTypeId) {
      warn(`Level ${level} has another network type than riser ${riser.name}.`);
    }
    for (const text of entry.warnings ?? []) warn(`Level ${level}: ${text}`);
    const key = `${uuid}|${entry.fittingIds[0]!}`;
    let node = nodeByKey.get(key);
    if (node === undefined) {
      node = { key, terminal: entry.terminalCapacity, hasSource: entry.hasSource, missing: false, levels: [] };
      nodeByKey.set(key, node);
    }
    if (!node.levels.some((item) => item.id === member.levelId)) node.levels.push({ id: member.levelId, name: level });
    nodeOfMember.set(member, key);
    return key;
  };

  const edges: FlowEdge[] = [];
  for (const riser of file.risers) {
    riserSpans(file, riser)
      .spans.filter(isJoined)
      .forEach((span) => {
        const from = resolve(riser, span.fromMember);
        const to = resolve(riser, span.toMember);
        const out: BuildingFlowSpan = {
          riserId: riser.id,
          fromLevelId: span.fromLevelId,
          toLevelId: span.toLevelId,
          fromFittingId: span.fromMember.fittingId,
          toFittingId: span.toMember.fittingId,
          capacity: null,
          state: 'unknown',
          complete: false,
        };
        edges.push({
          riser,
          from,
          to,
          fromMember: span.fromMember,
          toMember: span.toMember,
          out,
          capacity: 0,
          complete: false,
        });
      });
  }

  const parentOf = new Map<string, string>();
  const rootOf = (key: string): string => {
    let root = key;
    let parent = parentOf.get(root);
    while (parent !== undefined) {
      root = parent;
      parent = parentOf.get(root);
    }
    return root;
  };
  for (const edge of edges) {
    const rootFrom = rootOf(edge.from);
    const rootTo = rootOf(edge.to);
    if (rootFrom !== rootTo) parentOf.set(rootTo, rootFrom);
  }

  const edgesOfRoot = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const root = rootOf(edge.from);
    const list = edgesOfRoot.get(root);
    if (list) list.push(edge);
    else edgesOfRoot.set(root, [edge]);
  }

  const components: FlowComponent[] = [];
  for (const componentEdges of edgesOfRoot.values()) {
    const nodeKeys: string[] = [];
    for (const edge of componentEdges) {
      for (const key of [edge.from, edge.to]) {
        if (!nodeKeys.includes(key)) nodeKeys.push(key);
      }
    }
    const nodes = nodeKeys.map((key) => nodeByKey.get(key)!);
    components.push({
      edges: componentEdges,
      nodes,
      risers: file.risers.filter((riser) => componentEdges.some((edge) => edge.riser === riser)),
      total: nodes.reduce((sum, node) => sum + node.terminal, 0),
      complete: !nodes.some((node) => node.missing),
      state: 'unknown',
      parentEdgeOf: new Map(),
    });
  }

  for (const component of components) {
    const names = component.risers.map((riser) => riser.name);
    if (component.edges.length >= component.nodes.length) {
      warn(`${who(names)} ${verb(names, 'makes', 'make')} a loop. The spans have no number.`);
      continue;
    }
    const handKeys = new Map<string, string>();
    for (const riser of component.risers) {
      const handLevelId = riser.sourceLevelId;
      if (handLevelId === undefined) continue;
      const item = sortedMembers(file, riser).find((candidate) => candidate.member.levelId === handLevelId);
      if (item === undefined) {
        warn(`Riser ${riser.name} has no member on level ${levelName(handLevelId)}. The main level that you set is ignored.`);
        continue;
      }
      const key = nodeOfMember.get(item.member);
      if (key !== undefined && !handKeys.has(key)) handKeys.set(key, handLevelId);
    }
    const hand = [...handKeys];
    if (hand.length > 1) {
      const levelList = hand.map(([, levelId]) => levelName(levelId)).join(', ');
      warn(`${who(names)} ${verb(names, 'has', 'have')} different main levels set by hand (${levelList}). Set one level.`);
      continue;
    }
    const handSet = hand[0];
    if (handSet !== undefined) {
      const [sourceKey, handLevelId] = handSet;
      component.sourceKey = sourceKey;
      component.sourceLevelId = handLevelId;
      component.state = 'ok';
      for (const node of component.nodes) {
        if (node.key === sourceKey || node.missing || !node.hasSource) continue;
        const levelList = node.levels.map((level) => level.name).join(', ');
        warn(`Level ${levelList} has an equipment, but the main level is set by hand to ${levelName(handLevelId)}.`);
      }
      continue;
    }
    const candidates = component.nodes.filter((node) => node.hasSource && !node.missing);
    if (candidates.length === 1) {
      const source = candidates[0]!;
      component.sourceKey = source.key;
      component.sourceLevelId = source.levels[0]!.id;
      component.state = 'ok';
    } else if (candidates.length === 0) {
      warn(`${who(names)} ${verb(names, 'has', 'have')} no source level. Set one by hand.`);
    } else {
      const levelList = candidates.flatMap((node) => node.levels.map((level) => level.name)).join(', ');
      warn(`${who(names)} ${verb(names, 'has', 'have')} more than one source level (${levelList}). Set one by hand.`);
    }
  }

  for (const component of components) {
    const sourceKey = component.sourceKey;
    if (component.state !== 'ok' || sourceKey === undefined) {
      for (const edge of component.edges) {
        edge.out.capacity = null;
        edge.out.state = 'unknown';
        edge.out.complete = component.complete;
      }
      continue;
    }
    const adjacency = new Map<string, FlowEdge[]>();
    for (const edge of component.edges) {
      for (const key of [edge.from, edge.to]) {
        const list = adjacency.get(key);
        if (list) list.push(edge);
        else adjacency.set(key, [edge]);
      }
    }
    const solveBelow = (key: string, cameBy: FlowEdge | undefined): { demand: number; complete: boolean } => {
      const node = nodeByKey.get(key)!;
      let demand = node.terminal;
      let complete = !node.missing;
      for (const edge of adjacency.get(key) ?? []) {
        if (edge === cameBy) continue;
        const child = edge.from === key ? edge.to : edge.from;
        const below = solveBelow(child, edge);
        edge.capacity = below.demand;
        edge.complete = below.complete;
        component.parentEdgeOf.set(child, edge);
        demand += below.demand;
        complete = complete && below.complete;
      }
      return { demand, complete };
    };
    solveBelow(sourceKey, undefined);
    for (const edge of component.edges) {
      edge.out.capacity = edge.capacity;
      edge.out.state = 'ok';
      edge.out.complete = edge.complete;
    }
  }

  const componentOfNode = new Map<string, FlowComponent>();
  for (const component of components) {
    for (const node of component.nodes) componentOfNode.set(node.key, component);
  }

  const result: BuildingFlowResult = { risers: {}, groups: [], warnings };
  for (const riser of file.risers) {
    const members = sortedMembers(file, riser).map(({ member }): BuildingFlowMember => {
      const base = { riserId: riser.id, levelId: member.levelId, sheetId: member.sheetId, fittingId: member.fittingId };
      const key = nodeOfMember.get(member);
      const component = key === undefined ? undefined : componentOfNode.get(key);
      if (key === undefined || component === undefined || component.state !== 'ok' || nodeByKey.get(key)!.missing) {
        return { ...base, role: 'none', capacityIn: null, demandBeyond: null };
      }
      const incident = component.edges.filter((edge) => edge.fromMember === member || edge.toMember === member);
      const parent = component.parentEdgeOf.get(key);
      const demandBeyond = incident.filter((edge) => edge !== parent).reduce((sum, edge) => sum + edge.capacity, 0);
      if (key === component.sourceKey) return { ...base, role: 'source', capacityIn: 0, demandBeyond };
      if (parent !== undefined && incident.includes(parent)) {
        return { ...base, role: 'entry', capacityIn: parent.capacity, demandBeyond };
      }
      return { ...base, role: 'exit', capacityIn: 0, demandBeyond };
    });
    result.risers[riser.id] = { spans: edges.filter((edge) => edge.riser === riser).map((edge) => edge.out), members };
  }

  for (const component of components) {
    result.groups.push({
      riserIds: component.risers.map((riser) => riser.id),
      total: component.total,
      complete: component.complete,
      state: component.state,
      ...(component.sourceLevelId !== undefined ? { sourceLevelId: component.sourceLevelId } : {}),
    });
  }
  return result;
}

export type RiserFlowInput = { role: 'entry' | 'exit'; demandBeyond: number };

/** The inputs of the open sheet for the scene, keyed by riser fitting id. A member with role 'none' gives no key. A source member counts as an exit. */
export function riserFlowInputsOf(result: BuildingFlowResult, sheetId: string): Record<string, RiserFlowInput> {
  const inputs: Record<string, RiserFlowInput> = {};
  for (const riser of Object.values(result.risers)) {
    for (const member of riser.members) {
      if (member.sheetId !== sheetId || member.role === 'none') continue;
      const role = member.role === 'entry' ? 'entry' : 'exit';
      const demandBeyond = member.demandBeyond ?? 0;
      const prior = inputs[member.fittingId];
      if (prior === undefined) {
        inputs[member.fittingId] = { role, demandBeyond };
      } else {
        inputs[member.fittingId] = {
          role: prior.role === 'entry' || role === 'entry' ? 'entry' : 'exit',
          demandBeyond: prior.demandBeyond + demandBeyond,
        };
      }
    }
  }
  return inputs;
}
