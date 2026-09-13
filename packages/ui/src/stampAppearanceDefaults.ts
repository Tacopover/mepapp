// Remembers the last-used color/scale for each stamp definition (library or
// custom), so the next time that same stamp type is placed it starts with
// its last appearance instead of the plain default — same idea as old
// MEPSketcher's ElementAppearanceService, keyed by definition.id (stable and
// unique across both library stamps and custom stamps, see stamp-library.ts's
// lookup). Global across all projects, same as the app's other small
// localStorage-backed preferences (see App.tsx/buildings.ts/DockPanel.tsx).

const STORAGE_KEY = 'mepapp.stampAppearanceDefaults.v1';

export interface StampAppearanceDefault {
  color?: string;
  scale?: number;
}

type StoredDefaults = Record<string, StampAppearanceDefault>;

function readAll(): StoredDefaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getStampAppearanceDefault(definitionId: string): StampAppearanceDefault | undefined {
  return readAll()[definitionId];
}

export function setStampAppearanceDefault(definitionId: string, appearance: StampAppearanceDefault): void {
  const all = readAll();
  all[definitionId] = { ...all[definitionId], ...appearance };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
