import type { PortSpec } from './geometry.js';
import type { SymbolShape } from './symbol-shapes.js';

/**
 * A user-drawn schematic symbol (shared-drawing-tool.md Phase 4). It is the schematic counterpart of
 * a custom stamp: vector art plus ports, with no raster form. A `drawing` block in a schematic
 * template points at one through `symbolId`.
 */
export interface SchematicSymbol {
  id: string;
  name: string;
  /** Size in sheet mm when the symbol is placed. It also sets the aspect ratio of the drawing area, which circle and arc radii depend on. */
  widthMm: number;
  heightMm: number;
  /** Fractions (0..1) of the width and height, the same convention as a custom stamp's shapes. */
  shapes: SymbolShape[];
  /** Connection points that annotations snap to. Fractions of the width and height. */
  ports: PortSpec[];
  /** Ports wired together inside the symbol, like `StampDefinition.definitionPortGroups`. */
  portGroups?: string[][];
}

/** The reasons a symbol cannot be used; an empty list means it is valid. */
export function validateSchematicSymbol(symbol: SchematicSymbol): string[] {
  const issues: string[] = [];
  if (symbol.id.trim() === '') issues.push('The symbol needs an id.');
  if (symbol.name.trim() === '') issues.push('The symbol needs a name.');
  if (!(Number.isFinite(symbol.widthMm) && symbol.widthMm > 0 && Number.isFinite(symbol.heightMm) && symbol.heightMm > 0)) {
    issues.push('The symbol size must be positive.');
  }
  if (!Array.isArray(symbol.shapes)) issues.push('The symbol needs a list of shapes.');
  else if (symbol.shapes.length === 0) issues.push('Draw at least one shape.');
  if (!Array.isArray(symbol.ports)) {
    issues.push('The symbol needs a list of ports.');
    return issues;
  }
  const portIds = new Set<string>();
  for (const port of symbol.ports) {
    if (portIds.has(port.id)) issues.push(`Port "${port.id}" reuses an id.`);
    portIds.add(port.id);
    if (!Number.isFinite(port.fractionX) || !Number.isFinite(port.fractionY)) issues.push(`Port "${port.name}" has a position that is not a number.`);
  }
  for (const group of symbol.portGroups ?? []) {
    if (group.some((id) => !portIds.has(id))) issues.push('A linked group names a port that does not exist.');
  }
  return issues;
}
