// Schematic generator (electrical-schematic-templates.md §9): a pure function
// from one panel, its circuits and a template to a flat list of resolved
// blocks. No rendering, no I/O. One panel per call — a sheet with several
// panels calls this once per panel with a different `origin`.

import {
  getEffectiveCable,
  getEffectiveCircuitTypeId,
  getEffectiveDevice,
  getEffectiveDiversityPercent,
  getEffectivePhase,
  getEffectivePrefix,
  type Circuit,
  type CircuitType,
  type Panel,
  type PanelSection,
} from './circuit.js';
import {
  ExpressionError,
  evaluateExpression,
  formatValue,
  parseBinding,
  parseExpression,
  renderBinding,
  type ExprValue,
  type ParsedBinding,
  type ParsedExpression,
} from './schematic-expression.js';
import {
  SCHEMATIC_BLOCK_CATALOGUE,
  getBlockBindingSource,
  getBlockHeight,
  getBlockWidth,
  type CircuitGroupDefinition,
  type CircuitGroupRule,
  type SchematicBlock,
  type SchematicBlockScope,
  type SchematicBlockStyle,
  type SchematicBlockType,
  type SchematicTemplate,
} from './schematic-template.js';

/** What the generator needs to know about one terminal. The caller builds it from the placed stamp and `terminalCapacities`. */
export interface SchematicTerminalInfo {
  label?: string;
  capacity: number;
  /** Grouping key for the per-load-type cells (a block's `loadTypeFilter`). Where it comes from is plan open question 5. */
  loadType?: string;
  /** The stamp definition to draw for a loadSymbol block. */
  stampDefinitionId?: string;
}

export interface SchematicInput {
  panel: Panel;
  /** Every circuit of the document; the generator keeps the ones in `panel`. */
  circuits: Circuit[];
  /** Every section of the document; the generator keeps the ones in `panel`. */
  sections: PanelSection[];
  /** By terminal id. */
  terminals: Record<string, SchematicTerminalInfo>;
  circuitTypes?: CircuitType[];
}

export interface ResolvedTable {
  columns: 'panel' | 'circuits';
  rows: { label: string; values: string[] }[];
}

export interface ResolvedBlock {
  /** Stable across regenerations: "<panelId>/<circuitId | sectionId | ->/<template block id>". User-drawn extras link to it. */
  id: string;
  templateBlockId: string;
  groupId?: string;
  type: SchematicBlockType;
  scope: SchematicBlockScope;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** Resolved binding. undefined when the block has no binding. */
  text?: string;
  style?: SchematicBlockStyle;
  symbolId?: string;
  /** loadSymbol only: the first assigned terminal that names a stamp definition. */
  loadStampDefinitionId?: string;
  table?: ResolvedTable;
  panelId: string;
  circuitId?: string;
  sectionId?: string;
}

export type SchematicDiagnostic =
  | { kind: 'no-matching-group'; circuitId: string }
  | { kind: 'binding-error'; blockId: string; message: string };

export interface GeneratedSchematic {
  blocks: ResolvedBlock[];
  /** Ids of the circuits that got a group, in layout order. Spares are included. */
  circuitOrder: string[];
  /** Sheet position of each laid-out circuit's group origin, for user-drawn extras that follow their circuit. */
  circuitOrigins: Record<string, { x: number; y: number }>;
  diagnostics: SchematicDiagnostic[];
}

export interface GenerateOptions {
  /** Added to every block position. Default 0,0. */
  origin?: { x: number; y: number };
}

/** A panel's circuits in layout order: by section order (circuits without a section last), then by number, ascending or descending per `panel.sortDirection`. */
export function orderPanelCircuits(panel: Panel, circuits: Circuit[], sections: PanelSection[]): Circuit[] {
  const rank = new Map<string, number>();
  sections
    .filter((s) => s.panelId === panel.id)
    .sort((a, b) => a.order - b.order)
    .forEach((s, index) => rank.set(s.id, index));
  const sectionRank = (c: Circuit) => (c.sectionId !== undefined ? (rank.get(c.sectionId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER);
  const sign = panel.sortDirection === 'descending' ? -1 : 1;
  return circuits.filter((c) => c.panelId === panel.id).sort((a, b) => sectionRank(a) - sectionRank(b) || sign * (a.number - b.number));
}

export function circuitMatchesRule(rule: CircuitGroupRule, circuit: Circuit, effectiveCircuitTypeId: string | undefined): boolean {
  switch (rule.kind) {
    case 'any':
      return true;
    case 'spare':
      return circuit.isSpare;
    case 'circuitType':
      return !circuit.isSpare && effectiveCircuitTypeId !== undefined && rule.circuitTypeIds.includes(effectiveCircuitTypeId);
    case 'circuitNumber':
      return !circuit.isSpare && rule.numbers.includes(circuit.number);
  }
}

/** The share of `value` that falls on one line: a three-phase circuit splits it three ways, L1L2 two ways, no phase set none. */
function phaseShare(phase: Circuit['phase'], line: 'L1' | 'L2' | 'L3', value: number): number {
  const lines: string[] = phase?.match(/L\d/g) ?? [];
  return lines.includes(line) ? value / lines.length : 0;
}

function deviceLabel(device: NonNullable<Circuit['device']>): string {
  const base = `${device.curve ?? ''}${device.ratingA ?? ''}`;
  return device.rcdMilliamps !== undefined ? `${base}/${device.rcdMilliamps}mA` : base;
}

interface CircuitFacts {
  circuit: Circuit;
  terminals: SchematicTerminalInfo[];
  /** The `circuit`, `device`, `cable`, `circuitType` and `section` parts of the binding context. */
  fields: { circuit: Record<string, unknown> } & Record<string, unknown>;
  circuitTypeId: string | undefined;
}

interface PlacedCircuit {
  facts: CircuitFacts;
  group: CircuitGroupDefinition;
  /** Distance along the repeat direction from the first circuit's origin. */
  offset: number;
}

export function generateSchematic(input: SchematicInput, template: SchematicTemplate, options: GenerateOptions = {}): GeneratedSchematic {
  const { panel } = input;
  const origin = options.origin ?? { x: 0, y: 0 };
  const format = template.numberFormat;
  const diagnostics: SchematicDiagnostic[] = [];
  const blocks: ResolvedBlock[] = [];

  const parseCaches = { binding: new Map<string, ParsedBinding | ExpressionError>(), expression: new Map<string, ParsedExpression | ExpressionError>() };
  const parseOnce = <T>(cache: Map<string, T | ExpressionError>, source: string, parse: (s: string) => T): T | ExpressionError => {
    let entry = cache.get(source);
    if (entry === undefined) {
      try {
        entry = parse(source);
      } catch (error) {
        if (!(error instanceof ExpressionError)) throw error;
        entry = error;
      }
      cache.set(source, entry);
    }
    return entry;
  };

  const resolveText = (block: SchematicBlock, context: unknown): string | undefined => {
    const source = getBlockBindingSource(block);
    if (source === undefined || source === '') return undefined;
    const parsed = parseOnce(parseCaches.binding, source, parseBinding);
    if (parsed instanceof ExpressionError) {
      diagnostics.push({ kind: 'binding-error', blockId: block.id, message: parsed.message });
      return '';
    }
    return renderBinding(parsed, context, format);
  };

  const sectionsById = new Map(input.sections.filter((s) => s.panelId === panel.id).map((s) => [s.id, s]));

  const facts: CircuitFacts[] = orderPanelCircuits(panel, input.circuits, input.sections).map((circuit) => {
    const terminals = circuit.terminalIds.map((id) => input.terminals[id]).filter((t): t is SchematicTerminalInfo => t !== undefined);
    const capacity = terminals.reduce((sum, t) => sum + t.capacity, 0);
    const diversity = getEffectiveDiversityPercent(circuit, panel);
    const phase = getEffectivePhase(circuit, panel);
    const device = getEffectiveDevice(circuit, panel);
    const circuitTypeId = getEffectiveCircuitTypeId(circuit, panel);
    return {
      circuit,
      terminals,
      circuitTypeId,
      fields: {
        circuit: {
          prefix: getEffectivePrefix(circuit, panel),
          number: circuit.number,
          customName: circuit.customName,
          phase,
          diversityPercent: diversity,
          isSpare: circuit.isSpare,
          capacity,
          diversifiedCapacity: (capacity * diversity) / 100,
          capacityL1: phaseShare(phase, 'L1', capacity),
          capacityL2: phaseShare(phase, 'L2', capacity),
          capacityL3: phaseShare(phase, 'L3', capacity),
          properties: circuit.properties ?? {},
        },
        device: device ? { ...device, label: deviceLabel(device) } : undefined,
        cable: getEffectiveCable(circuit, panel),
        circuitType: input.circuitTypes?.find((t) => t.id === circuitTypeId),
        section: circuit.sectionId !== undefined ? sectionsById.get(circuit.sectionId) : undefined,
      },
    };
  });

  const liveFacts = facts.filter((f) => !f.circuit.isSpare);
  const panelFields = {
    name: panel.name,
    mainDevice: panel.mainDevice,
    feederCable: panel.feederCable,
    accessories: panel.accessories,
    capacity: facts.reduce((sum, f) => sum + (f.fields.circuit.capacity as number), 0),
    circuitCount: liveFacts.length,
    spareCount: facts.length - liveFacts.length,
  };

  const filterTerminals = (terminals: SchematicTerminalInfo[], block: SchematicBlock) =>
    block.loadTypeFilter === undefined ? terminals : terminals.filter((t) => t.loadType === block.loadTypeFilter);
  const circuitContext = (f: CircuitFacts, block: SchematicBlock) => {
    const terminals = filterTerminals(f.terminals, block);
    return { ...f.fields, panel: panelFields, terminals, terminal: terminals };
  };
  const aggregateContext = (block: SchematicBlock) => {
    const terminals = filterTerminals(
      liveFacts.flatMap((f) => f.terminals),
      block,
    );
    const live = liveFacts.map((f) => f.fields.circuit);
    return { panel: panelFields, circuit: live, circuits: live, spares: facts.filter((f) => f.circuit.isSpare).map((f) => f.fields.circuit), terminals, terminal: terminals };
  };

  // Layout: each matched circuit advances the cursor by its own group's pitch.
  const axis = template.groups[0]?.direction ?? 'column';
  const placed: PlacedCircuit[] = [];
  let cursor = 0;
  for (const f of facts) {
    const group = template.groups.find((g) => circuitMatchesRule(g.rule, f.circuit, f.circuitTypeId));
    if (!group) {
      diagnostics.push({ kind: 'no-matching-group', circuitId: f.circuit.id });
      continue;
    }
    placed.push({ facts: f, group, offset: cursor });
    cursor += group.pitch;
  }
  const anchor = { x: origin.x + template.groupAnchor.x, y: origin.y + template.groupAnchor.y };
  const offsetPoint = (offset: number) => ({ x: anchor.x + (axis === 'row' ? offset : 0), y: anchor.y + (axis === 'column' ? offset : 0) });

  const emit = (
    block: SchematicBlock,
    scope: SchematicBlockScope,
    at: { x: number; y: number },
    context: unknown,
    ids: { scopeId: string; groupId?: string; circuitId?: string; sectionId?: string },
    size?: { width: number; height: number },
  ): ResolvedBlock => {
    const resolved: ResolvedBlock = {
      id: `${panel.id}/${ids.scopeId}/${block.id}`,
      templateBlockId: block.id,
      groupId: ids.groupId,
      type: block.type,
      scope,
      x: at.x + block.x,
      y: at.y + block.y,
      width: size?.width ?? getBlockWidth(block),
      height: size?.height ?? getBlockHeight(block),
      rotation: block.rotation,
      text: resolveText(block, context),
      style: block.style,
      symbolId: block.symbolId,
      panelId: panel.id,
      circuitId: ids.circuitId,
      sectionId: ids.sectionId,
    };
    blocks.push(resolved);
    return resolved;
  };

  const resolveTable = (block: SchematicBlock): ResolvedTable => {
    const columns = block.tableColumns ?? 'panel';
    const aggregate = aggregateContext(block);
    const rows = (block.tableRows ?? []).map((row) => {
      const parsed = parseOnce(parseCaches.expression, row.formula, parseExpression);
      if (parsed instanceof ExpressionError) {
        diagnostics.push({ kind: 'binding-error', blockId: block.id, message: parsed.message });
        return { label: row.label, values: [''] };
      }
      const show = (value: ExprValue) => formatValue(value, format);
      const values = columns === 'circuits' ? placed.map((p) => show(evaluateExpression(parsed, circuitContext(p.facts, block)))) : [show(evaluateExpression(parsed, aggregate))];
      return { label: row.label, values };
    });
    return { columns, rows };
  };

  /** A busbar with no size on the repeat axis covers every circuit, overhanging both ends by the gap between its start and the group anchor. */
  const busbarSize = (block: SchematicBlock) => {
    if (block.type !== 'busbar' || placed.length === 0) return undefined;
    const alongRow = axis === 'row';
    if ((alongRow ? block.width : block.height) !== undefined) return undefined;
    const overhang = Math.max((alongRow ? template.groupAnchor.x - block.x : template.groupAnchor.y - block.y), 0);
    const length = cursor + overhang * 2;
    return alongRow ? { width: length, height: getBlockHeight(block) } : { width: getBlockWidth(block), height: length };
  };

  for (const block of template.layoutBlocks) {
    const info = SCHEMATIC_BLOCK_CATALOGUE[block.type];
    if (!info) continue;
    if (info.scope === 'section') {
      const seen = new Set<string>();
      for (const p of placed) {
        const sectionId = p.facts.circuit.sectionId;
        const section = sectionId !== undefined ? sectionsById.get(sectionId) : undefined;
        if (!section || seen.has(section.id)) continue;
        seen.add(section.id);
        const members = placed.filter((q) => q.facts.circuit.sectionId === section.id);
        const last = members[members.length - 1];
        const span = last.offset + last.group.pitch - p.offset;
        const size = axis === 'row' ? { width: span, height: getBlockHeight(block) } : { width: getBlockWidth(block), height: span };
        emit(block, 'section', offsetPoint(p.offset), { panel: panelFields, section }, { scopeId: section.id, sectionId: section.id }, size);
      }
      continue;
    }
    const context = info.scope === 'aggregate' ? aggregateContext(block) : { panel: panelFields };
    const resolved = emit(block, info.scope, origin, context, { scopeId: '-' }, busbarSize(block));
    if (block.type === 'totalsTable') resolved.table = resolveTable(block);
  }

  const circuitOrigins: Record<string, { x: number; y: number }> = {};
  for (const p of placed) {
    const at = offsetPoint(p.offset);
    circuitOrigins[p.facts.circuit.id] = at;
    for (const block of p.group.blocks) {
      if (block.type === 'loadSymbol' && p.facts.terminals.length === 0) continue;
      const resolved = emit(block, 'circuit', at, circuitContext(p.facts, block), { scopeId: p.facts.circuit.id, groupId: p.group.id, circuitId: p.facts.circuit.id });
      if (block.type === 'loadSymbol') resolved.loadStampDefinitionId = p.facts.terminals.find((t) => t.stampDefinitionId !== undefined)?.stampDefinitionId;
    }
  }

  return { blocks, circuitOrder: placed.map((p) => p.facts.circuit.id), circuitOrigins, diagnostics };
}
