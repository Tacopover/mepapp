/** localStorage key that switches the developer-only debug tools on for this browser. Set it in the browser console: localStorage.setItem('mepapp.debugTools', '1'). */
export const DEBUG_TOOLS_STORAGE_KEY = 'mepapp.debugTools';

export function isDebugToolsEnabled(): boolean {
  try {
    return localStorage.getItem(DEBUG_TOOLS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
