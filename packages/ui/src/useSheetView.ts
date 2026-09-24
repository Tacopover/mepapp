import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// Zoom and pan of an SVG whose user units are sheet millimetres, shared by the schematic viewer
// and the template editor.

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_ZOOM_IN = 0.02;
const SHEET_MARGIN_MM = 8;

export interface SheetViewOptions {
  sheetWidthMm: number;
  sheetHeightMm: number;
  /** Fit again when this changes, for example when another template is shown. */
  resetKey: string;
}

export function useSheetView({ sheetWidthMm, sheetHeightMm, resetKey }: SheetViewOptions) {
  const fitBox = (): ViewBox => ({ x: -SHEET_MARGIN_MM, y: -SHEET_MARGIN_MM, w: sheetWidthMm + SHEET_MARGIN_MM * 2, h: sheetHeightMm + SHEET_MARGIN_MM * 2 });
  const [view, setView] = useState<ViewBox>(fitBox);
  useEffect(() => setView(fitBox()), [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const svgRef = useRef<SVGSVGElement | null>(null);
  const cleanupSvg = useRef<(() => void) | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const sheetWidthRef = useRef(sheetWidthMm);
  sheetWidthRef.current = sheetWidthMm;
  const panRef = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null);

  // A callback ref: the wheel listener must be non-passive (to stop the page scrolling), and the svg can mount late.
  const setSvg = useCallback((svg: SVGSVGElement | null) => {
    cleanupSvg.current?.();
    cleanupSvg.current = null;
    svgRef.current = svg;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const anchor = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
      const factor = Math.min(Math.max(Math.pow(1.0015, event.deltaY), 0.5), 2);
      setView((v) => {
        const w = Math.max(v.w * factor, sheetWidthRef.current * MAX_ZOOM_IN);
        const scale = w / v.w;
        return { x: anchor.x - (anchor.x - v.x) * scale, y: anchor.y - (anchor.y - v.y) * scale, w, h: v.h * scale };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      setCanvasSize({ w: rect.width, h: rect.height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    measure();
    cleanupSvg.current = () => {
      svg.removeEventListener('wheel', onWheel);
      observer.disconnect();
    };
  }, []);

  const fit = useCallback(() => setView(fitBox()), [sheetWidthMm, sheetHeightMm]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Shows `bounds` (sheet mm) with some room around it, keeping the canvas proportions. */
  const zoomTo = useCallback((bounds: { x: number; y: number; width: number; height: number }, paddingMm = 8) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const aspect = rect && rect.height > 0 ? rect.width / rect.height : 1.5;
    let w = bounds.width + paddingMm * 2;
    let h = bounds.height + paddingMm * 2;
    if (w / h < aspect) w = h * aspect;
    else h = w / aspect;
    setView({ x: bounds.x + bounds.width / 2 - w / 2, y: bounds.y + bounds.height / 2 - h / 2, w, h });
  }, []);

  /** The sheet position under a pointer event, in mm. */
  const clientToSheet = useCallback((clientX: number, clientY: number): { x: number; y: number } | undefined => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return undefined;
    const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: point.x, y: point.y };
  }, []);

  /** Sheet millimetres per screen pixel at the current zoom. Multiply a size in pixels by it to keep a handle the same size on screen. */
  const scale = Math.min(canvasSize.w / view.w, canvasSize.h / view.h);
  const mmPerPixel = scale > 0 ? 1 / scale : 0.5;

  const startPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
  };
  /** Returns true while a pan is running, so a caller can tell whether the move was a pan. */
  const movePan = (event: ReactPointerEvent<SVGSVGElement>): boolean => {
    const pan = panRef.current;
    const ctm = svgRef.current?.getScreenCTM();
    if (!pan || pan.pointerId !== event.pointerId || !ctm) return false;
    const dx = (event.clientX - pan.clientX) / ctm.a;
    const dy = (event.clientY - pan.clientY) / ctm.d;
    panRef.current = { ...pan, clientX: event.clientX, clientY: event.clientY };
    setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    return true;
  };
  const endPan = () => {
    panRef.current = null;
  };

  return {
    view,
    svgRef,
    setSvg,
    fit,
    zoomTo,
    clientToSheet,
    mmPerPixel,
    startPan,
    movePan,
    endPan,
    /** Pan-only pointer handlers for a canvas with nothing to drag. */
    panHandlers: { onPointerDown: startPan, onPointerMove: movePan, onPointerUp: endPan, onPointerCancel: endPan },
  };
}
