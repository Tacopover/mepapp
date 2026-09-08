import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { STAMP_LIBRARY, type NetworkType, type ReconciliationReport, type StampCategory, type StampDefinition } from '@mepapp/core';
import type { PdfDocumentHandle } from '@mepapp/pdf-engine';
import { useSketchScene } from './useSketchScene.js';
import { loadStampBitmap } from './stampBitmap.js';
import { Rail } from './components/Rail.js';
import { QuickAccessStrip } from './components/QuickAccessStrip.js';
import { DockPanel, type DockTabDef } from './components/DockPanel.js';
import { StampsPanel } from './components/StampsPanel.js';
import { PropertiesPanel } from './components/PropertiesPanel.js';
import { StatusBar } from './components/StatusBar.js';
import { DrawingsPanel } from './components/DrawingsPanel.js';
import { MenuButton } from './components/MenuButton.js';
import { IconFlow } from './icons.js';
import type { DisciplineGroup } from './disciplineGroups.js';
import './theme.css';

export interface PdfPageLoadResult {
  bitmap: ImageBitmap;
  pageWidthPt: number; // display-space (post-rotation) dimensions, per @mepapp/core's displayDimensions
  pageHeightPt: number;
  // The still-open document handle, kept so the app can later sync the
  // domain model back into this same PDF (exportToPdf) and download it.
  handle: PdfDocumentHandle;
}

export interface MepSketchAppProps {
  // Kept as a prop (not a direct @mepapp/pdf-engine-mupdf import) so this
  // component stays engine-agnostic — the app shell picks which PdfEngine to wire in.
  onLoadPdfPage: (file: File) => Promise<PdfPageLoadResult>;
  // AGPLv3 section 13: a network service running a modified version of this
  // app must offer the exact corresponding source. The app shell computes
  // this link (it knows the build's commit SHA); this component just shows it.
  correspondingSourceUrl?: string;
  /** Resolves a stamp-library definition's iconRef to a fetchable URL. Defaults to apps/web's copy under /stamps/. */
  resolveStampIconUrl?: (iconRef: string) => string;
}

const DEFAULT_RESOLVE_ICON_URL = (iconRef: string) => `/stamps/${iconRef}`;

// The File System Access API (showOpenFilePicker/showSaveFilePicker) is what
// lets "Save" write straight back to the file the user opened, with no
// download prompt — it's Chromium-only today (not in Firefox/Safari), so
// every call site below feature-detects it and falls back to the old
// download-a-copy behavior where it's missing. That fallback is never a
// regression: it's exactly what this app already did before Save/Save As existed.
function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

const PDF_PICKER_TYPES = [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }];

async function writeToFileHandle(fileHandle: FileSystemFileHandle, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

function downloadPdfBytes(bytes: Uint8Array<ArrayBuffer>, fileName: string): void {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export function MepSketchApp({ onLoadPdfPage, correspondingSourceUrl, resolveStampIconUrl = DEFAULT_RESOLVE_ICON_URL }: MepSketchAppProps) {
  const {
    containerRef,
    sceneRef,
    ready,
    tool,
    selection,
    allStamps,
    networkSummaries,
    networkTypes,
    zoom,
    calibration,
    measurementMm,
    calibrationPrompt,
    setCalibrationPrompt,
    textboxPrompt,
    setTextboxPrompt,
    drawingSummary,
    flowResult,
    documents,
    activeDocumentId,
    activePdfHandle,
  } = useSketchScene();

  const [status, setStatus] = useState('');
  const [calibrationInput, setCalibrationInput] = useState('');
  const [textboxInput, setTextboxInput] = useState('');
  const [capacityInput, setCapacityInput] = useState('');
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null);
  const [disciplineGroup, setDisciplineGroup] = useState<DisciplineGroup | null>(null);
  const [activeDefinitionId, setActiveDefinitionId] = useState<string | null>(null);
  const [activeNetworkTypeId, setActiveNetworkTypeId] = useState<string | null>(null);
  const textboxRef = useRef<HTMLTextAreaElement | null>(null);

  // Deferred, not `autoFocus`: the click that opens this prompt is the same
  // mousedown/mouseup the browser is still processing its own default focus
  // handling for (canvas isn't focusable, so that default action lands focus
  // back on <body>) — focusing synchronously during that same gesture loses
  // the race and the immediate blur dismisses the prompt before it's ever
  // seen. Waiting a macrotask lets that default action finish first.
  useEffect(() => {
    if (!textboxPrompt) return;
    const id = setTimeout(() => textboxRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [textboxPrompt]);

  const activeDoc = documents.find((d) => d.id === activeDocumentId) ?? null;
  const sheetName = activeDoc?.hasPdf ? activeDoc.fileName : null;
  const pdfHandle = activePdfHandle;

  // A document's FileSystemFileHandle, when "Open"/"Save As" got one from the
  // File System Access API — keyed by document id so "Save" knows which real
  // file to write back to. Not scene state: @mepapp/render stays platform-
  // agnostic (see its IconBitmapResolver layering), and this is a browser-only
  // concern. A plain ref, not state: it's write-target bookkeeping, never rendered.
  const fileHandlesRef = useRef(new Map<string, FileSystemFileHandle>());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetches a stamp-library icon's actual bytes for loadProjectFromJson/loadFromPdf to rebuild a restored stamp's sprite —
  // SketchScene has no fetch of its own, same layering as resolveStampIconUrl/StampsPanel.
  const resolveStampIconBitmap = useCallback(
    async (iconRef: string) => {
      const res = await fetch(resolveStampIconUrl(iconRef));
      const blob = await res.blob();
      const definition = STAMP_LIBRARY.find((def) => def.iconRef === iconRef);
      return loadStampBitmap(blob, definition && { widthPt: definition.nativeWidth, heightPt: definition.nativeHeight });
    },
    [resolveStampIconUrl],
  );

  const openPdfFile = useCallback(
    async (file: File, fileHandle: FileSystemFileHandle | null) => {
      // Reopening a file already open elsewhere in the document list just
      // switches to its tab — no re-parse, no duplicate — see decisions log
      // 2026-09-07's multi-document plan, D3.
      const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
      const existingId = sceneRef.current?.findDocumentByFileKey(fileKey);
      if (existingId) {
        sceneRef.current?.activateDocument(existingId);
        if (fileHandle) fileHandlesRef.current.set(existingId, fileHandle);
        setStatus(`Switched to already-open ${file.name}.`);
        return;
      }

      setStatus(`Loading ${file.name}...`);
      try {
        const { bitmap, pageWidthPt, pageHeightPt, handle } = await onLoadPdfPage(file);
        const docId = sceneRef.current?.openDocument(bitmap, pageWidthPt, pageHeightPt, { fileKey, fileName: file.name, handle });
        if (docId && fileHandle) fileHandlesRef.current.set(docId, fileHandle);
        // Loads this PDF's own embedded project data (if any) and compares
        // its annotations against that domain model — see decisions log
        // 2026-09-06's reconciliation policy: flag drift/missing, never
        // silently resolve either way. The user never sees this as a separate
        // "project file" — Open/Save hide it entirely, it's just "the PDF."
        const report = sceneRef.current ? await sceneRef.current.loadFromPdf(handle, resolveStampIconBitmap) : null;
        setReconciliation(report && (report.drifted.length > 0 || report.missingIds.length > 0) ? report : null);
        setStatus(`Loaded ${file.name} (${pageWidthPt.toFixed(1)} x ${pageHeightPt.toFixed(1)} pt)`);
      } catch (err) {
        setStatus(`Failed to load ${file.name}: ${(err as Error).message}`);
      }
    },
    [onLoadPdfPage, resolveStampIconBitmap, sceneRef],
  );

  // The hidden <input type="file"> below is the fallback path for browsers
  // without the File System Access API — its onChange calls this directly.
  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = ''; // so picking the same file twice in a row still fires onChange
      if (file) void openPdfFile(file, null);
    },
    [openPdfFile],
  );

  const handleOpenPdf = useCallback(async () => {
    if (!supportsFileSystemAccess()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const [fileHandle] = await window.showOpenFilePicker!({ types: PDF_PICKER_TYPES });
      const file = await fileHandle.getFile();
      await openPdfFile(file, fileHandle);
    } catch (err) {
      if (!isAbortError(err)) setStatus(`Failed to open PDF: ${(err as Error).message}`);
    }
  }, [openPdfFile]);

  const handleActivateDocument = useCallback(
    (id: string) => {
      sceneRef.current?.activateDocument(id);
      setReconciliation(null); // tied to the load that produced it, not something to resurrect on tab-switch-back
    },
    [sceneRef],
  );

  const handleCloseDocument = useCallback(
    (id: string) => {
      const target = documents.find((d) => d.id === id);
      if (target?.isDirty && !window.confirm(`"${target.fileName}" has unsaved changes. Close anyway?`)) return;
      sceneRef.current?.closeDocument(id);
    },
    [documents, sceneRef],
  );

  // Shared by Save and Save As: writes the current drawing into the open
  // PDF's annotations and embedded project data, then returns the resulting
  // file bytes. Always runs first — otherwise a placed stamp/segment never
  // reaches the file if the user saves without an explicit sync step first
  // (see decisions log: this was shipping PDFs with no stamps).
  const syncAndGetPdfBytes = useCallback(async (): Promise<Uint8Array<ArrayBuffer> | null> => {
    if (!sceneRef.current || !pdfHandle) return null;
    await sceneRef.current.exportToPdf(pdfHandle);
    setReconciliation(null);
    return new Uint8Array(await pdfHandle.save());
  }, [pdfHandle, sceneRef]);

  // Prompts for a new file location (or downloads a copy, on browsers without
  // the File System Access API) and remembers it as the active document's
  // save target from here on.
  const saveAsNewFile = useCallback(
    async (bytes: Uint8Array<ArrayBuffer>) => {
      const suggestedName = activeDoc?.fileName ?? 'mepapp-drawing.pdf';
      if (!supportsFileSystemAccess()) {
        downloadPdfBytes(bytes, suggestedName);
        setStatus(`Downloaded ${suggestedName}.`);
        return;
      }
      try {
        const fileHandle = await window.showSaveFilePicker!({ suggestedName, types: PDF_PICKER_TYPES });
        await writeToFileHandle(fileHandle, bytes);
        if (activeDocumentId) {
          fileHandlesRef.current.set(activeDocumentId, fileHandle);
          sceneRef.current?.renameDocument(activeDocumentId, fileHandle.name);
        }
        setStatus(`Saved as ${fileHandle.name}.`);
      } catch (err) {
        if (!isAbortError(err)) setStatus(`Failed to save: ${(err as Error).message}`);
      }
    },
    [activeDoc, activeDocumentId, sceneRef],
  );

  const handleSave = useCallback(async () => {
    const bytes = await syncAndGetPdfBytes();
    if (!bytes) return;
    const fileHandle = activeDocumentId ? fileHandlesRef.current.get(activeDocumentId) : undefined;
    if (fileHandle) {
      try {
        await writeToFileHandle(fileHandle, bytes);
        setStatus(`Saved ${activeDoc?.fileName ?? 'the drawing'}.`);
      } catch (err) {
        setStatus(`Failed to save: ${(err as Error).message}`);
      }
      return;
    }
    // Never saved to a real file yet (opened via the legacy file-picker
    // fallback, or this is a brand new document) — first save behaves like Save As.
    await saveAsNewFile(bytes);
  }, [activeDoc, activeDocumentId, saveAsNewFile, syncAndGetPdfBytes]);

  const handleSaveAs = useCallback(async () => {
    const bytes = await syncAndGetPdfBytes();
    if (!bytes) return;
    await saveAsNewFile(bytes);
  }, [saveAsNewFile, syncAndGetPdfBytes]);

  const handleCustomStampFile = useCallback(
    async (file: File, category: StampCategory) => {
      const bitmap = await loadStampBitmap(file);
      sceneRef.current?.setStampTexture(bitmap);
      sceneRef.current?.setTool(category === 'equipment' ? 'place-equipment' : 'place-terminal');
      setActiveDefinitionId(null);
      setStatus(`Stamp art ready: ${file.name} — click the canvas to place it.`);
    },
    [sceneRef],
  );

  const handleStampPick = useCallback((definition: StampDefinition) => {
    setActiveDefinitionId(definition.id);
    setStatus(`${definition.label} ready — click the canvas to place it.`);
  }, []);

  const handleNetworkTypePick = useCallback(
    (type: NetworkType) => {
      sceneRef.current?.setActiveNetworkType(type);
      setActiveNetworkTypeId(type.id);
      setStatus(`${type.name} is now the active network type — new segments will be tagged with it.`);
    },
    [sceneRef],
  );

  const handleRenameNetworkType = useCallback(
    (id: string, name: string) => {
      sceneRef.current?.renameNetworkType(id, name);
    },
    [sceneRef],
  );

  const totalFlowCapacity = flowResult
    ? flowResult
        .flatMap((r) => Object.values(r.segmentCapacity))
        .filter((c): c is number => c !== null)
        .reduce((sum, c) => sum + c, 0)
    : null;

  const dockTabDefs: DockTabDef[] = [
    { id: 'stamps', label: 'Stamps' },
    { id: 'drawings', label: 'Drawings' },
    { id: 'networks', label: 'Networks' },
    { id: 'properties', label: 'Properties' },
  ];

  const dockContent: Record<string, ReactNode> = {
    stamps: (
      <StampsPanel
        sceneRef={sceneRef}
        disciplineGroup={disciplineGroup}
        onChangeDisciplineGroup={setDisciplineGroup}
        activeDefinitionId={activeDefinitionId}
        onPick={handleStampPick}
        onCustomStampFile={handleCustomStampFile}
        resolveIconUrl={resolveStampIconUrl}
        networkTypes={networkTypes}
        activeNetworkTypeId={activeNetworkTypeId}
        onPickNetworkType={handleNetworkTypePick}
        onRenameNetworkType={handleRenameNetworkType}
      />
    ),
    drawings: (
      <DrawingsPanel documents={documents} activeDocumentId={activeDocumentId} onActivate={handleActivateDocument} onClose={handleCloseDocument} />
    ),
    networks: (
      <div>
        <div className="mep-section">
          <button className="mep-icon-btn" onClick={() => sceneRef.current?.computeFlow()}>
            <IconFlow size={13} /> Solve flow
          </button>
          {totalFlowCapacity !== null && (
            <div className="mep-flow-result" style={{ marginTop: 8 }}>
              {totalFlowCapacity} total capacity across {flowResult?.length ?? 0} network{flowResult?.length === 1 ? '' : 's'}
            </div>
          )}
        </div>
        <div className="mep-empty-panel">Network tree — coming soon.</div>
      </div>
    ),
    properties: <PropertiesPanel sceneRef={sceneRef} selection={selection} capacityInput={capacityInput} setCapacityInput={setCapacityInput} />,
  };

  const [forcedTabId, setForcedTabId] = useState<string | null>(null);
  const [forcedTabNonce, setForcedTabNonce] = useState(0);
  useEffect(() => {
    setForcedTabId(selection.length > 0 ? 'properties' : null);
    setForcedTabNonce((n) => n + 1);
  }, [selection]);

  return (
    <div className="mep-app">
      <div className="mep-header">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
        <MenuButton onOpenPdf={handleOpenPdf} onSave={handleSave} onSaveAs={handleSaveAs} pdfLoaded={pdfHandle !== null} />
        <span className="mep-title">{sheetName ?? 'No sheet loaded'}</span>
        <div className="mep-fill" />
        {status && <span className="mep-header-status">{status}</span>}
      </div>

      {reconciliation && (
        <div className="mep-banner">
          This PDF's annotations differ from its saved project data since it was last opened here.{' '}
          {reconciliation.missingIds.length > 0 && (
            <span>{reconciliation.missingIds.length} annotation{reconciliation.missingIds.length === 1 ? '' : 's'} missing (deleted in another viewer). </span>
          )}
          {reconciliation.drifted.length > 0 && (
            <span>{reconciliation.drifted.length} annotation{reconciliation.drifted.length === 1 ? '' : 's'} moved in another viewer. </span>
          )}
          Click "Save" to rewrite them from the current drawing, or edit the drawing first if you want to keep the other viewer's changes instead.{' '}
          <button onClick={() => setReconciliation(null)}>Dismiss</button>
        </div>
      )}

      <div className="mep-body">
        <div className="mep-canvas-wrap" ref={containerRef}>
          {!ready && <div className="mep-canvas-init">Initializing canvas…</div>}
          {ready && (
            <>
              <Rail
                tool={tool}
                sceneRef={sceneRef}
                stampReady={activeDefinitionId !== null || tool === 'place-terminal' || tool === 'place-equipment'}
                canUndo={drawingSummary.canUndo}
                canRedo={drawingSummary.canRedo}
                onUndo={() => sceneRef.current?.undoDrawing()}
                onRedo={() => sceneRef.current?.redoDrawing()}
              />
              <QuickAccessStrip
                tool={tool}
                sceneRef={sceneRef}
                stampReady={activeDefinitionId !== null || tool === 'place-terminal' || tool === 'place-equipment'}
              />
              {textboxPrompt && (
                <textarea
                  ref={textboxRef}
                  rows={2}
                  className="mep-textbox-prompt"
                  style={{ left: textboxPrompt.screenPosition.x, top: textboxPrompt.screenPosition.y }}
                  value={textboxInput}
                  onChange={(e) => setTextboxInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      textboxPrompt.resolve(textboxInput);
                      setTextboxPrompt(null);
                      setTextboxInput('');
                    } else if (e.key === 'Escape') {
                      textboxPrompt.resolve(null);
                      setTextboxPrompt(null);
                      setTextboxInput('');
                    }
                  }}
                  onBlur={() => {
                    textboxPrompt.resolve(textboxInput);
                    setTextboxPrompt(null);
                    setTextboxInput('');
                  }}
                />
              )}
            </>
          )}
        </div>
        <DockPanel tabs={dockTabDefs} content={dockContent} forcedTabId={forcedTabId} forcedTabNonce={forcedTabNonce} />
      </div>

      <StatusBar zoom={zoom} calibration={calibration} measurementMm={measurementMm} selectedCount={selection.length} drawingSummary={drawingSummary} />

      {calibrationPrompt && (
        <div className="mep-modal-backdrop">
          <div className="mep-modal">
            <p>Known real-world distance between the two clicked points (mm):</p>
            <input autoFocus type="number" value={calibrationInput} onChange={(e) => setCalibrationInput(e.target.value)} />
            <div className="mep-modal-actions">
              <button
                onClick={() => {
                  calibrationPrompt.resolve(null);
                  setCalibrationPrompt(null);
                  setCalibrationInput('');
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  calibrationPrompt.resolve(Number(calibrationInput));
                  setCalibrationPrompt(null);
                  setCalibrationInput('');
                }}
              >
                Set calibration
              </button>
            </div>
          </div>
        </div>
      )}

      {correspondingSourceUrl && (
        <div className="mep-source-footer">
          MepApp is AGPLv3 licensed.{' '}
          <a href={correspondingSourceUrl} target="_blank" rel="noreferrer">
            View the source code for this exact version
          </a>
          .
        </div>
      )}
    </div>
  );
}
