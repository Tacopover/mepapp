import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import {
  SketchScene,
  type CanvasContextMenuTarget,
  type DocumentSummary,
  type DrawingSummary,
  type FittingInfo,
  type NetworkSummary,
  type SegmentInfo,
  type SketchTool,
  type StampInfo,
} from '@mepapp/render';
import { CIRCUIT_TYPE_LIBRARY, type Calibration, type Circuit, type CircuitType, type FlowResult, type NetworkType, type Panel, type PanelSection, type Schematic, type StampDefinition, type Vec2 } from '@mepapp/core';
import type { PdfDocumentHandle } from '@mepapp/pdf-engine';

export interface CalibrationPrompt {
  p1: Vec2;
  p2: Vec2;
  resolve: (knownRealDistanceMm: number | null) => void;
}

export interface TextboxPrompt {
  /** Container-relative pixels — where the floating textarea should be positioned over the canvas. */
  screenPosition: Vec2;
  /** Pre-fills the textarea — empty for a new textbox/stickyNote, the existing text when reopened to edit one already placed. */
  initialText: string;
  resolve: (text: string | null) => void;
}

export interface CanvasContextMenuRequest {
  /** Container-relative pixels — where the floating menu should be positioned over the canvas. */
  screenPosition: Vec2;
  /** One menu item per field set — see SketchScene's canvasContextMenuRequested event. */
  target: CanvasContextMenuTarget;
}

export interface UseSketchScene {
  containerRef: RefObject<HTMLDivElement | null>;
  sceneRef: RefObject<SketchScene | null>;
  ready: boolean;
  tool: SketchTool;
  selection: StampInfo[];
  /** The lone selected segment's read model, or null — see SketchScene.getSelectedSegmentInfo. */
  selectedSegment: SegmentInfo | null;
  /** A pure multi-segment selection's read models — empty unless 2+ segments (and nothing else) are selected. See SketchScene.getSelectedSegments. */
  selectedSegments: SegmentInfo[];
  /** The lone selected fitting's read model, or null — see SketchScene.getSelectedFittingInfo. */
  selectedFitting: FittingInfo | null;
  /** Whether anything — a stamp or an annotation — is selected, for gating UI (e.g. the rail's Rotate/Delete actions) that `selection` alone can't answer since it only reports stamps. */
  hasSelection: boolean;
  allStamps: StampInfo[];
  networkSummaries: NetworkSummary[];
  networkTypes: NetworkType[];
  customStampDefinitions: StampDefinition[];
  circuits: Circuit[];
  panels: Panel[];
  panelSections: PanelSection[];
  circuitTypes: CircuitType[];
  /** Saved schematics of the active document whose panel still exists. */
  schematics: Schematic[];
  /** Entered values of template fields with scope 'project', by field id. */
  schematicProjectFields: Record<string, string>;
  /** The Electrical Circuits tree's own selection concept — a Circuit/Panel has no canvas presence to select via the usual stamp-selection path (see SketchScene.clearSelection). Mutually exclusive with each other and with a stamp/segment/fitting selection; selecting one clears the others. */
  selectedCircuitId: string | null;
  setSelectedCircuitId: (id: string | null) => void;
  selectedPanelId: string | null;
  setSelectedPanelId: (id: string | null) => void;
  /** The circuit the Add-to-Circuit tool is filling, or null when that tool is not active — see SketchScene.getCircuitToolTarget. */
  circuitToolTargetId: string | null;
  /** True when the current stamp selection came from a click, drag or key press on the canvas; false when it came from the Networks tree, a Properties link, Undo or a panel edit. Decides whether the dock jumps to Properties (App.tsx). */
  selectionFromCanvas: boolean;
  /** The Show Circuits toggle — connection lines from the selected terminal/circuit/panel. Session state; stays on until switched off. */
  showCircuitLines: boolean;
  setShowCircuitLines: Dispatch<SetStateAction<boolean>>;
  zoom: number;
  pageIndex: number;
  pageCount: number;
  calibration: Calibration | null;
  measurementMm: number | null;
  calibrationPrompt: CalibrationPrompt | null;
  setCalibrationPrompt: (prompt: CalibrationPrompt | null) => void;
  textboxPrompt: TextboxPrompt | null;
  setTextboxPrompt: (prompt: TextboxPrompt | null) => void;
  canvasContextMenuRequest: CanvasContextMenuRequest | null;
  setCanvasContextMenuRequest: (request: CanvasContextMenuRequest | null) => void;
  drawingSummary: DrawingSummary;
  flowResult: FlowResult[] | null;
  refreshLayers: () => void;
  refreshCircuits: () => void;
  documents: DocumentSummary[];
  activeDocumentId: string | null;
  activePdfHandle: PdfDocumentHandle | null;
}

const EMPTY_DRAWING_SUMMARY: DrawingSummary = { segmentCount: 0, fittingCount: 0, annotationCount: 0, networkCount: 0, canUndo: false, canRedo: false };

export function useSketchScene(): UseSketchScene {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SketchScene | null>(null);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<SketchTool>('select');
  const [selection, setSelection] = useState<StampInfo[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<SegmentInfo | null>(null);
  const [selectedSegments, setSelectedSegments] = useState<SegmentInfo[]>([]);
  const [selectedFitting, setSelectedFitting] = useState<FittingInfo | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [allStamps, setAllStamps] = useState<StampInfo[]>([]);
  const [networkSummaries, setNetworkSummaries] = useState<NetworkSummary[]>([]);
  const [networkTypes, setNetworkTypes] = useState<NetworkType[]>([]);
  const [customStampDefinitions, setCustomStampDefinitions] = useState<StampDefinition[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [panelSections, setPanelSections] = useState<PanelSection[]>([]);
  const [circuitTypes, setCircuitTypes] = useState<CircuitType[]>(CIRCUIT_TYPE_LIBRARY);
  const [schematics, setSchematics] = useState<Schematic[]>([]);
  const [schematicProjectFields, setSchematicProjectFields] = useState<Record<string, string>>({});
  const [selectedCircuitId, setSelectedCircuitIdState] = useState<string | null>(null);
  const [selectedPanelId, setSelectedPanelIdState] = useState<string | null>(null);
  const [circuitToolTargetId, setCircuitToolTargetId] = useState<string | null>(null);
  const [selectionFromCanvas, setSelectionFromCanvas] = useState(true);
  const [showCircuitLines, setShowCircuitLines] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [measurementMm, setMeasurementMm] = useState<number | null>(null);
  const [calibrationPrompt, setCalibrationPrompt] = useState<CalibrationPrompt | null>(null);
  const [textboxPrompt, setTextboxPrompt] = useState<TextboxPrompt | null>(null);
  const [canvasContextMenuRequest, setCanvasContextMenuRequest] = useState<CanvasContextMenuRequest | null>(null);
  const [drawingSummary, setDrawingSummary] = useState<DrawingSummary>(EMPTY_DRAWING_SUMMARY);
  const [flowResult, setFlowResult] = useState<FlowResult[] | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [activePdfHandle, setActivePdfHandle] = useState<PdfDocumentHandle | null>(null);

  const refreshLayers = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    setAllStamps(scene.listStamps());
    setNetworkSummaries(scene.getNetworkSummaries());
  }, []);

  const refreshCircuits = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    setCircuits(scene.listCircuits());
    setPanels(scene.listPanels());
    setPanelSections(scene.listPanelSections());
    setCircuitTypes(scene.listCircuitTypes());
    setSchematics(scene.listSchematics());
    setSchematicProjectFields(scene.getSchematicProjectFields());
  }, []);

  /** Selecting a circuit clears any panel selection, and vice versa, and both clear the canvas's own stamp/segment/fitting selection (SketchScene.clearSelection) — a Circuit/Panel has no canvas presence to co-select alongside. */
  const setSelectedCircuitId = useCallback((id: string | null) => {
    setSelectedCircuitIdState(id);
    if (id !== null) {
      setSelectedPanelIdState(null);
      sceneRef.current?.clearSelection();
    }
  }, []);

  const setSelectedPanelId = useCallback((id: string | null) => {
    setSelectedPanelIdState(id);
    if (id !== null) {
      setSelectedCircuitIdState(null);
      sceneRef.current?.clearSelection();
    }
  }, []);

  // The scene draws the connection lines (SketchScene.drawCircuitLines) but knows nothing about the
  // Electrical Circuits tree's selection or the toggle — both live here, so push them down.
  useEffect(() => {
    if (ready) sceneRef.current?.setShowCircuitLines(showCircuitLines);
  }, [ready, showCircuitLines]);
  useEffect(() => {
    if (ready) sceneRef.current?.setCircuitLinesFocus({ circuitId: selectedCircuitId ?? circuitToolTargetId, panelId: selectedPanelId });
  }, [ready, selectedCircuitId, selectedPanelId, circuitToolTargetId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new SketchScene(containerRef.current);
    sceneRef.current = scene;
    let cancelled = false;

    const onSelectionChanged = (s: StampInfo[]) => {
      setSelection(s);
      setSelectionFromCanvas(scene.isCanvasSelectionChange());
      setSelectedSegment(scene.getSelectedSegmentInfo());
      setSelectedSegments(scene.getSelectedSegments());
      setSelectedFitting(scene.getSelectedFittingInfo());
      setHasSelection(scene.hasSelection());
      setAllStamps(scene.listStamps());
      // A real canvas selection (stamp/segment/fitting) and the Electrical
      // Circuits tree's own circuit/panel selection are mutually exclusive
      // (see setSelectedCircuitId/setSelectedPanelId) — clicking a real
      // canvas element clears whichever tree selection was active.
      if (scene.hasSelection()) {
        setSelectedCircuitIdState(null);
        setSelectedPanelIdState(null);
      }
    };
    const onToolChanged = (t: SketchTool) => {
      setTool(t);
      setCircuitToolTargetId(scene.getCircuitToolTarget());
    };
    const onCalibrationSet = (c: Calibration) => setCalibration(c);
    const onMeasurement = (mm: number) => setMeasurementMm(mm);
    const onCalibrationNeeded = (p1: Vec2, p2: Vec2, resolve: (mm: number | null) => void) =>
      setCalibrationPrompt({ p1, p2, resolve });
    const onTextboxRequested = (screenPosition: Vec2, initialText: string, resolve: (text: string | null) => void) =>
      setTextboxPrompt({ screenPosition, initialText, resolve });
    const onCanvasContextMenuRequested = (screenPosition: Vec2, target: CanvasContextMenuTarget) =>
      setCanvasContextMenuRequest({ screenPosition, target });
    const onDrawingChanged = (summary: DrawingSummary) => {
      setDrawingSummary(summary);
      setNetworkSummaries(scene.getNetworkSummaries());
      setSelectedSegment(scene.getSelectedSegmentInfo());
      setSelectedSegments(scene.getSelectedSegments());
      setSelectedFitting(scene.getSelectedFittingInfo());
    };
    // Deliberately separate from onDrawingChanged — see SketchScene's
    // 'circuitsChanged' event doc comment for why a circuit/panel edit must
    // not touch selectedSegment/selectedSegments/selectedFitting.
    const onCircuitsChanged = () => {
      setCircuits(scene.listCircuits());
      setPanels(scene.listPanels());
      setPanelSections(scene.listPanelSections());
      setCircuitTypes(scene.listCircuitTypes());
      setSchematics(scene.listSchematics());
      setSchematicProjectFields(scene.getSchematicProjectFields());
    };
    const onFlowSolved = (result: FlowResult[]) => {
      setFlowResult(result);
      // SegmentInfo/FittingInfo.solvedCapacity are derived from the same solve —
      // refresh an already-selected segment/fitting's read model too, or its
      // Properties panel readout would keep showing a stale value. Flow now
      // recomputes automatically on every topology/capacity edit (not just the
      // "Solve flow" button), so this fires often — only refresh when a segment
      // or fitting is actually selected: these getters always return fresh
      // object/array references, and setting them unconditionally would churn
      // that reference even with a stamp (or nothing) selected — App.tsx's
      // dock-tab-forcing effect has these in its deps, so that churn alone would
      // yank the dock back to Properties on every recompute.
      const segmentInfo = scene.getSelectedSegmentInfo();
      const segments = scene.getSelectedSegments();
      if (segmentInfo || segments.length > 0) {
        setSelectedSegment(segmentInfo);
        setSelectedSegments(segments);
      }
      const fittingInfo = scene.getSelectedFittingInfo();
      if (fittingInfo) setSelectedFitting(fittingInfo);
    };
    const onProjectLoaded = () => {
      setFlowResult(null);
      setAllStamps(scene.listStamps());
      setNetworkSummaries(scene.getNetworkSummaries());
      setNetworkTypes(scene.getNetworkTypes());
      setCustomStampDefinitions(scene.getCustomStampDefinitions());
      setCircuits(scene.listCircuits());
      setPanels(scene.listPanels());
      setPanelSections(scene.listPanelSections());
      setCircuitTypes(scene.listCircuitTypes());
      setSchematics(scene.listSchematics());
      setSchematicProjectFields(scene.getSchematicProjectFields());
      setSelectedCircuitIdState(null);
      setSelectedPanelIdState(null);
    };
    // getNetworkSummaries() copies each resolved NetworkType's name into
    // networkTypeName at call time, so a rename (which mutates the type
    // in place, see SketchScene.renameNetworkType) needs this re-derived
    // too, not just networkTypes itself — otherwise the Networks tree's
    // "live rebuild" requirement misses renames.
    const onNetworkTypesChanged = (types: NetworkType[]) => {
      setNetworkTypes(types);
      setNetworkSummaries(scene.getNetworkSummaries());
    };
    const onCustomStampDefinitionsChanged = (defs: StampDefinition[]) => setCustomStampDefinitions(defs);
    const onZoomChanged = (z: number) => setZoom(z);
    const onPageChanged = (p: number) => setPageIndex(p);
    const onDocumentsChanged = (docs: DocumentSummary[]) => {
      setDocuments(docs);
      setActiveDocumentId(scene.getActiveDocumentId());
      setActivePdfHandle(scene.getActivePdfHandle());
    };
    // A different document became active — re-pull everything from the
    // scene's getters rather than diffing, same idea as onProjectLoaded but
    // covering every per-document read model (see decisions log 2026-09-07).
    const onDocumentActivated = () => {
      setSelection(scene.getSelection());
      setSelectedSegment(scene.getSelectedSegmentInfo());
      setSelectedSegments(scene.getSelectedSegments());
      setSelectedFitting(scene.getSelectedFittingInfo());
      setAllStamps(scene.listStamps());
      setNetworkSummaries(scene.getNetworkSummaries());
      setCalibration(scene.getCalibration());
      setDrawingSummary(scene.getDrawingSummary());
      setFlowResult(scene.getFlowResult());
      setMeasurementMm(null); // a transient reading, not resident per-document state
      setActiveDocumentId(scene.getActiveDocumentId());
      setActivePdfHandle(scene.getActivePdfHandle());
      setPageIndex(scene.getPageIndex());
      setPageCount(scene.getPageCount());
      setCustomStampDefinitions(scene.getCustomStampDefinitions());
      setCircuits(scene.listCircuits());
      setPanels(scene.listPanels());
      setPanelSections(scene.listPanelSections());
      setCircuitTypes(scene.listCircuitTypes());
      setSchematics(scene.listSchematics());
      setSchematicProjectFields(scene.getSchematicProjectFields());
      setSelectedCircuitIdState(null);
      setSelectedPanelIdState(null);
    };

    scene.on('selectionChanged', onSelectionChanged);
    scene.on('toolChanged', onToolChanged);
    scene.on('calibrationSet', onCalibrationSet);
    scene.on('measurement', onMeasurement);
    scene.on('calibrationNeeded', onCalibrationNeeded);
    scene.on('textboxRequested', onTextboxRequested);
    scene.on('canvasContextMenuRequested', onCanvasContextMenuRequested);
    scene.on('drawingChanged', onDrawingChanged);
    scene.on('circuitsChanged', onCircuitsChanged);
    scene.on('flowSolved', onFlowSolved);
    scene.on('projectLoaded', onProjectLoaded);
    scene.on('networkTypesChanged', onNetworkTypesChanged);
    scene.on('customStampDefinitionsChanged', onCustomStampDefinitionsChanged);
    scene.on('zoomChanged', onZoomChanged);
    scene.on('pageChanged', onPageChanged);
    scene.on('documentsChanged', onDocumentsChanged);
    scene.on('documentActivated', onDocumentActivated);

    scene.init().then(() => {
      if (!cancelled) {
        setReady(true);
        setZoom(scene.getZoom());
        setPageIndex(scene.getPageIndex());
        setPageCount(scene.getPageCount());
        setDocuments(scene.getDocuments());
        setActiveDocumentId(scene.getActiveDocumentId());
        setActivePdfHandle(scene.getActivePdfHandle());
        setCustomStampDefinitions(scene.getCustomStampDefinitions());
      }
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
      scene.off('textboxRequested', onTextboxRequested);
      scene.off('canvasContextMenuRequested', onCanvasContextMenuRequested);
      scene.off('drawingChanged', onDrawingChanged);
      scene.off('circuitsChanged', onCircuitsChanged);
      scene.off('flowSolved', onFlowSolved);
      scene.off('projectLoaded', onProjectLoaded);
      scene.off('networkTypesChanged', onNetworkTypesChanged);
      scene.off('customStampDefinitionsChanged', onCustomStampDefinitionsChanged);
      scene.off('zoomChanged', onZoomChanged);
      scene.off('pageChanged', onPageChanged);
      scene.off('documentsChanged', onDocumentsChanged);
      scene.off('documentActivated', onDocumentActivated);
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
    selectedSegment,
    selectedSegments,
    selectedFitting,
    hasSelection,
    allStamps,
    networkSummaries,
    networkTypes,
    customStampDefinitions,
    circuits,
    panels,
    panelSections,
    circuitTypes,
    schematics,
    schematicProjectFields,
    selectedCircuitId,
    setSelectedCircuitId,
    selectedPanelId,
    setSelectedPanelId,
    circuitToolTargetId,
    selectionFromCanvas,
    showCircuitLines,
    setShowCircuitLines,
    zoom,
    pageIndex,
    pageCount,
    calibration,
    measurementMm,
    calibrationPrompt,
    setCalibrationPrompt,
    textboxPrompt,
    setTextboxPrompt,
    canvasContextMenuRequest,
    setCanvasContextMenuRequest,
    drawingSummary,
    flowResult,
    refreshLayers,
    refreshCircuits,
    documents,
    activeDocumentId,
    activePdfHandle,
  };
}
