import type { CloseGuard } from '@mepapp/platform';

function onBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = '';
}

/** The browser's own "Leave site?" prompt — the only guard when the tab itself is closed or reloaded with unsaved drawings open. */
export class WebCloseGuard implements CloseGuard {
  private unsaved = false;

  setUnsavedChanges(unsaved: boolean): void {
    if (unsaved === this.unsaved) return;
    this.unsaved = unsaved;
    if (unsaved) window.addEventListener('beforeunload', onBeforeUnload);
    else window.removeEventListener('beforeunload', onBeforeUnload);
  }
}
