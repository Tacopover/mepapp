function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

/** The id of the open document whose file target has this path. undefined when the path is undefined or no open document matches. The first match in `openIds` order wins. Paths compare equal after '\\' becomes '/' and case folds, because Windows paths are case-insensitive. */
export function findOpenDocumentByPath(
  targets: ReadonlyMap<string, { path?: string }>,
  openIds: readonly string[],
  path: string | undefined,
): string | undefined {
  if (path === undefined) return undefined;
  const wanted = normalizePath(path);
  for (const id of openIds) {
    const targetPath = targets.get(id)?.path;
    if (targetPath !== undefined && normalizePath(targetPath) === wanted) return id;
  }
  return undefined;
}
