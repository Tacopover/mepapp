// showOpenFilePicker/showSaveFilePicker aren't in TS's lib.dom.d.ts yet, even
// though the FileSystemFileHandle/FileSystemWritableFileStream types they
// return already are. Only ever called behind a `'showOpenFilePicker' in
// window` runtime check (Chromium-only today) — see App.tsx.
export {};

interface FileSystemAccessPickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface FileSystemAccessOpenOptions {
  types?: FileSystemAccessPickerAcceptType[];
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
}

interface FileSystemAccessSaveOptions {
  types?: FileSystemAccessPickerAcceptType[];
  excludeAcceptAllOption?: boolean;
  suggestedName?: string;
}

declare global {
  interface Window {
    showOpenFilePicker?(options?: FileSystemAccessOpenOptions): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?(options?: FileSystemAccessSaveOptions): Promise<FileSystemFileHandle>;
  }
}
