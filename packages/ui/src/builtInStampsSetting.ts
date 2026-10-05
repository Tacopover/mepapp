import { useCallback, useState } from 'react';

const SHOW_BUILT_IN_STAMPS_KEY = 'mepapp.settings.showBuiltInStamps.v1';

export function readShowBuiltInStamps(): boolean {
  try {
    return window.localStorage.getItem(SHOW_BUILT_IN_STAMPS_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function writeShowBuiltInStamps(value: boolean): void {
  try {
    window.localStorage.setItem(SHOW_BUILT_IN_STAMPS_KEY, String(value));
  } catch {
    // Storage can be blocked or full: the setting then lasts until reload only.
  }
}

export function useShowBuiltInStamps(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(readShowBuiltInStamps);
  const update = useCallback((next: boolean) => {
    setValue(next);
    writeShowBuiltInStamps(next);
  }, []);
  return [value, update];
}
