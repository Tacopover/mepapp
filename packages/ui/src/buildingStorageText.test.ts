import { describe, expect, it } from 'vitest';
import {
  ACCESS_CARD_LINE,
  ACCESS_DENIED,
  ACCESS_WAITING,
  BLOCKED_STORAGE,
  BROWSER_STORAGE_ALERT,
  CHOOSE_FILE_WEB_TITLE,
  NEEDS_ACCESS_HINT,
  OPEN_BROWSER_HINT,
  accessCardText,
  allowAccessLabel,
  createButtonLabel,
  importHint,
  openHint,
} from './buildingStorageText.js';

describe('buildingStorageText constants', () => {
  it('match the spec text word for word', () => {
    expect(BROWSER_STORAGE_ALERT).toBe(
      'This browser keeps the building inside the browser. Use Chrome or Edge if you want to see or move the file.',
    );
    expect(ACCESS_CARD_LINE).toBe(
      'Your browser asks again for access to this file after you close the tab. Click Allow access, then choose Allow on every visit or Allow this time.',
    );
    expect(ACCESS_WAITING).toBe('Waiting for your browser…');
    expect(ACCESS_DENIED).toBe('Access was not given. The building stays closed. Click Allow access to try again.');
    expect(NEEDS_ACCESS_HINT).toBe('Needs your access');
    expect(BLOCKED_STORAGE).toBe(
      'This browser does not let MepApp keep a building. Close the private window, or use Chrome or Edge.',
    );
    expect(OPEN_BROWSER_HINT).toBe(
      'Open building… reads a .json file into this browser. The building is copied. The file on your disk does not change.',
    );
    expect(CHOOSE_FILE_WEB_TITLE).toBe('This browser cannot open the PDF by itself. Choose the file again.');
  });
});

describe('createButtonLabel', () => {
  it('keeps the ellipsis only for a file picker', () => {
    expect(createButtonLabel('file')).toBe('Create…');
    expect(createButtonLabel('browser')).toBe('Create');
    expect(createButtonLabel('blocked')).toBe('Create');
  });
});

describe('importHint', () => {
  it('names the file save for file storage', () => {
    expect(importHint(2, 'file')).toBe(
      '2 old buildings can be imported. Open the Building menu and choose Import. MepApp asks where to save each building file. The old list stays unchanged.',
    );
  });

  it('names the browser save for browser storage', () => {
    expect(importHint(1, 'browser')).toBe(
      '1 old building can be imported. Open the Building menu and choose Import. MepApp saves each old building inside this browser. The old list stays unchanged.',
    );
  });
});

describe('accessCardText', () => {
  it('has no denied line when access was not refused', () => {
    expect(accessCardText(false)).toEqual({ denied: null, line: ACCESS_CARD_LINE });
  });

  it('shows the denied line when access was refused', () => {
    expect(accessCardText(true)).toEqual({ denied: ACCESS_DENIED, line: ACCESS_CARD_LINE });
  });
});

describe('allowAccessLabel', () => {
  it('shows the button text when idle and the waiting text when busy', () => {
    expect(allowAccessLabel(false)).toBe('Allow access');
    expect(allowAccessLabel(true)).toBe('Waiting for your browser…');
  });
});

describe('openHint', () => {
  it('shows the hint only for browser storage', () => {
    expect(openHint('browser')).toBe(OPEN_BROWSER_HINT);
    expect(openHint('file')).toBeNull();
    expect(openHint('blocked')).toBeNull();
  });
});
