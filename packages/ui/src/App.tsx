import { useCallback, useState, type RefObject } from 'react';
import type { SketchScene, SketchTool } from '@mepapp/render';
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
}

function ToolButton(props: { tool: SketchTool; current: SketchTool; sceneRef: RefObject<SketchScene | null>; label: string }) {
  return (
    <button onClick={() => props.sceneRef.current?.setTool(props.tool)} style={{ fontWeight: props.tool === props.current ? 'bold' : 'normal' }}>
      {props.label}
    </button>
  );
}

export function MepSketchApp({ onLoadPdfPage }: MepSketchAppProps) {
  const { containerRef, sceneRef, ready, tool, selection, calibration, measurementMm, calibrationPrompt, setCalibrationPrompt } =
    useSketchScene();
  const [status, setStatus] = useState('');
  const [calibrationInput, setCalibrationInput] = useState('');

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
    </div>
  );
}
