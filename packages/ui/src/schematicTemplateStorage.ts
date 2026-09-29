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

export function saveCustomTemplates(storage: StorageLike | undefined, templates: SchematicTemplate[]): void {
  try {
    storage?.setItem(SCHEMATIC_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Storage can be full or blocked; the templates then last only for this session.
  }
}
