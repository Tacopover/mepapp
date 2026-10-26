export function routePageProblem(pageCount: number): string | null {
  if (!Number.isInteger(pageCount) || pageCount <= 1) return null;
  return `This PDF has ${pageCount} pages. Route network works on one floor for each PDF file. Split the pages into separate files.`;
}
