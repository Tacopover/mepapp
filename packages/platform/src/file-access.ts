/** Where an opened or saved file lives: a FileSystemFileHandle on the web, a path on desktop. Only the implementation that made it looks inside. */
export interface FileTarget {
  readonly name: string;
}

export interface FileTypeFilter {
  description: string;
  mimeType: string;
  /** Without the dot, for example 'pdf'. */
  extensions: string[];
}

export interface OpenedFile {
  file: File;
  /** Undefined when the platform cannot write back to the opened file (the web fallback without the File System Access API). */
  target?: FileTarget;
}

export interface SavedFile {
  name: string;
  /** Undefined when the platform downloaded a copy instead of writing to a chosen file. */
  target?: FileTarget;
}

/** A library folder as it is kept in a LibrarySourceRecord: a handle on the web, a path on desktop. */
export type LibraryFolderRef = { dirHandle: FileSystemDirectoryHandle } | { folderPath: string };

export interface FileAccessCapabilities {
  /** Save can write back to an opened file. */
  readonly writeBack: boolean;
  /** pickFolder and readFolder work. */
  readonly folders: boolean;
}

/** File and folder access for the app. Pickers must be the first await in a click handler: a browser grants them only to a fresh user gesture. */
export interface FileAccess {
  readonly capabilities: FileAccessCapabilities;
  /** Resolves undefined when the user cancels. */
  openFile(types: FileTypeFilter[]): Promise<OpenedFile | undefined>;
  writeFile(target: FileTarget, data: Blob): Promise<void>;
  /** Asks for a location and writes the data there. Resolves undefined when the user cancels; a failed write throws. */
  saveFileAs(suggestedName: string, types: FileTypeFilter[], data: Blob): Promise<SavedFile | undefined>;
  /** Resolves undefined when the user cancels. Throws when the platform refuses the folder. */
  pickFolder(): Promise<{ name: string; folder: LibraryFolderRef } | undefined>;
  /** Must run inside a click handler. True when the folder can be read now. */
  requestFolderAccess(folder: LibraryFolderRef): Promise<boolean>;
  /** Top level of the folder only: files with one of the extensions (no dot, any case), sorted by name. Subfolders are skipped. */
  readFolder(folder: LibraryFolderRef, extensions: string[]): Promise<File[]>;
}

/** Yes/no questions to the user. Async, because a desktop dialog cannot block the page the way window.confirm does. */
export interface AppDialogs {
  confirm(message: string): Promise<boolean>;
}

/** Warns before the app window or browser tab closes while there are unsaved changes. */
export interface CloseGuard {
  setUnsavedChanges(unsaved: boolean): void;
}
