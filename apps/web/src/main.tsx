import { createRoot } from 'react-dom/client';
import { MepSketchApp, type PdfPageLoadResult } from '@mepapp/ui';
import { displayDimensions } from '@mepapp/core';
import { MupdfEngine } from '@mepapp/pdf-engine-mupdf';
import type { PdfDocumentHandle } from '@mepapp/pdf-engine';
import type { AppDialogs, BuildingRef, BuildingStorageKind, BuildingStore, CloseGuard, FileAccess } from '@mepapp/platform';
import {
  createDevBuildingStore,
  createWebBuildingStores,
  IndexedDbLibraryStore,
  WebAppDialogs,
  WebCloseGuard,
  WebFileAccess,
} from '@mepapp/platform-web';
import { createPlacementWorker, createRoomDetectionClient } from './roomDetectionClient';

const BACKDROP_DPI = 150;

const devBuildingStore = import.meta.env.DEV ? createDevBuildingStore() : undefined;
let adoptBuilding: ((store: BuildingStore) => Promise<void>) | null = null;
if (devBuildingStore) {
  (window as unknown as { __mepBuilding: unknown }).__mepBuilding = {
    load: async (json: string, summaries?: Record<string, string>) => {
      devBuildingStore.load(json, summaries);
      await adoptBuilding?.(devBuildingStore);
    },
    read: () => devBuildingStore.read(),
    store: devBuildingStore,
  };
}

const engine = new MupdfEngine();
const libraryStore = new IndexedDbLibraryStore();

async function loadPdfPage(file: File): Promise<PdfPageLoadResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await engine.openDocument(bytes);
  return loadPdfPageAt(doc, 0);
}

/** Renders a different page of an already-open handle — the status bar's page navigation, reusing the same open PDF rather than re-parsing the file. */
async function loadPdfPageAt(handle: PdfDocumentHandle, pageIndex: number): Promise<PdfPageLoadResult> {
  const info = handle.getPageInfo(pageIndex);
  const bitmap = await handle.renderPageToRaster(pageIndex, { dpi: BACKDROP_DPI });
  const displayed = displayDimensions({ widthPt: info.widthPt, heightPt: info.heightPt }, info.rotationDegrees);
  return { bitmap, pageWidthPt: displayed.widthPt, pageHeightPt: displayed.heightPt, handle };
}

const REPO_URL = 'https://github.com/Tacopover/mepapp';
const correspondingSourceUrl = `${REPO_URL}/tree/${__MEPAPP_COMMIT_SHA__}`;

const isTauri = '__TAURI_INTERNALS__' in window;

// The desktop build loads the Tauri platform as its own chunk, so the web build never runs Tauri code.
async function createPlatform(): Promise<{
  fileAccess: FileAccess;
  closeGuard: CloseGuard;
  dialogs: AppDialogs;
  makeBuildingStore?: (ref: BuildingRef, target?: unknown) => BuildingStore;
  buildingStorage?: BuildingStorageKind;
}> {
  if (isTauri) {
    const { TauriAppDialogs, TauriCloseGuard, TauriFileAccess, createTauriBuildingStore } = await import('@mepapp/platform-tauri');
    return {
      fileAccess: new TauriFileAccess(),
      closeGuard: new TauriCloseGuard(),
      dialogs: new TauriAppDialogs(),
      makeBuildingStore: (ref) => {
        const i = Math.max(ref.location.lastIndexOf('/'), ref.location.lastIndexOf('\\'));
        return createTauriBuildingStore(ref.location.slice(0, i), ref.location.slice(i + 1));
      },
      buildingStorage: 'file',
    };
  }
  const webStores = createWebBuildingStores();
  return {
    fileAccess: new WebFileAccess(),
    closeGuard: new WebCloseGuard(),
    dialogs: new WebAppDialogs(),
    makeBuildingStore: webStores.storage === 'blocked' ? undefined : webStores.make,
    buildingStorage: webStores.storage,
  };
}

// For dev browser checks only: stats a PDF by its file name in the OPFS root.
async function devStatPath(path: string): ReturnType<NonNullable<FileAccess['statPath']>> {
  try {
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle(path)).getFile();
    return { state: 'ok', sizeBytes: file.size, modifiedMs: file.lastModified };
  } catch (err) {
    if ((err as Error).name === 'NotFoundError') return { state: 'missing' };
    return { state: 'no-access' };
  }
}

// For dev browser checks only: reads a PDF by its file name in the OPFS root.
async function devReadPath(path: string): ReturnType<NonNullable<FileAccess['readPath']>> {
  try {
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle(path)).getFile();
    return { file };
  } catch {
    return undefined;
  }
}

const container = document.getElementById('root');
if (container) {
  void createPlatform().then(({ fileAccess: platformFileAccess, closeGuard, dialogs, makeBuildingStore, buildingStorage }) => {
    const fileAccess: FileAccess =
      import.meta.env.DEV && localStorage.getItem('mepapp.webLike') !== '1' && platformFileAccess.statPath === undefined
        ? Object.assign(Object.create(platformFileAccess), { statPath: devStatPath, readPath: devReadPath })
        : platformFileAccess;
    createRoot(container).render(
      <MepSketchApp
        onLoadPdfPage={loadPdfPage}
        onLoadPdfPageAt={loadPdfPageAt}
        correspondingSourceUrl={correspondingSourceUrl}
        createRoomDetectionClient={createRoomDetectionClient}
        createPlacementWorker={createPlacementWorker}
        libraryStore={libraryStore}
        fileAccess={fileAccess}
        closeGuard={closeGuard}
        dialogs={dialogs}
        makeBuildingStore={makeBuildingStore}
        buildingStorage={buildingStorage}
        onBuildingReady={
          import.meta.env.DEV
            ? (api) => {
                adoptBuilding = api?.adopt ?? null;
              }
            : undefined
        }
        pdfEngine={engine}
        onRebuildReady={
          import.meta.env.DEV
            ? (run) => {
                const building = (window as unknown as { __mepBuilding?: Record<string, unknown> }).__mepBuilding;
                if (building) building.rebuildSummaries = run;
              }
            : undefined
        }
      />,
    );
  });
}

// Step 5 (offline caching, browser case) — see public/sw.js for the caching
// strategy. Registered from the app shell, not @mepapp/ui, so the ui package
// stays free of any assumption about how (or whether) it's deployed.
// The desktop (Tauri) build serves every file locally, so it needs no service worker.
if ('serviceWorker' in navigator && !isTauri) {
  const registerSw = () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[mepapp] service worker registration failed:', err);
    });
  };
  // window's `load` event can fire before this module's top-level code runs
  // (e.g. once enough async chunks — PixiJS, the mupdf WASM — have queued
  // up), so a plain `addEventListener('load', ...)` can silently miss it.
  if (document.readyState === 'complete') {
    registerSw();
  } else {
    window.addEventListener('load', registerSw);
  }
}
