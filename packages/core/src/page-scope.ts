/** Items that belong to a page. An undefined pageIndex counts as page 0. */
export function onPage<T extends { pageIndex?: number }>(items: readonly T[], page: number): T[] {
  return items.filter((item) => (item.pageIndex ?? 0) === page);
}

/** Returns a copy of the item with pageIndex set. The input stays unchanged. */
export function withPage<T extends object>(item: T, page: number): T & { pageIndex: number } {
  return { ...item, pageIndex: page };
}
