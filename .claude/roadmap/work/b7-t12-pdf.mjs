// B7-T12: helpers to put a project JSON into a PDF and to read it back, with mupdf in Node (a script, not product code).
import { readFileSync, writeFileSync } from 'node:fs';

const REPO = '/root/MepApp/.claude/worktrees/buildings-b7';
const mupdf = await import(`${REPO}/packages/pdf-engine-mupdf/node_modules/mupdf/dist/mupdf.js`);
export const EMBEDDED_NAME = 'mepapp-project.json';

/** Writes `outPath`: the PDF at `basePath` with `projectJson` (a string) as its embedded project. */
export function writePdfWithProject(basePath, outPath, projectJson) {
  const doc = new mupdf.PDFDocument(new Uint8Array(readFileSync(basePath)));
  try {
    doc.deleteEmbeddedFile(EMBEDDED_NAME);
  } catch {
    // none yet
  }
  const spec = doc.addEmbeddedFile(EMBEDDED_NAME, 'application/json', new TextEncoder().encode(projectJson), new Date(), new Date(), false);
  doc.insertEmbeddedFile(EMBEDDED_NAME, spec);
  writeFileSync(outPath, doc.saveToBuffer('').asUint8Array());
}

/** The embedded project text of a PDF given as bytes, or null. */
export function readProjectText(bytes) {
  const doc = new mupdf.PDFDocument(bytes);
  const spec = doc.getEmbeddedFiles()[EMBEDDED_NAME];
  if (!spec) return null;
  const contents = doc.getEmbeddedFileContents(spec);
  return contents ? new TextDecoder().decode(contents.asUint8Array()) : null;
}
