// Template fields (electrical-schematic-templates.md Phase 5b): values that the user fills in per
// project or per schematic and that blocks read as {field.<id>}. Pure functions, no I/O.

import { ExpressionError, parseBinding, renderBinding, type ExprValue, type NumberFormat } from './schematic-expression.js';
import type { SchematicFieldDefinition, SchematicTemplate } from './schematic-template.js';

export interface FieldValueSources {
  /** By field id. Values of fields with scope `project`, shared by every schematic of the project. */
  projectValues?: Record<string, string>;
  /** By field id. Values of fields with scope `schematic`. */
  schematicValues?: Record<string, string>;
  /** Today as YYYY-MM-DD. Left out means a "today" default gives an empty value. */
  today?: string;
}

export interface ResolvedField {
  id: string;
  label: string;
  type: SchematicFieldDefinition['type'];
  scope: SchematicFieldDefinition['scope'];
  /** The value the user entered, as text. undefined = none entered, so the default applies. */
  stored?: string;
  /** What the field shows when no value is entered, as text (a date in YYYY-MM-DD). */
  defaultText: string;
  /** stored, or the default when nothing is stored. */
  value: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A YYYY-MM-DD date in the template's date format. Text that is not such a date stays as it is. */
export function formatDateValue(iso: string, format: SchematicTemplate['dateFormat'] = 'dd-mm-yyyy'): string {
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  return format === 'yyyy-mm-dd' ? iso : `${match[3]}-${match[2]}-${match[1]}`;
}

/** The value that an expression sees: a number field gives a number when its text is one, a date field gives the formatted date. */
export function fieldExpressionValue(type: SchematicFieldDefinition['type'], text: string, dateFormat: SchematicTemplate['dateFormat']): ExprValue {
  if (type === 'number') {
    const number = Number(text.trim().replace(',', '.'));
    return text.trim() !== '' && Number.isFinite(number) ? number : text;
  }
  if (type === 'date') return formatDateValue(text, dateFormat);
  return text;
}

function defaultTextOf(definition: SchematicFieldDefinition, panelContext: unknown, format: NumberFormat, today: string | undefined): string {
  if (definition.type === 'date' && definition.defaultToday) return today ?? '';
  if (!definition.defaultBinding) return '';
  try {
    return renderBinding(parseBinding(definition.defaultBinding), panelContext, format);
  } catch (error) {
    if (error instanceof ExpressionError) return '';
    throw error;
  }
}

/** Resolves every field of the template. `values` is what blocks read as `field`. */
export function resolveFields(
  template: SchematicTemplate,
  sources: FieldValueSources,
  panelContext: unknown,
): { fields: ResolvedField[]; values: Record<string, ExprValue> } {
  const fields: ResolvedField[] = [];
  const values: Record<string, ExprValue> = {};
  for (const definition of template.fields ?? []) {
    const store = definition.scope === 'project' ? sources.projectValues : sources.schematicValues;
    const stored = store !== undefined && Object.prototype.hasOwnProperty.call(store, definition.id) ? store[definition.id] : undefined;
    const defaultText = defaultTextOf(definition, panelContext, template.numberFormat, sources.today);
    const value = stored ?? defaultText;
    fields.push({ id: definition.id, label: definition.label, type: definition.type, scope: definition.scope, stored, defaultText, value });
    values[definition.id] = fieldExpressionValue(definition.type, value, template.dateFormat);
  }
  return { fields, values };
}

/** Today as YYYY-MM-DD in the local time zone. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
