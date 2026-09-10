import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { STAMP_LIBRARY, type NetworkType, type ReconciliationReport, type StampCategory, type StampDefinition } from '@mepapp/core';
import { DEFAULT_SNAP_RADIUS_SCREEN_PX } from '@mepapp/render';
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
import { NetworkTreePanel } from './components/NetworkTreePanel.js';
import { MenuButton } from './components/MenuButton.js';
import { Dialog } from './components/Dialog.js';
import { SettingsDialog, MIN_SNAP_RADIUS_PX, MAX_SNAP_RADIUS_PX } from './components/SettingsDialog.js';
import { GlobalPropertiesDialog, type GlobalPropertyDefs } from './components/GlobalPropertiesDialog.js';
import { ManageBuildingsDialog } from './components/ManageBuildingsDialog.js';
import { ElementEditorDialog } from './components/ElementEditorDialog.js';
import { NetworkTypeEditorDialog, type NetworkTypeVisualsPatch } from './components/NetworkTypeEditorDialog.js';
import { loadBuildings, saveBuildings, type Building } from './buildings.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
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
  /** Renders a different page of an already-open handle — status bar page navigation, reusing the open PDF instead of re-parsing the file. */
  onLoadPdfPageAt: (handle: PdfDocumentHandle, pageIndex: number) => Promise<PdfPageLoadResult>;
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

const SNAP_RADIUS_STORAGE_KEY = 'mepapp.settings.snapRadiusPx.v1';
const ONBOARDING_STORAGE_KEY = 'mepapp.onboarding.seen.v1';
const CUSTOM_PROPERTIES_STORAGE_KEY = 'mepapp.customProperties.v1';
const EMPTY_CUSTOM_PROPERTY_DEFS: GlobalPropertyDefs = { terminal: [], equipment: [] };

function loadCustomPropertyDefs(): GlobalPropertyDefs {
  try {
    const raw = localStorage.getItem(CUSTOM_PROPERTIES_STORAGE_KEY);
    if (!raw) return EMPTY_CUSTOM_PROPERTY_DEFS;
    const parsed = JSON.parse(raw) as Partial<GlobalPropertyDefs>;
    return {
      terminal: Array.isArray(parsed.terminal) ? parsed.terminal : [],
      equipment: Array.isArray(parsed.equipment) ? parsed.equipment : [],
    };
  } catch {
    return EMPTY_CUSTOM_PROPERTY_DEFS;
  }
}

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

export function MepSketchApp({
  onLoadPdfPage,
  onLoadPdfPageAt,
  correspondingSourceUrl,
  resolveStampIconUrl = DEFAULT_RESOLVE_ICON_URL,
}: MepSketchAppProps) {
  const {
    containerRef,
    sceneRef,
    ready,
    tool,
    selection,
    hasSelection,
    allStamps,
    networkSummaries,
    networkTypes,
    customStampDefinitions,
    zoom,
    pageIndex,
    pageCount,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [globalPropertiesOpen, setGlobalPropertiesOpen] = useState(false);
  const [customPropertyDefs, setCustomPropertyDefs] = useState<GlobalPropertyDefs>(loadCustomPropertyDefs);
  const [manageBuildingsOpen, setManageBuildingsOpen] = useState(false);
  /** Element Editor dialog target — 'create' for a brand-new custom element, or the definitionId being re-authored via a placed instance's "Edit ports…" (see PropertiesPanel). */
  const [elementEditorTarget, setElementEditorTarget] = useState<{ mode: 'create' } | { mode: 'edit'; definitionId: string } | null>(null);
  const [networkTypeEditorTarget, setNetworkTypeEditorTarget] = useState<NetworkType | null>(null);
  const [buildings, setBuildings] = useState<Building[]>(loadBuildings);
  const [onboardingSeen, setOnboardingSeen] = useState(() => localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1');
  const [snapRadiusPx, setSnapRadiusPx] = useState(() => {
    const saved = Number(localStorage.getItem(SNAP_RADIUS_STORAGE_KEY));
    return saved >= MIN_SNAP_RADIUS_PX && saved <= MAX_SNAP_RADIUS_PX ? saved : DEFAULT_SNAP_RADIUS_SCREEN_PX;
  });
  const textboxRef = useRef<HTMLTextAreaElement | null>(null);

  // Applies the persisted/user-set snap radius to the scene once it exists
  // (SketchScene itself always starts at its own hardcoded default) and again
  // whenever Settings changes it.
  useEffect(() => {
    if (ready) sceneRef.current?.setSnapRadius(snapRadiusPx);
  }, [ready, snapRadiusPx, sceneRef]);

  const handleChangeSnapRadiusPx = useCallback((px: number) => {
    setSnapRadiusPx(px);
    localStorage.setItem(SNAP_RADIUS_STORAGE_KEY, String(px));
  }, []);

  const handleDismissOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    setOnboardingSeen(true);
  }, []);

  const handleSaveCustomPropertyDefs = useCallback(
    (next: GlobalPropertyDefs) => {
      sceneRef.current?.applyCustomPropertyCascade('terminal', customPropertyDefs.terminal, next.terminal);
      sceneRef.current?.applyCustomPropertyCascade('equipment', customPropertyDefs.equipment, next.equipment);
      setCustomPropertyDefs(next);
      localStorage.setItem(CUSTOM_PROPERTIES_STORAGE_KEY, JSON.stringify(next));
      setGlobalPropertiesOpen(false);
    },
    [sceneRef, customPropertyDefs],
  );

  const handleChangeBuildings = useCallback((next: Building[]) => {
    setBuildings(next);
    saveBuildings(next);
  }, []);

  /** Status bar's page nav — reuses the already-open PDF handle, no re-parse. View-only: see SketchScene.setBackdropPage. */
  const handleChangePage = useCallback(
    async (nextPageIndex: number) => {
      if (!activePdfHandle) return;
      const { bitmap, pageWidthPt, pageHeightPt } = await onLoadPdfPageAt(activePdfHandle, nextPageIndex);
      sceneRef.current?.setBackdropPage(bitmap, pageWidthPt, pageHeightPt, nextPageIndex);
    },
    [activePdfHandle, onLoadPdfPageAt, sceneRef],
  );

  // Deferred, not `autoFocus`: the click that opens this prompt is the same
  // mousedown/mouseup the browser is still processing its own default focus
  // handling for (canvas isn't focusable, so that default action lands focus
  // back on <body>) — focusing synchronously during that same gesture loses
  // the race and the immediate blur dismisses the prompt before it's ever
  // seen. Waiting a macrotask lets that default action finish first.
  useEffect(() => {
    if (!textboxPrompt) return;
    setTextboxInput(textboxPrompt.initialText);
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
      // A custom (Element Editor-authored) definition's iconRef is already a
      // self-contained `data:` URL — fetch() handles those directly, so skip
      // resolveStampIconUrl's fixture-relative `/stamps/` prefixing for it.
      const res = await fetch(iconRef.startsWith('data:') ? iconRef : resolveStampIconUrl(iconRef));
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

  const handleSaveElementDefinition = useCallback(
    (definition: StampDefinition) => {
      if (elementEditorTarget?.mode === 'edit') {
        sceneRef.current?.updateCustomStampDefinition(definition.id, definition);
        setStatus(`${definition.label} updated.`);
      } else {
        sceneRef.current?.addCustomStampDefinition(definition);
        setStatus(`${definition.label} created — pick it from the Stamps tab to place it.`);
      }
      setElementEditorTarget(null);
    },
    [elementEditorTarget, sceneRef],
  );

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

  const handleSaveNetworkTypeVisuals = useCallback(
    (id: string, patch: NetworkTypeVisualsPatch) => {
      sceneRef.current?.updateNetworkTypeVisuals(id, patch);
      setNetworkTypeEditorTarget(null);
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
        customStampDefinitions={customStampDefinitions}
        onCreateCustomElement={() => setElementEditorTarget({ mode: 'create' })}
        resolveIconUrl={resolveStampIconUrl}
        networkTypes={networkTypes}
        activeNetworkTypeId={activeNetworkTypeId}
        onPickNetworkType={handleNetworkTypePick}
        onRenameNetworkType={handleRenameNetworkType}
        onEditNetworkTypeVisuals={setNetworkTypeEditorTarget}
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
        <NetworkTreePanel
          sceneRef={sceneRef}
          networkSummaries={networkSummaries}
          allStamps={allStamps}
          selection={selection}
          onRenameNetworkType={handleRenameNetworkType}
        />
      </div>
    ),
    properties: (
      <PropertiesPanel
        sceneRef={sceneRef}
        selection={selection}
        capacityInput={capacityInput}
        setCapacityInput={setCapacityInput}
        customPropertyDefs={customPropertyDefs}
        customStampDefinitions={customStampDefinitions}
        onEditPorts={(definitionId) => setElementEditorTarget({ mode: 'edit', definitionId })}
      />
    ),
  };

  const [forcedTabId, setForcedTabId] = useState<string | null>(null);
  const [forcedTabNonce, setForcedTabNonce] = useState(0);
  useEffect(() => {
    setForcedTabId(selection.length > 0 ? 'properties' : null);
    setForcedTabNonce((n) => n + 1);
  }, [selection]);

  return (
    <div className="mep-app">
      {!onboardingSeen && <WelcomeScreen onDismiss={handleDismissOnboarding} />}
      <div className="mep-header">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
        <MenuButton
          onOpenPdf={handleOpenPdf}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenGlobalProperties={() => setGlobalPropertiesOpen(true)}
          onOpenManageBuildings={() => setManageBuildingsOpen(true)}
          pdfLoaded={pdfHandle !== null}
        />
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
                hasSelection={hasSelection}
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

      <StatusBar
        zoom={zoom}
        onZoomBy={(factor) => sceneRef.current?.zoomBy(factor)}
        onResetZoom={() => sceneRef.current?.resetZoom()}
        pageIndex={pageIndex}
        pageCount={pageCount}
        onChangePage={(next) => void handleChangePage(next)}
        calibration={calibration}
        measurementMm={measurementMm}
        selectedCount={selection.length}
        drawingSummary={drawingSummary}
      />

      {calibrationPrompt && (
        <Dialog
          title="Calibration"
          onClose={() => {
            calibrationPrompt.resolve(null);
            setCalibrationPrompt(null);
            setCalibrationInput('');
          }}
          actions={
            <>
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
            </>
          }
        >
          <p>Known real-world distance between the two clicked points (mm):</p>
          <input autoFocus type="number" value={calibrationInput} onChange={(e) => setCalibrationInput(e.target.value)} />
        </Dialog>
      )}

      {settingsOpen && (
        <SettingsDialog snapRadiusPx={snapRadiusPx} onChangeSnapRadiusPx={handleChangeSnapRadiusPx} onClose={() => setSettingsOpen(false)} />
      )}

      {globalPropertiesOpen && (
        <GlobalPropertiesDialog
          definitions={customPropertyDefs}
          onSave={handleSaveCustomPropertyDefs}
          onClose={() => setGlobalPropertiesOpen(false)}
        />
      )}

      {manageBuildingsOpen && (
        <ManageBuildingsDialog
          buildings={buildings}
          onChange={handleChangeBuildings}
          currentDocumentFileName={sheetName}
          onClose={() => setManageBuildingsOpen(false)}
        />
      )}

      {elementEditorTarget && (
        <ElementEditorDialog
          definition={elementEditorTarget.mode === 'edit' ? customStampDefinitions.find((d) => d.id === elementEditorTarget.definitionId) : undefined}
          onSave={handleSaveElementDefinition}
          onClose={() => setElementEditorTarget(null)}
        />
      )}

      {networkTypeEditorTarget && (
        <NetworkTypeEditorDialog
          networkType={networkTypeEditorTarget}
          onSave={handleSaveNetworkTypeVisuals}
          onClose={() => setNetworkTypeEditorTarget(null)}
        />
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
