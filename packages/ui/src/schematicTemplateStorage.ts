import { validateSchematicTemplate, type SchematicTemplate } from '@mepapp/core';

// Interim per-installation storage of the user's own schematic templates; templates plan Phase 6 replaces it.

export const SCHEMATIC_TEMPLATES_STORAGE_KEY = 'mepapp.schematicTemplates';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isUsableTemplate(value: unknown): value is SchematicTemplate {
  if (value === null || typeof value !== 'object') return false;
  const t = value as Partial<SchematicTemplate>;
  if (typeof t.id !== 'string' || typeof t.name !== 'string') return false;
  if (!Array.isArray(t.layoutBlocks) || !Array.isArray(t.groups) || !t.sheet || !t.groupAnchor || !t.numberFormat) return false;
  try {
    return validateSchematicTemplate(t as SchematicTemplate).length === 0;
  } catch {
    return false;
  }
}

/** The saved templates that are still valid; anything unreadable is dropped. */
export function loadCustomTemplates(storage: StorageLike | undefined): SchematicTemplate[] {
  try {
    const raw = storage?.getItem(SCHEMATIC_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isUsableTemplate) : [];
  } catch {
    return [];
  }
}

/**
 * Writes the templates, but never one that fails validation: the editor
 * saves on each keystroke, also mid-edit, and loadCustomTemplates would
 * then drop the whole template. Such a template keeps its last valid
 * stored version instead (a new one is not stored until it is valid).
 */
export function saveCustomTemplates(storage: StorageLike | undefined, templates: SchematicTemplate[]): void {
  try {
    const stored = new Map(loadCustomTemplates(storage).map((t) => [t.id, t]));
    const valid = templates.flatMap((t) => {
      const lastValid = stored.get(t.id);
      return isUsableTemplate(t) ? [t] : (lastValid ?? []);
    });
    storage?.setItem(SCHEMATIC_TEMPLATES_STORAGE_KEY, JSON.stringify(valid));
  } catch {
    // Storage can be full or blocked; the templates then last only for this session.
  }
}
