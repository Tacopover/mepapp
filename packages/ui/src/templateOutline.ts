import { SCHEMATIC_BLOCK_CATALOGUE, describeRule, getBlocksBounds, type BlockRef, type Bounds, type ResolvedBlock, type SchematicBlock, type SchematicBlockType, type SchematicSymbol, type SchematicTemplate } from '@mepapp/core';

// Pure helpers for the template editor's outline and for placing blocks on the sheet
// (electrical-schematic-templates.md Phase 5c round 2).

export interface OutlineBlock {
  ref: BlockRef;
  type: SchematicBlockType;
  /** A readable name, such as "Main device". */
  label: string;
  /** A short extra that tells blocks of the same type apart, such as the first words of a text. */
  detail?: string;
  id: string;
}

export interface OutlineGroup {
  groupId: string;
  name: string;
  /** The group's rule in words, such as "Any circuit". */
  rule: string;
  blocks: OutlineBlock[];
}

export interface TemplateOutline {
  sheet: OutlineBlock[];
  groups: OutlineGroup[];
}

const SHAPE_NAMES: Record<string, string> = { line: 'line', arrow: 'arrow', rect: 'rectangle', circle: 'circle', ellipse: 'ellipse', arc: 'arc', polygon: 'polygon', text: 'text', image: 'image' };
const TEXT_TYPES: readonly SchematicBlockType[] = ['freeItem', 'customAnnotation', 'legend'];
const DETAIL_LENGTH = 24;

/** The readable name of a block: the palette label, or for a drawing what it shows. */
export function blockLabel(block: Pick<SchematicBlock, 'type' | 'symbolId' | 'shapes'>, symbols: SchematicSymbol[] = []): string {
  if (block.type !== 'drawing') return SCHEMATIC_BLOCK_CATALOGUE[block.type].label;
  if (block.symbolId !== undefined) {
    const name = symbols.find((s) => s.id === block.symbolId)?.name;
    return name ? `Symbol: ${name}` : 'Symbol (missing)';
  }
  const shapes = block.shapes ?? [];
  if (shapes.length === 1) {
    const name = SHAPE_NAMES[shapes[0].kind] ?? shapes[0].kind;
    return `Drawing: ${name}`;
  }
  return shapes.length === 0 ? 'Drawing (empty)' : `Drawing: ${shapes.length} shapes`;
}

/** The first words of a text block's own text, so two free texts can be told apart. */
export function blockDetail(block: Pick<SchematicBlock, 'type' | 'binding'>): string | undefined {
  if (!TEXT_TYPES.includes(block.type) || !block.binding) return undefined;
  const first = block.binding.split('\n')[0].trim();
  if (first === '') return undefined;
  return first.length > DETAIL_LENGTH ? `${first.slice(0, DETAIL_LENGTH - 1)}…` : first;
}

function outlineBlock(block: SchematicBlock, groupId: string | undefined, symbols: SchematicSymbol[]): OutlineBlock {
  return { ref: { blockId: block.id, groupId }, type: block.type, label: blockLabel(block, symbols), detail: blockDetail(block), id: block.id };
}

/** The tree that the Outline tab shows: the sheet's blocks, then each group with its blocks, in drawing order. */
export function buildTemplateOutline(template: SchematicTemplate, symbols: SchematicSymbol[] = []): TemplateOutline {
  return {
    sheet: template.layoutBlocks.map((b) => outlineBlock(b, undefined, symbols)),
    groups: template.groups.map((g) => ({ groupId: g.id, name: g.name, rule: describeRule(g.rule), blocks: g.blocks.map((b) => outlineBlock(b, g.id, symbols)) })),
  };
}

export interface RepeatBox extends Bounds {
  circuitId: string;
}

/** One box per circuit that the group draws: the bounds of that circuit's blocks, in the order the blocks come. */
export function groupRepeatBoxes(blocks: ResolvedBlock[], groupId: string): RepeatBox[] {
  const byCircuit = new Map<string, ResolvedBlock[]>();
  for (const block of blocks) {
    if (block.groupId !== groupId || block.circuitId === undefined || block.extraId !== undefined) continue;
    const list = byCircuit.get(block.circuitId);
    if (list) list.push(block);
    else byCircuit.set(block.circuitId, [block]);
  }
  const boxes: RepeatBox[] = [];
  for (const [circuitId, list] of byCircuit) {
    const bounds = getBlocksBounds(list);
    if (bounds) boxes.push({ circuitId, ...bounds });
  }
  return boxes;
}

/**
 * The circuit repeat under a sheet point: its group, its circuit and the circuit's origin. `padMm`
 * grows each repeat's box, so a drop just beside a thin repeat still lands in it. When boxes overlap,
 * the one whose centre is nearest wins.
 */
export function repeatAtPoint(
  blocks: ResolvedBlock[],
  circuitOrigins: Record<string, { x: number; y: number }>,
  point: { x: number; y: number },
  padMm = 2,
): { groupId: string; circuitId: string; origin: { x: number; y: number } } | undefined {
  const groupIds = [...new Set(blocks.flatMap((b) => (b.groupId !== undefined && b.extraId === undefined ? [b.groupId] : [])))];
  let best: { groupId: string; circuitId: string; origin: { x: number; y: number }; distance: number } | undefined;
  for (const groupId of groupIds) {
    for (const box of groupRepeatBoxes(blocks, groupId)) {
      const inside = point.x >= box.x - padMm && point.x <= box.x + box.width + padMm && point.y >= box.y - padMm && point.y <= box.y + box.height + padMm;
      const origin = circuitOrigins[box.circuitId];
      if (!inside || !origin) continue;
      const distance = Math.hypot(point.x - (box.x + box.width / 2), point.y - (box.y + box.height / 2));
      if (!best || distance < best.distance) best = { groupId, circuitId: box.circuitId, origin, distance };
    }
  }
  return best && { groupId: best.groupId, circuitId: best.circuitId, origin: best.origin };
}
