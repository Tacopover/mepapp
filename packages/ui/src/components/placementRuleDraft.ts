import {
  BUILT_IN_NEEDS,
  CAPACITY_UNITS,
  CEILING_GRID_SIZES_MM,
  parseDecimal,
  type GridEdge,
  type GridStyle,
  type LengthUnit,
  type PlacementCountMode,
  type PlacementRule,
  type RoomNeed,
} from '@mepapp/core';

// The text draft of one placement rule in the guide (PlacementRuleGuideBody): the boxes hold text,
// and ruleOf turns the draft into a rule.

export const newRuleId = () => `rule-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The value of the Custom item of a list, for example the ceiling grid size. */
export const OTHER_UNIT = '__other';

export function blankRule(name: string): PlacementRule {
  return {
    id: newRuleId(),
    name,
    discipline: 'ventilation',
    roomTypeIds: [],
    stampDefinitionId: null,
    countBy: 'need',
    needId: 'supplyAir',
    unit: 'dm³/s',
    coverage: {},
    layout: { strategy: 'center', wallOffsetM: 0.5, rotation: 'room' },
    writeCapacity: true,
  };
}

export function uniqueName(base: string, rules: readonly PlacementRule[]): string {
  const taken = new Set(rules.map((r) => r.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

const text = (n: number | undefined) => (n === undefined ? '' : String(n));

export function draftOf(rule: PlacementRule) {
  return {
    name: rule.name,
    discipline: rule.discipline,
    roomTypeIds: rule.roomTypeIds,
    nameContains: rule.nameContains ?? '',
    stampDefinitionId: rule.stampDefinitionId,
    countBy: rule.countBy,
    needId: rule.needId ?? '',
    capacity: text(rule.capacityPerElement),
    unit: rule.unit ?? '',
    perRoomCount: String(rule.perRoomCount ?? 1),
    uf: text(rule.luminaire?.utilisationFactor),
    mf: text(rule.luminaire?.maintenanceFactor),
    ufMode: (rule.luminaire?.ufTable ? 'table' : 'fixed') as 'fixed' | 'table',
    ufTable: (rule.luminaire?.ufTable ?? []).map((pt) => ({ k: String(pt.k), uf: String(pt.uf) })),
    suspension: text(rule.luminaire?.suspensionM),
    maxSpacing: text(rule.coverage.maxSpacing),
    maxArea: text(rule.coverage.maxAreaPerElement),
    maxWall: text(rule.coverage.maxWallDistance),
    maxRadius: text(rule.coverage.maxRadius),
    alsoCoverage: rule.alsoCoverage === true,
    lengthUnit: (rule.coverage.lengthUnit ?? 'm') as LengthUnit,
    minCount: text(rule.minCount),
    maxCount: text(rule.maxCount),
    strategy: rule.layout.strategy,
    gridStyle: (rule.layout.gridStyle ?? 'spread') as GridStyle,
    edge: (rule.layout.edge ?? 'halfSpacing') as GridEdge,
    ceilingGrid: rule.layout.ceilingGridMm !== undefined,
    ceilingGridMm: String(rule.layout.ceilingGridMm ?? 600),
    /** The size box shows instead of the list: the size is not in CEILING_GRID_SIZES_MM, or the user chose Custom. */
    ceilingGridCustom: rule.layout.ceilingGridMm !== undefined && !CEILING_GRID_SIZES_MM.includes(rule.layout.ceilingGridMm),
    wallOffset: String(rule.layout.wallOffsetM),
    minSpacing: text(rule.layout.minSpacingM),
    rotation: rule.layout.rotation,
    fixedAngle: text(rule.layout.fixedAngleDeg),
    writeCapacity: rule.writeCapacity,
    routingTarget: rule.routingTarget ?? '',
    portRoutingTargets: (rule.portRoutingTargets ?? null) as Record<string, string | null> | null,
    networkTypeCopies: rule.networkTypeCopies ?? [],
  };
}

export type Draft = ReturnType<typeof draftOf>;

/** The other draft fields that change with the way of counting: By coverage uses Even spread. */
export function countByPatch(countBy: PlacementCountMode): Partial<Draft> {
  return { countBy, ...(countBy === 'coverage' ? { strategy: 'evenSpread' as const } : {}) };
}

/** The other draft fields that change with the need: a unit that the need offers, and the factors of a luminaire. */
export function needPatch(draft: Draft, need: RoomNeed): Partial<Draft> {
  const units = CAPACITY_UNITS[need.kind];
  return {
    countBy: 'need',
    needId: need.id,
    unit: units.includes(draft.unit) ? draft.unit : (units[0] ?? ''),
    ...(need.kind === 'light' ? { uf: draft.uf || '0.6', mf: draft.mf || '0.8' } : {}),
  };
}

/** True when a stamp of the need can write the amount per stamp as its capacity: a flow, a power or another amount. */
export const needWritesCapacity = (need: Pick<RoomNeed, 'kind'> | undefined) => need !== undefined && (need.kind === 'flow' || need.kind === 'power' || need.kind === 'amount');

export class FieldError extends Error {}

/** A typed number, or undefined for an empty box. Throws a FieldError for text that is not a number. */
export function numberOf(value: string, label: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = parseDecimal(value);
  if (parsed === null) throw new FieldError(`${label}: "${value}" is not a number.`);
  return parsed;
}

/** The rule of the draft. `needs` are the built-in needs and the own needs: the kind of the need sets the unit and the luminaire. */
export function ruleOf(id: string, d: Draft, needs: readonly RoomNeed[] = BUILT_IN_NEEDS): PlacementRule {
  const rule: PlacementRule = {
    id,
    name: d.name.trim(),
    discipline: d.discipline,
    roomTypeIds: d.roomTypeIds,
    stampDefinitionId: d.stampDefinitionId,
    countBy: d.countBy,
    coverage: {},
    layout: { strategy: d.strategy, wallOffsetM: numberOf(d.wallOffset, 'Min distance to the walls') ?? 0, rotation: d.rotation },
    writeCapacity: d.writeCapacity,
  };
  if (d.nameContains.trim()) rule.nameContains = d.nameContains.trim();
  if (d.countBy === 'need') {
    const need = needs.find((n) => n.id === d.needId);
    if (d.needId) rule.needId = d.needId;
    const capacity = numberOf(d.capacity, 'What one stamp gives');
    if (capacity !== undefined) rule.capacityPerElement = capacity;
    if (need && CAPACITY_UNITS[need.kind].includes(d.unit)) rule.unit = d.unit;
    if (!needWritesCapacity(need)) rule.writeCapacity = false;
    if (need?.kind === 'light') {
      const uf = d.ufMode === 'fixed' ? numberOf(d.uf, 'Utilisation factor') : (numberOf(d.uf, 'Utilisation factor') ?? 0.6);
      const mf = numberOf(d.mf, 'Maintenance factor');
      if (uf === undefined || mf === undefined) throw new FieldError('Enter the utilisation factor and the maintenance factor.');
      rule.luminaire = { utilisationFactor: uf, maintenanceFactor: mf };
      if (d.ufMode === 'table') {
        const rows = d.ufTable.filter((row) => row.k.trim() !== '' || row.uf.trim() !== '');
        rule.luminaire.ufTable = rows.map((row, i) => {
          const k = numberOf(row.k, `Room index in row ${i + 1}`);
          const value = numberOf(row.uf, `UF in row ${i + 1}`);
          if (k === undefined || value === undefined) throw new FieldError(`Enter the room index and the UF in row ${i + 1} of the UF table.`);
          return { k, uf: value };
        });
        const suspension = numberOf(d.suspension, 'Suspension');
        if (suspension !== undefined) rule.luminaire.suspensionM = suspension;
      }
    }
  } else if (d.countBy === 'perRoom') {
    rule.perRoomCount = numberOf(d.perRoomCount, 'Stamps in each room') ?? 1;
    rule.writeCapacity = false;
  } else rule.writeCapacity = false;
  const minSpacing = numberOf(d.minSpacing, 'Min distance between stamps');
  if (minSpacing !== undefined) rule.layout.minSpacingM = minSpacing;
  if (d.strategy === 'grid' && d.gridStyle !== 'spread') rule.layout.gridStyle = d.gridStyle;
  if (d.strategy === 'grid' && d.edge === 'wall') rule.layout.edge = 'wall';
  if (d.ceilingGrid && d.strategy !== 'perimeter') {
    const size = numberOf(d.ceilingGridMm, 'Ceiling grid size');
    if (size === undefined) throw new FieldError('Enter the size of the ceiling grid.');
    rule.layout.ceilingGridMm = size;
  }
  if (d.lengthUnit === 'ft') rule.coverage.lengthUnit = 'ft';
  const optional: [keyof PlacementRule | keyof PlacementRule['coverage'], string, string, 'rule' | 'coverage'][] = [
    ['minCount', d.minCount, 'Min count', 'rule'],
    ['maxCount', d.maxCount, 'Max count', 'rule'],
    ['maxSpacing', d.maxSpacing, 'Max spacing', 'coverage'],
    ['maxAreaPerElement', d.maxArea, 'Max area per element', 'coverage'],
    ['maxWallDistance', d.maxWall, 'Max distance to a wall', 'coverage'],
    ['maxRadius', d.maxRadius, 'Max radius', 'coverage'],
  ];
  for (const [key, value, label, target] of optional) {
    const n = numberOf(value, label);
    if (n !== undefined) (target === 'rule' ? (rule as unknown as Record<string, unknown>) : (rule.coverage as Record<string, unknown>))[key] = n;
  }
  if (d.alsoCoverage && d.countBy !== 'coverage') rule.alsoCoverage = true;
  if (d.rotation === 'fixed') {
    const angle = numberOf(d.fixedAngle, 'Fixed angle');
    if (angle !== undefined) rule.layout.fixedAngleDeg = angle;
  }
  if (d.routingTarget) rule.routingTarget = d.routingTarget;
  if (d.portRoutingTargets) rule.portRoutingTargets = { ...d.portRoutingTargets };
  if (d.networkTypeCopies.length > 0) rule.networkTypeCopies = d.networkTypeCopies.map((t) => ({ ...t }));
  return rule;
}
