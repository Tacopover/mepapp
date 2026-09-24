import { getStampDefinition, type SchematicTerminalInfo, type StampDefinition } from '@mepapp/core';
import type { StampInfo } from '@mepapp/render';

/**
 * The generator's view of every placed stamp, by id (electrical-schematic-templates.md Phase 4).
 * A terminal's load type is its stamp definition id, so the per-load-type cells group terminals by
 * kind of load; an uploaded stamp with no definition falls back to its category.
 */
export function buildSchematicTerminals(stamps: StampInfo[], customDefinitions: StampDefinition[]): Record<string, SchematicTerminalInfo> {
  const terminals: Record<string, SchematicTerminalInfo> = {};
  for (const stamp of stamps) {
    const definition = stamp.definitionId ? getStampDefinition(stamp.definitionId, customDefinitions) : undefined;
    terminals[stamp.id] = {
      label: definition?.label,
      capacity: stamp.capacity,
      loadType: stamp.definitionId ?? stamp.category,
      stampDefinitionId: stamp.definitionId,
    };
  }
  return terminals;
}
