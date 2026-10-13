// showOpenFilePicker/showSaveFilePicker aren't in TS's lib.dom.d.ts yet, even
// though the FileSystemFileHandle/FileSystemWritableFileStream types they
// return already are. Only ever called behind a feature check (Chromium-only
// today) — see web-file-access.ts.
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

interface FileSystemAccessDirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

declare global {
  // queryPermission/requestPermission (Chromium-only) are missing from lib.dom.d.ts, and
  // this package's tsconfig has no DOM.AsyncIterable lib, so values() is declared here.
  interface FileSystemHandle {
    queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  }

  interface FileSystemDirectoryHandle {
    values(): AsyncIterable<FileSystemHandle>;
  }

  interface Window {
    showDirectoryPicker?(options?: FileSystemAccessDirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker?(options?: FileSystemAccessOpenOptions): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?(options?: FileSystemAccessSaveOptions): Promise<FileSystemFileHandle>;
  }
}
