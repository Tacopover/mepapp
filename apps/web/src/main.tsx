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
  return { bitmap, pageWidthPt: displayed.widthPt, pageHeightPt: displayed.heightPt };
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<MepSketchApp onLoadPdfPage={loadPdfPage} />);
}
