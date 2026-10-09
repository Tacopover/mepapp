import type { AppDialogs } from '@mepapp/platform';
import { confirm } from '@tauri-apps/plugin-dialog';

// Not window.confirm: the dialog plugin replaces it with a version that calls the
// `plugin:dialog|confirm` command, and no capability can allow that command
// (allow-confirm only allows `message`), so it always fails.
export class TauriAppDialogs implements AppDialogs {
  confirm(message: string): Promise<boolean> {
    return confirm(message, { title: 'MEPSketcher', kind: 'warning' });
  }
}
