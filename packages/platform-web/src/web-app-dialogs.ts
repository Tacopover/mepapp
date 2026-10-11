import type { AppDialogs } from '@mepapp/platform';

export class WebAppDialogs implements AppDialogs {
  async confirm(message: string): Promise<boolean> {
    return window.confirm(message);
  }
}
