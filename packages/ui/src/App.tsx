import { useCallback, useState } from 'react';
import { ProjectLoadError, type ReconciliationReport, type StampDefinition } from '@mepapp/core';
import type { PdfDocumentHandle } from '@mepapp/pdf-engine';
import { useSketchScene } from './useSketchScene.js';
import { Toolbar } from './components/Toolbar.js';
import { DockPanel, type DockTab } from './components/DockPanel.js';
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

export function MepSketchApp({ onLoadPdfPage, correspondingSourceUrl, resolveStampIconUrl = DEFAULT_RESOLVE_ICON_URL }: MepSketchAppProps) {
  const {
    containerRef,
    sceneRef,
    ready,
    tool,
    selection,
    allStamps,
    networkSummaries,
    zoom,
    calibration,
    measurementMm,
    calibrationPrompt,
    setCalibrationPrompt,
    drawingSummary,
    flowResult,
    documents,
    activeDocumentId,
    activePdfHandle,
  } = useSketchScene();

  const [status, setStatus] = useState('');
  const [calibrationInput, setCalibrationInput] = useState('');
  const [capacityInput, setCapacityInput] = useState('');
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null);
  const [disciplineGroup, setDisciplineGroup] = useState<DisciplineGroup | null>(null);
  const [activeDefinitionId, setActiveDefinitionId] = useState<string | null>(null);
  const [dockTabId, setDockTabId] = useState('stamps');

  const activeDoc = documents.find((d) => d.id === activeDocumentId) ?? null;
  const sheetName = activeDoc?.hasPdf ? activeDoc.fileName : null;
  const pdfHandle = activePdfHandle;

  // Fetches a stamp-library icon's actual bytes for loadProjectFromJson/loadFromPdf to rebuild a restored stamp's sprite —
  // SketchScene has no fetch of its own, same layering as resolveStampIconUrl/StampsPanel.
  const resolveStampIconBitmap = useCallback(
    async (iconRef: string) => {
      const res = await fetch(resolveStampIconUrl(iconRef));
      const blob = await res.blob();
      return createImageBitmap(blob);
    },
    [resolveStampIconUrl],
  );

  const handleSaveProject = useCallback(() => {
    if (!sceneRef.current) return;
    const doc = sceneRef.current.exportProject();
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mepapp-project.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [sceneRef]);

  const handleLoadProject = useCallback(
    async (file: File) => {
      try {
        const raw = JSON.parse(await file.text());
        await sceneRef.current?.loadProjectFromJson(raw, resolveStampIconBitmap);
        setStatus(`Loaded project from ${file.name}.`);
      } catch (err) {
        const message = err instanceof ProjectLoadError ? `${err.message}: ${JSON.stringify(err.issues)}` : (err as Error).message;
        setStatus(`Failed to load ${file.name}: ${message}`);
      }
    },
    [resolveStampIconBitmap, sceneRef],
  );

  const handlePdfFile = useCallback(
    async (file: File) => {
      // Reopening a file already open elsewhere in the document list just
      // switches to its tab — no re-parse, no duplicate — see decisions log
      // 2026-09-07's multi-document plan, D3.
      const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
      const existingId = sceneRef.current?.findDocumentByFileKey(fileKey);
      if (existingId) {
        sceneRef.current?.activateDocument(existingId);
        setStatus(`Switched to already-open ${file.name}.`);
        return;
      }

      setStatus(`Loading ${file.name}...`);
      try {
        const { bitmap, pageWidthPt, pageHeightPt, handle } = await onLoadPdfPage(file);
        sceneRef.current?.openDocument(bitmap, pageWidthPt, pageHeightPt, { fileKey, fileName: file.name, handle });
        // Loads this PDF's own embedded project JSON (if any) and compares
        // its annotations against that domain model — see decisions log
        // 2026-09-06's reconciliation policy: flag drift/missing, never
        // silently resolve either way.
        const report = sceneRef.current ? await sceneRef.current.loadFromPdf(handle, resolveStampIconBitmap) : null;
        setReconciliation(report && (report.drifted.length > 0 || report.missingIds.length > 0) ? report : null);
        setStatus(`Loaded ${file.name} (${pageWidthPt.toFixed(1)} x ${pageHeightPt.toFixed(1)} pt)`);
      } catch (err) {
        setStatus(`Failed to load ${file.name}: ${(err as Error).message}`);
      }
    },
    [onLoadPdfPage, sceneRef],
  );

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
      if (target?.isDirty && !window.confirm(`"${target.fileName}" has unsynced changes. Close anyway?`)) return;
      sceneRef.current?.closeDocument(id);
    },
    [documents, sceneRef],
  );

  const handleSyncToPdf = useCallback(async () => {
    if (!sceneRef.current || !pdfHandle) return;
    await sceneRef.current.exportToPdf(pdfHandle);
    setReconciliation(null);
    setStatus("Synced the current drawing into the open PDF's annotations and embedded project data.");
  }, [pdfHandle, sceneRef]);

  const handleDownloadPdf = useCallback(async () => {
    if (!pdfHandle) return;
    const bytes = await pdfHandle.save();
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mepapp-drawing.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }, [pdfHandle]);

  const handleCustomStampFile = useCallback(
    async (file: File) => {
      const bitmap = await createImageBitmap(file);
      sceneRef.current?.setStampTexture(bitmap);
      sceneRef.current?.setTool('place-stamp');
      setActiveDefinitionId(null);
      setStatus(`Stamp art ready: ${file.name} — click the canvas to place it.`);
    },
    [sceneRef],
  );

  const handleStampPick = useCallback((definition: StampDefinition) => {
    setActiveDefinitionId(definition.id);
    setStatus(`${definition.label} ready — click the canvas to place it.`);
  }, []);

  const totalFlowCapacity = flowResult
    ? flowResult
        .flatMap((r) => Object.values(r.segmentCapacity))
        .filter((c): c is number => c !== null)
        .reduce((sum, c) => sum + c, 0)
    : null;

  const dockTabs: DockTab[] = [
    {
      id: 'stamps',
      label: 'Stamps',
      content: (
        <StampsPanel
          sceneRef={sceneRef}
          disciplineGroup={disciplineGroup}
          onChangeDisciplineGroup={setDisciplineGroup}
          activeDefinitionId={activeDefinitionId}
          onPick={handleStampPick}
          onCustomStampFile={handleCustomStampFile}
          resolveIconUrl={resolveStampIconUrl}
        />
      ),
    },
    {
      id: 'drawings',
      label: 'Drawings',
      content: (
        <DrawingsPanel documents={documents} activeDocumentId={activeDocumentId} onActivate={handleActivateDocument} onClose={handleCloseDocument} />
      ),
    },
    {
      id: 'networks',
      label: 'Networks',
      content: (
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
    },
    {
      id: 'properties',
      label: 'Properties',
      content: <PropertiesPanel sceneRef={sceneRef} selection={selection} capacityInput={capacityInput} setCapacityInput={setCapacityInput} />,
    },
  ];

  return (
    <div className="mep-app">
      <div className="mep-header">
        <MenuButton
          onOpenPdf={handlePdfFile}
          onSaveProject={handleSaveProject}
          onLoadProject={handleLoadProject}
          onSyncToPdf={handleSyncToPdf}
          onDownloadPdf={handleDownloadPdf}
          pdfLoaded={pdfHandle !== null}
        />
        <span className="mep-title">{sheetName ?? 'No sheet loaded'}</span>
        <div className="mep-fill" />
        {status && <span className="mep-header-status">{status}</span>}
        <button type="button" className="mep-login-btn" disabled>
          Log in
        </button>
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
          Click "Sync to PDF" to rewrite them from the current drawing, or edit the drawing first if you want to keep the other viewer's changes instead.{' '}
          <button onClick={() => setReconciliation(null)}>Dismiss</button>
        </div>
      )}

      <div className="mep-body">
        <div className="mep-canvas-wrap" ref={containerRef}>
          {!ready && <div className="mep-canvas-init">Initializing canvas…</div>}
          {ready && (
            <Toolbar
              tool={tool}
              sceneRef={sceneRef}
              stampReady={activeDefinitionId !== null || tool === 'place-stamp'}
              canUndo={drawingSummary.canUndo}
              canRedo={drawingSummary.canRedo}
              onUndo={() => sceneRef.current?.undoDrawing()}
              onRedo={() => sceneRef.current?.redoDrawing()}
            />
          )}
        </div>
        <DockPanel tabs={dockTabs} activeTabId={dockTabId} onTabChange={setDockTabId} />
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
