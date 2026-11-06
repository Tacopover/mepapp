import type { BuildingStorageKind } from '@mepapp/platform';
import { countLabel } from './buildingLevels.js';

export type BuildingStorage = BuildingStorageKind;

export const BROWSER_STORAGE_ALERT = 'This browser keeps the building inside the browser. Use Chrome or Edge if you want to see or move the file.';

export const ACCESS_CARD_LINE =
  'Your browser asks again for access to this file after you close the tab. Click Allow access, then choose Allow on every visit or Allow this time.';

export const ACCESS_WAITING = 'Waiting for your browser…';

export const ACCESS_DENIED = 'Access was not given. The building stays closed. Click Allow access to try again.';

export const NEEDS_ACCESS_HINT = 'Needs your access';

export const BLOCKED_STORAGE = 'This browser does not let MepApp keep a building. Close the private window, or use Chrome or Edge.';

export const OPEN_BROWSER_HINT = 'Open building… reads a .json file into this browser. The building is copied. The file on your disk does not change.';

export const CHOOSE_FILE_WEB_TITLE = 'This browser cannot open the PDF by itself. Choose the file again.';

export const IMPORT_BROWSER_SENTENCE = 'MepApp saves each old building inside this browser.';

export const IMPORT_FILE_SENTENCE = 'MepApp asks where to save each building file.';

/** The label of the create button. A picker follows "Create…" in Chrome or Edge only. */
export function createButtonLabel(storage: BuildingStorage): string {
  return storage === 'file' ? 'Create…' : 'Create';
}

/** The text of the import hint. The sentence about the save place depends on the storage. */
export function importHint(count: number, storage: BuildingStorage): string {
  const save = storage === 'file' ? IMPORT_FILE_SENTENCE : IMPORT_BROWSER_SENTENCE;
  return `${countLabel(count, 'old building')} can be imported. Open the Building menu and choose Import. ${save} The old list stays unchanged.`;
}

/** The texts of the access card. The denied line is null when access was not given yet. */
export function accessCardText(denied: boolean): { denied: string | null; line: string } {
  return { denied: denied ? ACCESS_DENIED : null, line: ACCESS_CARD_LINE };
}

/** The label of the allow access button. It shows the waiting text while the browser asks. */
export function allowAccessLabel(busy: boolean): string {
  return busy ? ACCESS_WAITING : 'Allow access';
}

/** The hint under the empty text. Only a browser without a file picker needs it. */
export function openHint(storage: BuildingStorage): string | null {
  return storage === 'browser' ? OPEN_BROWSER_HINT : null;
}
