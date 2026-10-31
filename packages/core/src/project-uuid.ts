const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isProjectUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function makeProjectUuid(random: () => string): string {
  const value = random();
  if (!isProjectUuid(value)) throw new Error('makeProjectUuid: random() did not return a lowercase UUID');
  return value;
}

export function ensureProjectUuid(current: string | null, random: () => string): string {
  return current ?? makeProjectUuid(random);
}

export function wantsNewProjectUuid(asNewFile: boolean, hasFileTarget: boolean): boolean {
  return asNewFile && hasFileTarget;
}

export function readProjectUuidFromJson(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = (parsed as { projectUuid?: unknown }).projectUuid;
    return isProjectUuid(value) ? value : null;
  } catch {
    return null;
  }
}
