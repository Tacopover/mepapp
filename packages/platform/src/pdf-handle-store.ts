/** The key of one PDF inside a building: file name and size in bytes. */
export function pdfHandleFileKey(fileName: string, sizeBytes: number): string {
  return `${fileName}:${sizeBytes}`;
}

/**
 * Keeps the file handles of the PDFs of a building (Chrome and Edge), and one folder handle per building.
 * A handle is opaque here (a FileSystemFileHandle or a FileSystemDirectoryHandle).
 * When `available` is false, put and delete do nothing, get returns undefined and list returns an empty array.
 */
export interface PdfHandleStore {
  /** False without IndexedDB or without handle support. */
  readonly available: boolean;
  /** One handle per PDF. fileKey comes from pdfHandleFileKey. A second put with the same key replaces the first. */
  putFile(buildingId: string, fileKey: string, handle: unknown): Promise<void>;
  getFile(buildingId: string, fileKey: string): Promise<unknown | undefined>;
  deleteFile(buildingId: string, fileKey: string): Promise<void>;
  /** The fileKey of each stored handle of the building, sorted. */
  listFiles(buildingId: string): Promise<string[]>;
  /** One folder handle per building. */
  putFolder(buildingId: string, handle: unknown): Promise<void>;
  getFolder(buildingId: string): Promise<unknown | undefined>;
  deleteFolder(buildingId: string): Promise<void>;
  /** Removes all file handles and the folder handle of the building. */
  deleteBuilding(buildingId: string): Promise<void>;
}
