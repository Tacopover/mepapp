import { findSheets, type BuildingFile } from '@mepapp/core';

/** The distinct minted ids (sheets with idMinted true) of the sheets that match the document by path, or by file name and size when the document or the sheet has no path. In sheet order. */
export function matchingMintedIds(file: BuildingFile, doc: { path?: string; fileName: string; sizeBytes: number }): string[] {
  const ids: string[] = [];
  const matches = findSheets(file, {
    projectUuid: null,
    ...(doc.path === undefined ? {} : { path: doc.path }),
    fileName: doc.fileName,
    sizeBytes: doc.sizeBytes,
  }).filter((match) => !(match.strength === 'weak' && doc.path !== undefined && match.sheet.location.path !== undefined));
  for (const { sheet } of matches) {
    if (sheet.idMinted !== true || sheet.projectUuid === null || ids.includes(sheet.projectUuid)) continue;
    ids.push(sheet.projectUuid);
  }
  return ids;
}

/** For each open document that does not hold its id in the file (projectUuidInFile false), whose projectUuid differs from the first minted id that matches it: { documentId, projectUuid } to adopt. */
export function mintedAdoptions(
  file: BuildingFile,
  docs: readonly { id: string; fileName: string; sizeBytes: number | null; projectUuid: string | null; projectUuidInFile: boolean }[],
  targets: ReadonlyMap<string, { path?: string }>,
): { documentId: string; projectUuid: string }[] {
  const adoptions: { documentId: string; projectUuid: string }[] = [];
  for (const doc of docs) {
    if (doc.sizeBytes === null || doc.projectUuidInFile) continue;
    const [first] = matchingMintedIds(file, { path: targets.get(doc.id)?.path, fileName: doc.fileName, sizeBytes: doc.sizeBytes });
    if (first === undefined || first === doc.projectUuid) continue;
    adoptions.push({ documentId: doc.id, projectUuid: first });
  }
  return adoptions;
}
