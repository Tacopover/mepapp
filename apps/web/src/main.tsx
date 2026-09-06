import { createRoot } from 'react-dom/client';
import { MepSketchApp, type PdfPageLoadResult } from '@mepapp/ui';
import { displayDimensions } from '@mepapp/core';
import { MupdfEngine } from '@mepapp/pdf-engine-mupdf';

const BACKDROP_DPI = 150;

const engine = new MupdfEngine();

async function loadPdfPage(file: File): Promise<PdfPageLoadResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await engine.openDocument(bytes);
  const info = doc.getPageInfo(0);
  const bitmap = await doc.renderPageToRaster(0, { dpi: BACKDROP_DPI });
  const displayed = displayDimensions({ widthPt: info.widthPt, heightPt: info.heightPt }, info.rotationDegrees);
  return { bitmap, pageWidthPt: displayed.widthPt, pageHeightPt: displayed.heightPt, handle: doc };
}

const REPO_URL = 'https://github.com/Tacopover/mepapp';
const correspondingSourceUrl = `${REPO_URL}/tree/${__MEPAPP_COMMIT_SHA__}`;

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<MepSketchApp onLoadPdfPage={loadPdfPage} correspondingSourceUrl={correspondingSourceUrl} />);
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
