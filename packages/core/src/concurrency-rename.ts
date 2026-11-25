// The circuit load factor was saved as `diversityPercent` and used as `circuit.diversityPercent` and
// `circuit.diversifiedCapacity` in template expressions until schema version 22. Schema version 23 names
// them `concurrencyPercent`, `circuit.concurrencyPercent` and `circuit.concurrentCapacity` (B7-T12, D-B-114).
// Everything here works on plain JSON and is pure: a name that is already new is not changed.

import type { JsonRecord } from './schema.js';

const isRecord = (value: unknown): value is JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A bare expression with the two old circuit paths replaced. A path that only looks similar (`x.circuit.diversityPercent`, `circuit.diversityPercentage`) stays. */
export function renameConcurrencyInExpression(source: string): string {
  return source
    .replace(/(^|[^\w."])circuit((?:\[\*\])?)\.("?)diversityPercent\3(?!\w)/g, '$1circuit$2.$3concurrencyPercent$3')
    .replace(/(^|[^\w."])circuit((?:\[\*\])?)\.("?)diversifiedCapacity\3(?!\w)/g, '$1circuit$2.$3concurrentCapacity$3');
}

/** A binding (text with {expression} segments): only the text inside `{...}` changes. `{{` is a literal brace, so its text stays. */
export function renameConcurrencyInBinding(source: string): string {
  let result = '';
  let i = 0;
  while (i < source.length) {
    if (source[i] === '{' && source[i + 1] === '{') {
      result += '{{';
      i += 2;
    } else if (source[i] === '{') {
      const end = source.indexOf('}', i + 1);
      if (end < 0) return result + source.slice(i);
      result += `{${renameConcurrencyInExpression(source.slice(i + 1, end))}}`;
      i = end + 1;
    } else {
      result += source[i];
      i++;
    }
  }
  return result;
}

function renameRow(row: unknown): unknown {
  if (!isRecord(row) || typeof row.formula !== 'string') return row;
  const formula = renameConcurrencyInExpression(row.formula);
  if (formula === row.formula) return row;
  return { ...row, formula, ...(row.label === 'Diversified VA' ? { label: 'Concurrent VA' } : {}) };
}

function renameBlock(block: unknown): unknown {
  if (!isRecord(block)) return block;
  const next: JsonRecord = { ...block };
  if (typeof block.binding === 'string') next.binding = renameConcurrencyInBinding(block.binding);
  if (Array.isArray(block.tableRows)) next.tableRows = block.tableRows.map(renameRow);
  return next;
}

/** The template with the old names replaced in every block binding, every table row formula and every field default. Names, labels and descriptions typed by the user stay, except the label 'Diversified VA' of a row whose formula changed. */
export function migrateTemplateConcurrencyNames(template: unknown): unknown {
  if (!isRecord(template)) return template;
  const next: JsonRecord = { ...template };
  if (Array.isArray(template.layoutBlocks)) next.layoutBlocks = template.layoutBlocks.map(renameBlock);
  if (Array.isArray(template.groups)) {
    next.groups = template.groups.map((group) => (isRecord(group) && Array.isArray(group.blocks) ? { ...group, blocks: group.blocks.map(renameBlock) } : group));
  }
  if (Array.isArray(template.fields)) {
    next.fields = template.fields.map((field) =>
      isRecord(field) && typeof field.defaultBinding === 'string' ? { ...field, defaultBinding: renameConcurrencyInBinding(field.defaultBinding) } : field,
    );
  }
  return next;
}

function renameField(record: JsonRecord): JsonRecord {
  if (!('diversityPercent' in record)) return record;
  const { diversityPercent, ...rest } = record;
  return 'concurrencyPercent' in rest ? rest : { ...rest, concurrencyPercent: diversityPercent };
}

function renameCircuit(circuit: unknown): unknown {
  return isRecord(circuit) ? renameField(circuit) : circuit;
}

function renamePanel(panel: unknown): unknown {
  if (!isRecord(panel) || !isRecord(panel.circuitDefaults)) return panel;
  return { ...panel, circuitDefaults: renameField(panel.circuitDefaults) };
}

function renameSchematic(schematic: unknown): unknown {
  if (!isRecord(schematic)) return schematic;
  const next: JsonRecord = { ...schematic };
  if ('template' in schematic) next.template = migrateTemplateConcurrencyNames(schematic.template);
  if (Array.isArray(schematic.extras)) next.extras = schematic.extras.map(renameBlock);
  return next;
}

/** The project document with the old names replaced: circuits, panel defaults, and the template copy and extras of each saved schematic. A field that is already new is kept and the old one is dropped. */
export function migrateConcurrencyNames(data: JsonRecord): JsonRecord {
  const next: JsonRecord = { ...data };
  if (Array.isArray(data.circuits)) next.circuits = data.circuits.map(renameCircuit);
  if (Array.isArray(data.panels)) next.panels = data.panels.map(renamePanel);
  if (Array.isArray(data.schematics)) next.schematics = data.schematics.map(renameSchematic);
  return next;
}
