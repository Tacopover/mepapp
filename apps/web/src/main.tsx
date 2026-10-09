import { createRoot } from 'react-dom/client';
import { MepSketchApp, type PdfPageLoadResult } from '@mepapp/ui';
import { displayDimensions } from '@mepapp/core';
import { MupdfEngine } from '@mepapp/pdf-engine-mupdf';
import type { PdfDocumentHandle } from '@mepapp/pdf-engine';
import type { AppDialogs, CloseGuard, FileAccess } from '@mepapp/platform';
import { IndexedDbLibraryStore, WebAppDialogs, WebCloseGuard, WebFileAccess } from '@mepapp/platform-web';
import { createRoomDetectionClient } from './roomDetectionClient';

const BACKDROP_DPI = 150;

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
async function createPlatform(): Promise<{ fileAccess: FileAccess; closeGuard: CloseGuard; dialogs: AppDialogs }> {
  if (isTauri) {
    const { TauriAppDialogs, TauriCloseGuard, TauriFileAccess } = await import('@mepapp/platform-tauri');
    return { fileAccess: new TauriFileAccess(), closeGuard: new TauriCloseGuard(), dialogs: new TauriAppDialogs() };
  }
  return { fileAccess: new WebFileAccess(), closeGuard: new WebCloseGuard(), dialogs: new WebAppDialogs() };
}

const container = document.getElementById('root');
if (container) {
  void createPlatform().then(({ fileAccess, closeGuard, dialogs }) => {
    createRoot(container).render(
      <MepSketchApp
        onLoadPdfPage={loadPdfPage}
        onLoadPdfPageAt={loadPdfPageAt}
        correspondingSourceUrl={correspondingSourceUrl}
        createRoomDetectionClient={createRoomDetectionClient}
        libraryStore={libraryStore}
        fileAccess={fileAccess}
        closeGuard={closeGuard}
        dialogs={dialogs}
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
