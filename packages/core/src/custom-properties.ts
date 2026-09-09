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

/** Custom property values stamped on one placed Terminal/Equipment. */
export type CustomPropertyValues = Record<string, string | number>;

/** Field labels PropertiesPanel already shows for a placed stamp — a custom property can't reuse one of these. */
export const RESERVED_PROPERTY_NAMES = ['x position', 'y position', 'rotation', 'capacity'];

export function isReservedPropertyName(name: string): boolean {
  return RESERVED_PROPERTY_NAMES.includes(name.trim().toLowerCase());
}

export function coerceDefaultValue(definition: CustomPropertyDefinition): string | number {
  if (definition.kind === 'numeric') {
    const parsed = Number(definition.defaultValue);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return definition.defaultValue;
}
