import { useEffect, useRef, useState, type RefObject } from 'react';
import { SketchScene, type DrawingSummary, type SketchTool, type StampInfo } from '@mepapp/render';
import type { Calibration, FlowResult, Vec2 } from '@mepapp/core';

export interface CalibrationPrompt {
  p1: Vec2;
  p2: Vec2;
  resolve: (knownRealDistanceMm: number | null) => void;
}

export interface UseSketchScene {
  containerRef: RefObject<HTMLDivElement | null>;
  sceneRef: RefObject<SketchScene | null>;
  ready: boolean;
  tool: SketchTool;
  selection: StampInfo[];
  calibration: Calibration | null;
  measurementMm: number | null;
  calibrationPrompt: CalibrationPrompt | null;
  setCalibrationPrompt: (prompt: CalibrationPrompt | null) => void;
  drawingSummary: DrawingSummary;
  flowResult: FlowResult[] | null;
}

const EMPTY_DRAWING_SUMMARY: DrawingSummary = { segmentCount: 0, fittingCount: 0, networkCount: 0, canUndo: false, canRedo: false };

export function useSketchScene(): UseSketchScene {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SketchScene | null>(null);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<SketchTool>('select');
  const [selection, setSelection] = useState<StampInfo[]>([]);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [measurementMm, setMeasurementMm] = useState<number | null>(null);
  const [calibrationPrompt, setCalibrationPrompt] = useState<CalibrationPrompt | null>(null);
  const [drawingSummary, setDrawingSummary] = useState<DrawingSummary>(EMPTY_DRAWING_SUMMARY);
  const [flowResult, setFlowResult] = useState<FlowResult[] | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new SketchScene(containerRef.current);
    sceneRef.current = scene;
    let cancelled = false;

    const onSelectionChanged = (s: StampInfo[]) => setSelection(s);
    const onToolChanged = (t: SketchTool) => setTool(t);
    const onCalibrationSet = (c: Calibration) => setCalibration(c);
    const onMeasurement = (mm: number) => setMeasurementMm(mm);
    const onCalibrationNeeded = (p1: Vec2, p2: Vec2, resolve: (mm: number | null) => void) =>
      setCalibrationPrompt({ p1, p2, resolve });
    const onDrawingChanged = (summary: DrawingSummary) => setDrawingSummary(summary);
    const onFlowSolved = (result: FlowResult[]) => setFlowResult(result);
    const onProjectLoaded = () => setFlowResult(null);

    scene.on('selectionChanged', onSelectionChanged);
    scene.on('toolChanged', onToolChanged);
    scene.on('calibrationSet', onCalibrationSet);
    scene.on('measurement', onMeasurement);
    scene.on('calibrationNeeded', onCalibrationNeeded);
    scene.on('drawingChanged', onDrawingChanged);
    scene.on('flowSolved', onFlowSolved);
    scene.on('projectLoaded', onProjectLoaded);

    scene.init().then(() => {
      if (!cancelled) setReady(true);
      // Dev-only hook so Playwright-driven benchmarks (Step 3, frame rate) can
      // reach the scene instance directly, without adding permanent UI surface.
      if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
        (window as unknown as { __mepSketchScene?: SketchScene }).__mepSketchScene = scene;
      }
    });

    return () => {
      cancelled = true;
      scene.off('selectionChanged', onSelectionChanged);
      scene.off('toolChanged', onToolChanged);
      scene.off('calibrationSet', onCalibrationSet);
      scene.off('measurement', onMeasurement);
      scene.off('calibrationNeeded', onCalibrationNeeded);
      scene.off('drawingChanged', onDrawingChanged);
      scene.off('flowSolved', onFlowSolved);
      scene.off('projectLoaded', onProjectLoaded);
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  return {
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
  };
}
