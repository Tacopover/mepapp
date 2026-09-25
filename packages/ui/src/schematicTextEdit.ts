import type { ResolvedBlock, ResolvedField, SchematicBlockType } from '@mepapp/core';

const NOT_TEXT_TYPES: SchematicBlockType[] = ['frame', 'busbar', 'drawing', 'totalsTable', 'loadSymbol'];

/** Whether the user can type over the text of a generated block of this type on a schematic. */
export function isTextEditableType(type: SchematicBlockType): boolean {
  return !NOT_TEXT_TYPES.includes(type);
}

/**
 * The top-most text-editable block that holds a sheet point, drawing order last = top. A rotated block
 * is tested in its own axes, so a point inside its drawn rectangle counts.
 */
export function findTextBlockAt(blocks: ResolvedBlock[], point: { x: number; y: number }): ResolvedBlock | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (!isTextEditableType(block.type)) continue;
    const radians = (-block.rotation * Math.PI) / 180;
    const dx = point.x - (block.x + block.width / 2);
    const dy = point.y - (block.y + block.height / 2);
    const localX = dx * Math.cos(radians) - dy * Math.sin(radians) + block.width / 2;
    const localY = dx * Math.sin(radians) + dy * Math.cos(radians) + block.height / 2;
    if (localX >= 0 && localX <= block.width && localY >= 0 && localY <= block.height) return block;
  }
  return undefined;
}

/** The fields of the form, split by where their value is stored. */
export function groupResolvedFields(fields: ResolvedField[]): { shared: ResolvedField[]; schematic: ResolvedField[] } {
  return { shared: fields.filter((f) => f.scope === 'project'), schematic: fields.filter((f) => f.scope === 'schematic') };
}

/** The line under a field that names its default, or undefined when there is nothing to say. */
export function describeFieldDefault(field: ResolvedField): string | undefined {
  if (field.stored === '' && field.defaultText !== '') return 'Empty on purpose. Reset brings back the default.';
  if (field.stored !== undefined || field.defaultText === '') return undefined;
  return field.type === 'date' ? `Default: today (${field.defaultText})` : `Default: ${field.defaultText}`;
}
