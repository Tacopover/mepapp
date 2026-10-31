/** Items that belong to a page. An undefined pageIndex counts as page 0. */
export function onPage<T extends { pageIndex?: number }>(items: readonly T[], page: number): T[] {
  return items.filter((item) => (item.pageIndex ?? 0) === page);
}

/** Returns a copy of the item with pageIndex set. The input stays unchanged. */
export function withPage<T extends object>(item: T, page: number): T & { pageIndex: number } {
  return { ...item, pageIndex: page };
}

/** Puts every pasted item on `page`. A paste always lands on the shown page, also when the copy came from another page. The inputs stay unchanged. */
export function pasteOnPage<S extends object, G extends object, F extends object, A extends object>(
  items: { stamps: readonly S[]; segments: readonly G[]; fittings: readonly F[]; annotations: readonly A[] },
  page: number,
): { stamps: (S & { pageIndex: number })[]; segments: (G & { pageIndex: number })[]; fittings: (F & { pageIndex: number })[]; annotations: (A & { pageIndex: number })[] } {
  return {
    stamps: items.stamps.map((item) => withPage(item, page)),
    segments: items.segments.map((item) => withPage(item, page)),
    fittings: items.fittings.map((item) => withPage(item, page)),
    annotations: items.annotations.map((item) => withPage(item, page)),
  };
}
