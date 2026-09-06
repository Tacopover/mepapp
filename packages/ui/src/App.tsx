import { useCallback, useState, type RefObject } from 'react';
import type { SketchScene, SketchTool } from '@mepapp/render';
import { ProjectLoadError } from '@mepapp/core';
import { useSketchScene } from './useSketchScene.js';

export interface PdfPageLoadResult {
  bitmap: ImageBitmap;
  pageWidthPt: number; // display-space (post-rotation) dimensions, per @mepapp/core's displayDimensions
  pageHeightPt: number;
}

export interface MepSketchAppProps {
  // Kept as a prop (not a direct @mepapp/pdf-engine-mupdf import) so this
  // component stays engine-agnostic — the app shell picks which PdfEngine to wire in.
  onLoadPdfPage: (file: File) => Promise<PdfPageLoadResult>;
  // AGPLv3 section 13: a network service running a modified version of this
  // app must offer the exact corresponding source. The app shell computes
  // this link (it knows the build's commit SHA); this component just shows it.
  correspondingSourceUrl?: string;
}

function ToolButton(props: { tool: SketchTool; current: SketchTool; sceneRef: RefObject<SketchScene | null>; label: string }) {
  return (
    <button onClick={() => props.sceneRef.current?.setTool(props.tool)} style={{ fontWeight: props.tool === props.current ? 'bold' : 'normal' }}>
      {props.label}
    </button>
  );
}

export function MepSketchApp({ onLoadPdfPage, correspondingSourceUrl }: MepSketchAppProps) {
  const {
    containerRef,
    sceneRef,
    ready,
    tool,
    selection,
    calibration,
    measurementMm,
    calibrationPrompt,
    setCalibrationPrompt,
    drawingSummary,
    flowResult,
  } = useSketchScene();
  const [status, setStatus] = useState('');
  const [calibrationInput, setCalibrationInput] = useState('');
  const [capacityInput, setCapacityInput] = useState('');

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
        sceneRef.current?.loadProjectFromJson(raw);
        setStatus(`Loaded project from ${file.name}.`);
      } catch (err) {
        const message = err instanceof ProjectLoadError ? `${err.message}: ${JSON.stringify(err.issues)}` : (err as Error).message;
        setStatus(`Failed to load ${file.name}: ${message}`);
      }
    },
    [sceneRef],
  );

  const handlePdfFile = useCallback(
    async (file: File) => {
      setStatus(`Loading ${file.name}...`);
      try {
        const { bitmap, pageWidthPt, pageHeightPt } = await onLoadPdfPage(file);
        sceneRef.current?.setBackdrop(bitmap, pageWidthPt, pageHeightPt);
        setStatus(`Loaded ${file.name} (${pageWidthPt.toFixed(1)} x ${pageHeightPt.toFixed(1)} pt)`);
      } catch (err) {
        setStatus(`Failed to load ${file.name}: ${(err as Error).message}`);
      }
    },
    [onLoadPdfPage, sceneRef],
  );

  const handleStampFile = useCallback(
    async (file: File) => {
      const bitmap = await createImageBitmap(file);
      sceneRef.current?.setStampTexture(bitmap);
      setStatus(`Stamp art ready: ${file.name} — switch to "Place stamp" and click the canvas.`);
    },
    [sceneRef],
  );

  const singleSelected = selection.length === 1 ? selection[0] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', gap: 12, padding: 8, background: '#1c1c1c', color: '#eee', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          PDF:{' '}
          <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && handlePdfFile(e.target.files[0])} />
        </label>
        <label>
          Stamp:{' '}
          <input type="file" accept="image/png" onChange={(e) => e.target.files?.[0] && handleStampFile(e.target.files[0])} />
        </label>
        <ToolButton tool="select" current={tool} sceneRef={sceneRef} label="Select" />
        <ToolButton tool="place-stamp" current={tool} sceneRef={sceneRef} label="Place stamp" />
        <ToolButton tool="draw-segment" current={tool} sceneRef={sceneRef} label="Draw segment" />
        <ToolButton tool="calibrate" current={tool} sceneRef={sceneRef} label="Calibrate" />
        <ToolButton tool="measure" current={tool} sceneRef={sceneRef} label="Measure" />
        <button onClick={() => sceneRef.current?.rotateSelectionBy(-90)} disabled={selection.length === 0}>
          -90°
        </button>
        <button onClick={() => sceneRef.current?.rotateSelectionBy(90)} disabled={selection.length === 0}>
          +90°
        </button>
        <label>
          {/* Always rendered (disabled when inapplicable) so the toolbar's height
              never changes with selection — a conditional row here would shift
              the canvas underneath the pointer every time selection changes. */}
          Angle:{' '}
          <input
            type="number"
            disabled={!singleSelected}
            value={singleSelected ? Math.round(singleSelected.transform.rotationDegrees * 1000) / 1000 : ''}
            onChange={(e) => sceneRef.current?.setSelectedRotationDegrees(Number(e.target.value))}
            style={{ width: 70 }}
          />
          °
        </label>
        <span>{selection.length} selected</span>
        {calibration && <span>Scale: {calibration.pageUnitsPerRealUnit.toFixed(4)} pt/mm</span>}
        {measurementMm !== null && <span>Last measurement: {measurementMm.toFixed(2)} mm</span>}
        <span style={{ opacity: 0.7 }}>{status}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, padding: 8, background: '#242424', color: '#eee', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => sceneRef.current?.undoDrawing()} disabled={!drawingSummary.canUndo}>
          Undo
        </button>
        <button onClick={() => sceneRef.current?.redoDrawing()} disabled={!drawingSummary.canRedo}>
          Redo
        </button>
        <span>
          {drawingSummary.segmentCount} segment{drawingSummary.segmentCount === 1 ? '' : 's'}, {drawingSummary.fittingCount} fitting
          {drawingSummary.fittingCount === 1 ? '' : 's'}, {drawingSummary.networkCount} network{drawingSummary.networkCount === 1 ? '' : 's'}
        </span>
        <label>
          Capacity:{' '}
          <input
            type="number"
            disabled={!singleSelected}
            value={capacityInput}
            onChange={(e) => setCapacityInput(e.target.value)}
            onBlur={() => singleSelected && sceneRef.current?.setTerminalCapacity(singleSelected.id, Number(capacityInput) || 0)}
            style={{ width: 70 }}
          />
        </label>
        <button onClick={() => sceneRef.current?.computeFlow()}>Solve flow</button>
        {flowResult && (
          <span>
            {flowResult
              .flatMap((r) => Object.values(r.segmentCapacity))
              .filter((c): c is number => c !== null)
              .reduce((sum, c) => sum + c, 0)}{' '}
            total capacity across {flowResult.length} network{flowResult.length === 1 ? '' : 's'}
          </span>
        )}
        <button onClick={handleSaveProject}>Save project</button>
        <label>
          Load project:{' '}
          <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && handleLoadProject(e.target.files[0])} />
        </label>
      </div>
      <div ref={containerRef} style={{ flex: 1, position: 'relative' }}>
        {!ready && <div style={{ position: 'absolute', top: 12, left: 12, color: '#888' }}>Initializing canvas…</div>}
      </div>
      {calibrationPrompt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ background: '#fff', padding: 20, borderRadius: 8, minWidth: 280 }}>
            <p>Known real-world distance between the two clicked points (mm):</p>
            <input
              autoFocus
              type="number"
              value={calibrationInput}
              onChange={(e) => setCalibrationInput(e.target.value)}
              style={{ width: '100%', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
        <div style={{ padding: '4px 8px', background: '#1c1c1c', color: '#888', fontSize: 11 }}>
          MepApp is AGPLv3 licensed.{' '}
          <a href={correspondingSourceUrl} target="_blank" rel="noreferrer" style={{ color: '#7dc4ff' }}>
            View the source code for this exact version
          </a>
          .
        </div>
      )}
    </div>
  );
}
