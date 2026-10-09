import type { AppDialogs } from '@mepapp/platform';

// Set once by MepSketchApp from its `dialogs` prop, so nested components can ask without
// the prop passed down to them. The default is for hosts and tests that set nothing.
let dialogs: AppDialogs = { confirm: async (message) => window.confirm(message) };

export function setAppDialogs(next: AppDialogs): void {
  dialogs = next;
}

/** Use this, never window.confirm: in the desktop app window.confirm does not wait for an answer. */
export function confirmDialog(message: string): Promise<boolean> {
  return dialogs.confirm(message);
}
