// A saved schematic (electrical-schematic-templates.md Phase 5b): one panel drawn with a copy of a
// template, plus what the user entered or added on top of the generated result. It lives in the
// project document. Pure functions, no I/O.

import { generateSchematic, type GeneratedSchematic, type SchematicInput } from './schematic-generator.js';
import type { SchematicSymbol } from './schematic-symbol.js';
import type { SchematicBlockType, SchematicExtra, SchematicTemplate } from './schematic-template.js';

export interface Schematic {
  id: string;
  name: string;
  /** A schematic covers exactly one panel. */
  panelId: string;
  /** Id of the template this schematic was copied from. The copy below is what the schematic draws. */
  sourceTemplateId?: string;
  /** The template as it was when the schematic copied it. "Update from template" replaces it. */
  template: SchematicTemplate;
  /** Copies of the symbols that `template` uses, so the project file is complete on its own. */
  symbols: SchematicSymbol[];
  /** Values of the template fields with scope `schematic`, by field id. */
  fieldValues: Record<string, string>;
  /** Text typed over a generated block, by the block's resolved id. */
  textOverrides: Record<string, string>;
  /** Blocks added to this schematic only. */
  extras: SchematicExtra[];
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

/** True when both values hold the same data, whatever the order of their object keys. */
export function isSameData(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

/** The ids of the symbols that a template's blocks use, without repeats. */
export function collectTemplateSymbolIds(template: SchematicTemplate): string[] {
  const ids = new Set<string>();
  for (const block of [...template.layoutBlocks, ...template.groups.flatMap((g) => g.blocks)]) {
    if (block.symbolId !== undefined) ids.add(block.symbolId);
  }
  return [...ids];
}

/** Copies of the library symbols that the template uses. A symbol that the library does not have is left out. */
export function bundleSymbols(template: SchematicTemplate, library: SchematicSymbol[]): SchematicSymbol[] {
  return collectTemplateSymbolIds(template)
    .map((id) => library.find((symbol) => symbol.id === id))
    .filter((symbol): symbol is SchematicSymbol => symbol !== undefined)
    .map((symbol) => structuredClone(symbol));
}

/** A name that no other schematic uses, by adding a number when needed. */
export function uniqueSchematicName(base: string, existing: Schematic[]): string {
  const taken = new Set(existing.map((s) => s.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
  }
}

export function createSchematic(input: { id: string; name: string; panelId: string; source: SchematicTemplate; library: SchematicSymbol[] }): Schematic {
  return {
    id: input.id,
    name: input.name,
    panelId: input.panelId,
    sourceTemplateId: input.source.id,
    template: structuredClone(input.source),
    symbols: bundleSymbols(input.source, input.library),
    fieldValues: {},
    textOverrides: {},
    extras: [],
  };
}

/** The ids of the symbols that the schematic's extras use. */
export function collectExtraSymbolIds(extras: SchematicExtra[]): string[] {
  return [...new Set(extras.flatMap((e) => (e.symbolId !== undefined ? [e.symbolId] : [])))];
}

/** Loads the latest edits of the source template and its symbols into the schematic. The entered values, text overrides and extras stay, and so do the symbol copies that extras use. */
export function refreshSchematicFromTemplate(schematic: Schematic, source: SchematicTemplate, library: SchematicSymbol[]): Schematic {
  const fromTemplate = bundleSymbols(source, library);
  const kept = schematic.symbols.filter((symbol) => collectExtraSymbolIds(schematic.extras).includes(symbol.id) && !fromTemplate.some((s) => s.id === symbol.id));
  return { ...schematic, sourceTemplateId: source.id, template: structuredClone(source), symbols: [...fromTemplate, ...kept] };
}

/**
 * How the schematic's copy compares with its source template. `missing-source` = the source template
 * no longer exists, `changed` = the template or one of its symbols differs from the copy.
 */
export function getSchematicTemplateStatus(schematic: Schematic, source: SchematicTemplate | undefined, library: SchematicSymbol[]): 'missing-source' | 'current' | 'changed' {
  if (!source) return 'missing-source';
  const sameTemplate = isSameData(schematic.template, source);
  const templateIds = collectTemplateSymbolIds(schematic.template);
  const sameSymbols = isSameData(
    schematic.symbols.filter((symbol) => templateIds.includes(symbol.id)).sort((a, b) => a.id.localeCompare(b.id)),
    bundleSymbols(source, library).sort((a, b) => a.id.localeCompare(b.id)),
  );
  return sameTemplate && sameSymbols ? 'current' : 'changed';
}

export interface SchematicGenerateInput extends Omit<SchematicInput, 'panel'> {
  panel: SchematicInput['panel'];
  /** Values of the template fields with scope `project`. */
  projectFieldValues?: Record<string, string>;
  /** Today as YYYY-MM-DD, for date fields that default to today. */
  today?: string;
}

/** Generates the schematic's sheet: its template copy with its own values, overrides and extras. */
export function generateFromSchematic(schematic: Schematic, input: SchematicGenerateInput): GeneratedSchematic {
  const { projectFieldValues, today, ...schematicInput } = input;
  return generateSchematic(schematicInput, schematic.template, {
    fieldSources: { projectValues: projectFieldValues, schematicValues: schematic.fieldValues, today },
    textOverrides: schematic.textOverrides,
    extras: schematic.extras,
  });
}

/** Stores a field value for the schematic. `undefined` removes it, so the field's default applies again. */
export function setSchematicFieldValue(schematic: Schematic, fieldId: string, value: string | undefined): Schematic {
  const fieldValues = { ...schematic.fieldValues };
  if (value === undefined) delete fieldValues[fieldId];
  else fieldValues[fieldId] = value;
  return { ...schematic, fieldValues };
}

/** Types a text over a generated block. `undefined` removes the override. */
export function setTextOverride(schematic: Schematic, blockId: string, text: string | undefined): Schematic {
  const textOverrides = { ...schematic.textOverrides };
  if (text === undefined) delete textOverrides[blockId];
  else textOverrides[blockId] = text;
  return { ...schematic, textOverrides };
}

/** The block types that a schematic can hold as extras: free text and drawings. */
export const EXTRA_BLOCK_TYPES: SchematicBlockType[] = ['freeItem', 'drawing'];

export function addSchematicExtra(schematic: Schematic, type: SchematicBlockType, options: { at?: { x: number; y: number }; circuitId?: string } = {}): { schematic: Schematic; extraId: string } | undefined {
  if (!EXTRA_BLOCK_TYPES.includes(type)) return undefined;
  const taken = new Set(schematic.extras.map((e) => e.id));
  let n = 1;
  while (taken.has(`${type}-${n}`)) n++;
  const extra: SchematicExtra = { id: `${type}-${n}`, type, x: options.at?.x ?? 0, y: options.at?.y ?? 0, rotation: 0, circuitId: options.circuitId };
  if (type === 'drawing') extra.shapes = [];
  if (type === 'freeItem') extra.binding = 'Text';
  if (extra.circuitId === undefined) delete extra.circuitId;
  return { schematic: { ...schematic, extras: [...schematic.extras, extra] }, extraId: extra.id };
}

/** Applies `patch` to an extra. A patch key set to undefined removes it. */
export function updateSchematicExtra(schematic: Schematic, extraId: string, patch: Partial<SchematicExtra>): Schematic {
  return {
    ...schematic,
    extras: schematic.extras.map((extra) => {
      if (extra.id !== extraId) return extra;
      const next: Record<string, unknown> = { ...extra, ...patch, id: extra.id, type: extra.type };
      for (const key of Object.keys(patch)) if ((patch as Record<string, unknown>)[key] === undefined) delete next[key];
      return next as unknown as SchematicExtra;
    }),
  };
}

export function removeSchematicExtra(schematic: Schematic, extraId: string): Schematic {
  return { ...schematic, extras: schematic.extras.filter((e) => e.id !== extraId) };
}

/**
 * Adds a drawing extra that shows a library symbol, at the symbol's own size. A copy of the symbol goes
 * into the schematic (unless it has one), so the project file stays complete.
 */
export function addSchematicSymbolExtra(schematic: Schematic, symbol: SchematicSymbol, options: { at?: { x: number; y: number }; circuitId?: string } = {}): { schematic: Schematic; extraId: string } {
  const added = addSchematicExtra(schematic, 'drawing', options)!;
  const withSymbol = updateSchematicExtra(added.schematic, added.extraId, { symbolId: symbol.id, shapes: undefined, width: symbol.widthMm, height: symbol.heightMm });
  const symbols = withSymbol.symbols.some((s) => s.id === symbol.id) ? withSymbol.symbols : [...withSymbol.symbols, structuredClone(symbol)];
  return { schematic: { ...withSymbol, symbols }, extraId: added.extraId };
}
