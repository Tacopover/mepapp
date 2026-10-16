export type RouteLanguage = 'en' | 'nl';

export function routePageProblem(pageCount: number, language: RouteLanguage): string | null {
  if (!Number.isInteger(pageCount) || pageCount <= 1) return null;
  if (language === 'nl') {
    return `Deze PDF heeft ${pageCount} pagina's. Het routecommando werkt op één verdieping per PDF-bestand. Splits de pagina's in aparte bestanden.`;
  }
  return `This PDF has ${pageCount} pages. The route command works on one floor for each PDF file. Split the pages into separate files.`;
}
