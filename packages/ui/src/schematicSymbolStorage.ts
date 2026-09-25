import { validateSchematicSymbol, type SchematicSymbol } from '@mepapp/core';
import type { StorageLike } from './schematicTemplateStorage.js';

// Interim per-installation storage of the user's own schematic symbols. It sits beside the template
// storage and moves with it when templates plan Phase 6 decides where both live.

export const SCHEMATIC_SYMBOLS_STORAGE_KEY = 'mepapp.schematicSymbols';

function isUsableSymbol(value: unknown): value is SchematicSymbol {
  if (value === null || typeof value !== 'object') return false;
  const s = value as Partial<SchematicSymbol>;
  if (typeof s.id !== 'string' || typeof s.name !== 'string') return false;
  if (!Array.isArray(s.shapes) || !Array.isArray(s.ports)) return false;
  try {
    return validateSchematicSymbol(s as SchematicSymbol).length === 0;
  } catch {
    return false;
  }
}

/** The saved symbols that are still valid; anything unreadable is dropped. */
export function loadCustomSymbols(storage: StorageLike | undefined): SchematicSymbol[] {
  try {
    const raw = storage?.getItem(SCHEMATIC_SYMBOLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isUsableSymbol) : [];
  } catch {
    return [];
  }
}

export function saveCustomSymbols(storage: StorageLike | undefined, symbols: SchematicSymbol[]): void {
  try {
    storage?.setItem(SCHEMATIC_SYMBOLS_STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    // Storage can be full or blocked; the symbols then last only for this session.
  }
}
