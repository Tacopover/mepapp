import { readProjectUuidFromJson } from '@mepapp/core';
import type { PdfEngine } from '@mepapp/pdf-engine';
import type { FileTarget, FileTypeFilter } from '@mepapp/platform';

const PROJECT_FILE_NAME = 'mepapp-project.json';

export const BUILDING_PDF_TYPES: FileTypeFilter[] = [{ description: 'PDF', mimeType: 'application/pdf', extensions: ['pdf'] }];

export interface PdfInfo {
  pageCount: number;
  projectUuid: string | null;
}

/** Opens the PDF, reads the page count and the project id (null when the file has no embedded project, or no valid id), and closes it again, also when a read throws. A file that is not a PDF throws the engine error. */
export async function readPdfInfo(file: File, engine: PdfEngine): Promise<PdfInfo> {
  const handle = await engine.openDocument(new Uint8Array(await file.arrayBuffer()));
  try {
    const bytes = await handle.getEmbeddedFile(PROJECT_FILE_NAME);
    const projectUuid = bytes === null ? null : readProjectUuidFromJson(new TextDecoder().decode(bytes));
    return { pageCount: handle.getPageCount(), projectUuid };
  } finally {
    handle.close();
  }
}

/** The absolute path inside a FileTarget of the desktop platform ({ name, path }); undefined for a web handle or no target. */
export function pathOfTarget(target: FileTarget | undefined): string | undefined {
  return target?.path;
}

/** folderPath + separator + name. The separator is '\\' when folderPath contains a backslash, else '/'. No double separator when folderPath already ends with one. */
export function joinFolderPath(folderPath: string, name: string): string {
  const separator = folderPath.includes('\\') ? '\\' : '/';
  return folderPath.endsWith(separator) ? `${folderPath}${name}` : `${folderPath}${separator}${name}`;
}
