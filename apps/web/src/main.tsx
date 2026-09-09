import { createRoot } from 'react-dom/client';
import { MepSketchApp, type PdfPageLoadResult } from '@mepapp/ui';
import { displayDimensions } from '@mepapp/core';
import { MupdfEngine } from '@mepapp/pdf-engine-mupdf';
import type { PdfDocumentHandle } from '@mepapp/pdf-engine';

const BACKDROP_DPI = 150;

const engine = new MupdfEngine();

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

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <MepSketchApp onLoadPdfPage={loadPdfPage} onLoadPdfPageAt={loadPdfPageAt} correspondingSourceUrl={correspondingSourceUrl} />,
  );
}

// Step 5 (offline caching, browser case) — see public/sw.js for the caching
// strategy. Registered from the app shell, not @mepapp/ui, so the ui package
// stays free of any assumption about how (or whether) it's deployed.
if ('serviceWorker' in navigator) {
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
