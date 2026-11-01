import type { PathState } from '@mepapp/platform';

// The fs plugin gives only the message text of an error, so the state is read from the OS error text.
export function pathStateOfError(err: unknown): PathState {
  const message = err instanceof Error ? err.message : String(err);
  return /os error (2|3)\b|no such file|not found|cannot find|does not exist/i.test(message) ? 'missing' : 'no-access';
}
