// Global (per-installation, not per-document) custom property definitions —
// user-added fields on placed Terminal/Equipment stamps, shared across every
// document. Same concept as the old app's Global Properties dialog; Segment
// and Fitting tabs are deferred (their edits are undo-tracked via
// CommandManager, unlike stamps, and need a dedicated command).

export type CustomPropertyKind = 'text' | 'numeric';

export interface CustomPropertyDefinition {
  name: string;
  kind: CustomPropertyKind;
  /** Stored as a string (matches the old app's invariant-culture storage) — parsed to a number at use time for a numeric definition. */
  defaultValue: string;
}

/** Every per-installation custom property definition, one list per scope — edited in the Global Properties dialog. */
export interface GlobalPropertyDefs {
  terminal: CustomPropertyDefinition[];
  equipment: CustomPropertyDefinition[];
  circuit: CustomPropertyDefinition[];
  room: CustomPropertyDefinition[];
}

/** Custom property values stamped on one placed Terminal/Equipment. */
export type CustomPropertyValues = Record<string, string | number>;

/** Field labels PropertiesPanel already shows for a placed stamp — a custom property can't reuse one of these. */
export const RESERVED_PROPERTY_NAMES = ['x position', 'y position', 'rotation', 'capacity'];

export function isReservedPropertyName(name: string): boolean {
  return RESERVED_PROPERTY_NAMES.includes(name.trim().toLowerCase());
}

/** Field labels the Circuit Properties view already shows — a custom circuit property can't reuse one of these. */
export const RESERVED_CIRCUIT_PROPERTY_NAMES = [
  'panel',
  'section',
  'number',
  'custom name',
  'prefix',
  'circuit type',
  'phase',
  'diversity %',
  'kind',
  'curve',
  'rating (a)',
  'rcd (ma)',
  'type',
  'core count',
  'cross-section (mm²)',
  'length (m)',
];

export function isReservedCircuitPropertyName(name: string): boolean {
  return RESERVED_CIRCUIT_PROPERTY_NAMES.includes(name.trim().toLowerCase());
}

/** Field labels the Room Properties view and the Excel export already use — a custom room property can't reuse one of these. */
export const RESERVED_ROOM_PROPERTY_NAMES = ['number', 'name', 'area', 'area (m²)', 'area in drawing', 'area in drawing (m²)', 'page', 'source', 'needs review', 'details', 'room type'];

export function isReservedRoomPropertyName(name: string): boolean {
  return RESERVED_ROOM_PROPERTY_NAMES.includes(name.trim().toLowerCase());
}

/** A typed number with "." or "," as the decimal separator (the UI is used in Dutch and English). Null for empty text, or text that is not one finite number — including text with both separators, which is ambiguous. */
export function parseDecimal(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed.includes('.') ? trimmed : trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function coerceDefaultValue(definition: CustomPropertyDefinition): string | number {
  if (definition.kind === 'numeric') {
    return parseDecimal(definition.defaultValue) ?? 0;
  }
  return definition.defaultValue;
}
