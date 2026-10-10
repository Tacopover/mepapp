import {
  isAirChangeUnit,
  parseDecimal,
  PLACEMENT_PRESET_HELP,
  PRESET_AMOUNT_FIELDS,
  type AreaUnit,
  type GridStyle,
  type IlluminanceUnit,
  type LengthUnit,
  type PlacementPreset,
  type PlacementRule,
} from '@mepapp/core';

// The text draft of one placement rule, shared by the rule form (PlacementRulesDialog) and the
// guide (PlacementRuleGuide): the boxes hold text, and ruleOf turns the draft into a rule.

export const newRuleId = () => `rule-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const AMOUNT_FIELD_LABELS: Record<(typeof PRESET_AMOUNT_FIELDS)[PlacementPreset][number], string> = {
  fixed: 'Per room',
  perM2: 'Per m² floor area',
  perPerson: 'Per person',
  perM3: 'Per m³ volume (air changes)',
  minimum: 'Minimum per room',
};

export const OTHER_UNIT = '__other';

/** The explanation of a preset as one text, for a tooltip. */
export const presetHelpText = (preset: PlacementPreset): string => {
  const help = PLACEMENT_PRESET_HELP[preset];
  return [help.formula, ...help.symbols.map((s) => `${s.symbol}: ${s.text}`), ...(help.note ? [help.note] : [])].join('\n');
};

export function blankRule(name: string): PlacementRule {
  return {
    id: newRuleId(),
    name,
    discipline: 'ventilation',
    roomTypeIds: [],
    stampDefinitionId: null,
    preset: 'perArea',
    amount: { unit: 'dm³/s' },
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
    preset: rule.preset,
    fixed: text(rule.amount.fixed),
    perM2: text(rule.amount.perM2),
    perPerson: text(rule.amount.perPerson),
    perM3: text(rule.amount.perM3),
    minimum: text(rule.amount.minimum),
    unit: rule.amount.unit,
    areaUnit: (rule.amount.areaUnit ?? 'm2') as AreaUnit,
    lux: text(rule.lighting?.lux),
    uf: text(rule.lighting?.utilisationFactor),
    mf: text(rule.lighting?.maintenanceFactor),
    illuminanceUnit: (rule.lighting?.illuminanceUnit ?? 'lx') as IlluminanceUnit,
    capacity: text(rule.capacityPerElement),
    maxSpacing: text(rule.coverage.maxSpacing),
    maxArea: text(rule.coverage.maxAreaPerElement),
    maxWall: text(rule.coverage.maxWallDistance),
    lengthUnit: (rule.coverage.lengthUnit ?? 'm') as LengthUnit,
    minCount: text(rule.minCount),
    maxCount: text(rule.maxCount),
    strategy: rule.layout.strategy,
    gridStyle: (rule.layout.gridStyle ?? 'spread') as GridStyle,
    wallOffset: String(rule.layout.wallOffsetM),
    minSpacing: text(rule.layout.minSpacingM),
    rotation: rule.layout.rotation,
    fixedAngle: text(rule.layout.fixedAngleDeg),
    writeCapacity: rule.writeCapacity,
  };
}

export type Draft = ReturnType<typeof draftOf>;

/** The other draft fields that change with the preset: an air-changes rule needs a flow unit, and By coverage uses Even spread. */
export function presetPatch(draft: Draft, preset: PlacementPreset): Partial<Draft> {
  return { preset, unit: preset === 'airChanges' && !isAirChangeUnit(draft.unit) ? 'm³/h' : draft.unit, ...(preset === 'coverage' ? { strategy: 'evenSpread' as const } : {}) };
}

export class FieldError extends Error {}

/** A typed number, or undefined for an empty box. Throws a FieldError for text that is not a number. */
export function numberOf(value: string, label: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = parseDecimal(value);
  if (parsed === null) throw new FieldError(`${label}: "${value}" is not a number.`);
  return parsed;
}

export function ruleOf(id: string, d: Draft): PlacementRule {
  const shown = new Set(PRESET_AMOUNT_FIELDS[d.preset]);
  const amount: PlacementRule['amount'] = { unit: d.preset === 'lighting' ? 'lm' : d.unit.trim() };
  for (const key of ['fixed', 'perM2', 'perPerson', 'perM3', 'minimum'] as const) {
    const value = shown.has(key) ? numberOf(d[key], AMOUNT_FIELD_LABELS[key]) : undefined;
    if (value !== undefined) amount[key] = value;
  }
  if (shown.has('perM2') && d.areaUnit === 'ft2') amount.areaUnit = 'ft2';
  const rule: PlacementRule = {
    id,
    name: d.name.trim(),
    discipline: d.discipline,
    roomTypeIds: d.roomTypeIds,
    stampDefinitionId: d.stampDefinitionId,
    preset: d.preset,
    amount,
    coverage: {},
    layout: { strategy: d.strategy, wallOffsetM: numberOf(d.wallOffset, 'Min distance to the walls') ?? 0, rotation: d.rotation },
    writeCapacity: d.writeCapacity,
  };
  if (d.nameContains.trim()) rule.nameContains = d.nameContains.trim();
  const minSpacing = numberOf(d.minSpacing, 'Min distance between stamps');
  if (minSpacing !== undefined) rule.layout.minSpacingM = minSpacing;
  if (d.strategy === 'grid' && d.gridStyle !== 'spread') rule.layout.gridStyle = d.gridStyle;
  if (d.lengthUnit === 'ft') rule.coverage.lengthUnit = 'ft';
  if (d.preset === 'lighting') {
    const lux = numberOf(d.lux, 'Illuminance');
    const uf = numberOf(d.uf, 'Utilisation factor');
    const mf = numberOf(d.mf, 'Maintenance factor');
    if (lux === undefined || uf === undefined || mf === undefined) throw new FieldError('Enter the illuminance, the utilisation factor and the maintenance factor.');
    rule.lighting = { lux, utilisationFactor: uf, maintenanceFactor: mf };
    if (d.illuminanceUnit === 'fc') rule.lighting.illuminanceUnit = 'fc';
  }
  const optional: [keyof PlacementRule | keyof PlacementRule['coverage'], string, string, 'rule' | 'coverage'][] = [
    ['capacityPerElement', d.capacity, 'Capacity per element', 'rule'],
    ['minCount', d.minCount, 'Min count', 'rule'],
    ['maxCount', d.maxCount, 'Max count', 'rule'],
    ['maxSpacing', d.maxSpacing, 'Max spacing', 'coverage'],
    ['maxAreaPerElement', d.maxArea, 'Max area per element', 'coverage'],
    ['maxWallDistance', d.maxWall, 'Max distance to a wall', 'coverage'],
  ];
  for (const [key, value, label, target] of optional) {
    const n = numberOf(value, label);
    if (n !== undefined) (target === 'rule' ? (rule as unknown as Record<string, unknown>) : (rule.coverage as Record<string, unknown>))[key] = n;
  }
  if (d.rotation === 'fixed') {
    const angle = numberOf(d.fixedAngle, 'Fixed angle');
    if (angle !== undefined) rule.layout.fixedAngleDeg = angle;
  }
  return rule;
}
