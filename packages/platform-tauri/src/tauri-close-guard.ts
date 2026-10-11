import type { CloseGuard } from '@mepapp/platform';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask } from '@tauri-apps/plugin-dialog';

/** A webview never shows the browser's "Leave site?" prompt, so the window's close request asks instead. */
export class TauriCloseGuard implements CloseGuard {
  private unsaved = false;

  constructor() {
    void getCurrentWindow().onCloseRequested(async (event) => {
      if (!this.unsaved) return;
      const close = await ask('There are unsaved changes. Close MEPSketcher anyway?', { title: 'Unsaved changes', kind: 'warning', okLabel: 'Close', cancelLabel: 'Cancel' });
      if (!close) event.preventDefault();
    });
  }

  setUnsavedChanges(unsaved: boolean): void {
    this.unsaved = unsaved;
  }
}
