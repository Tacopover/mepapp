import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  CommandManager,
  computeStampLabelPlacement,
  DEFAULT_STAMP_LABEL_STYLE,
  listStampPropertyKeys,
  resolveStampLabelText,
  Transaction,
  type PlacedStamp,
  type StampCategory,
  type StampLabel,
  type StampPropertyContext,
  type StampPropertyGroup,
} from '@mepapp/core';
import { ColorPicker } from './ColorPicker.js';
import { IconMinus, IconPlus, IconZoomFit } from '../icons.js';
import { clampZoom, ZOOM_STEP, type View } from '../useShapeDrawEditor.js';

const CANVAS_PX = 440;
/** Anchors may sit outside the stamp box, up to one stamp size away on each side. */
const MIN_FRACTION = -1;
const MAX_FRACTION = 2;
/** Same box padding as render/src/stampLabels.ts, in points. */
const PADDING_X_PT = 3;
const PADDING_Y_PT = 1;
const LINE_HEIGHT = 1.2;

const GROUP_LABELS: Record<StampPropertyGroup, string> = { stamp: 'Stamp', custom: 'Custom', circuit: 'Circuit', panel: 'Panel' };

/** Preview values for keys a stamp has no value for yet — enough to judge size and position. */
const SAMPLE_VALUES: Record<string, string> = {
  'circuit:label': 'L1.3',
  'circuit:number': '3',
  'circuit:prefix': 'L1.',
  'circuit:panel': 'Panel A',
  'circuit:phase': 'L1',
  'circuit:device': 'B16',
  'circuit:cable': 'YMvK 3G2.5',
  'panel:name': 'Panel A',
  'stamp:capacity': '123',
  'stamp:rotation': '0',
};

let measureContext: CanvasRenderingContext2D | null = null;
function measureTextPx(text: string, fontPx: number): number {
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return text.length * fontPx * 0.6;
  measureContext.font = `600 ${fontPx}px Arial`;
  return measureContext.measureText(text).width;
}

function withAlpha(hex: string, previous: string | undefined, fallbackAlpha: string): string {
  const alpha = previous && previous.length === 9 ? previous.slice(7, 9) : fallbackAlpha;
  return `${hex.slice(0, 7)}${alpha}`;
}

function clampFraction(value: number): number {
  return Math.min(MAX_FRACTION, Math.max(MIN_FRACTION, value));
}

export interface StampLabelsEditorProps {
  category: StampCategory;
  nativeWidth: number;
  nativeHeight: number;
  /** Draws the stamp art into a box of the given pixel size, origin top-left. */
  renderArtwork: (widthPx: number, heightPx: number) => ReactNode;
  initialLabels: StampLabel[];
  onChange: (labels: StampLabel[]) => void;
  propertyContext: StampPropertyContext;
  /** A placed stamp of this definition — the preview then shows its real values where it has them. */
  sampleStamp?: PlacedStamp;
}

/**
 * Edits one stamp definition's label layout (label-feature.md §7): click the
 * preview to add a label, drag a label's anchor dot to move it, Delete to
 * remove the selected one, and the side panel for its property and style.
 * Has its own undo history while it is open.
 */
export function StampLabelsEditor({ category, nativeWidth, nativeHeight, renderArtwork, initialLabels, onChange, propertyContext, sampleStamp }: StampLabelsEditorProps) {
  const managerRef = useRef<CommandManager<StampLabel[]> | null>(null);
  managerRef.current ??= new CommandManager<StampLabel[]>(initialLabels);
  const manager = managerRef.current;
  const [labels, setLabels] = useState<StampLabel[]>(initialLabels);
  const [selectedId, setSelectedId] = useState<string | null>(initialLabels[0]?.id ?? null);
  const dragRef = useRef<{ tx: Transaction<StampLabel[]>; id: string; start: StampLabel[] } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>({ scale: 1, panX: 0, panY: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const hasFitRef = useRef(false);

  const keys = useMemo(() => listStampPropertyKeys(propertyContext, category), [propertyContext, category]);
  const selected = labels.find((l) => l.id === selectedId) ?? null;

  // The stamp takes a quarter of the preview, leaving room around it for labels up to one stamp size away.
  const pxPerPt = CANVAS_PX / (4 * Math.max(nativeWidth, nativeHeight, 1));
  const boxW = nativeWidth * pxPerPt;
  const boxH = nativeHeight * pxPerPt;
  const originX = (CANVAS_PX - boxW) / 2;
  const originY = (CANVAS_PX - boxH) / 2;
  const previewStamp: PlacedStamp = {
    id: sampleStamp?.id ?? '__preview__',
    category,
    transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
    nativeWidth,
    nativeHeight,
    ports: [],
  };

  function publish() {
    const next = manager.getState();
    setLabels(next);
    onChange(next);
  }

  function apply(description: string, mutate: (labels: StampLabel[]) => StampLabel[]) {
    const tx = new Transaction(manager, description);
    tx.update(mutate);
    tx.commit();
    publish();
  }

  function updateSelected(patch: Partial<StampLabel>) {
    if (!selectedId) return;
    apply('Edit label', (list) => list.map((l) => (l.id === selectedId ? { ...l, ...patch } : l)));
  }

  function removeLabel(id: string) {
    apply('Remove label', (list) => list.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function undo() {
    if (!manager.canUndo) return;
    manager.undo();
    publish();
  }

  function redo() {
    if (!manager.canRedo) return;
    manager.redo();
    publish();
  }

  // Window capture phase, with stopPropagation: these keys must not also reach the canvas
  // (SketchScene deletes its own selection on Delete) or the Element Editor's hidden shape editor.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      const meta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        if (selectedId) removeLabel(selectedId);
      } else if (meta && key === 'z') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) redo();
        else undo();
      } else if (meta && key === 'y') {
        e.preventDefault();
        e.stopPropagation();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  });

  // View pan and zoom, the same controls as the Element Editor's Shapes and Ports tabs (useShapeDrawEditor):
  // the wheel zooms at the pointer, the middle or right button pans, and the bar has zoom buttons and Fit.
  function fitView(size: { width: number; height: number } = viewportSize) {
    const scale = clampZoom(Math.min(size.width / CANVAS_PX, size.height / CANVAS_PX));
    setView({ scale, panX: (size.width - CANVAS_PX * scale) / 2, panY: (size.height - CANVAS_PX * scale) / 2 });
  }

  function zoomAtScreenPoint(factor: number, screenPoint: { x: number; y: number }) {
    setView((prev) => {
      const newScale = clampZoom(prev.scale * factor);
      const worldX = (screenPoint.x - prev.panX) / prev.scale;
      const worldY = (screenPoint.y - prev.panY) / prev.scale;
      return { scale: newScale, panX: screenPoint.x - worldX * newScale, panY: screenPoint.y - worldY * newScale };
    });
  }

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const size = { width: entry.contentRect.width, height: entry.contentRect.height };
      setViewportSize(size);
      if (!hasFitRef.current && size.width > 4 && size.height > 4) {
        hasFitRef.current = true;
        fitView(size);
      }
    });
    observer.observe(el);
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAtScreenPoint(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onViewportPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 1 && e.button !== 2) return;
    e.preventDefault();
    const startScreen = { x: e.clientX, y: e.clientY };
    const startView = view;
    const move = (ev: PointerEvent) => {
      setView({ ...startView, panX: startView.panX + (ev.clientX - startScreen.x), panY: startView.panY + (ev.clientY - startScreen.y) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function fractionAt(e: ReactPointerEvent): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = (e.clientX - rect.left - view.panX) / view.scale;
    const py = (e.clientY - rect.top - view.panY) / view.scale;
    return { x: clampFraction((px - originX) / boxW), y: clampFraction((py - originY) / boxH) };
  }

  function onBackgroundPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const at = fractionAt(e);
    const label: StampLabel = {
      id: crypto.randomUUID(),
      propertyKey: keys[0]?.key ?? 'stamp:name',
      anchorX: Math.round(at.x * 100) / 100,
      anchorY: Math.round(at.y * 100) / 100,
      ...DEFAULT_STAMP_LABEL_STYLE,
    };
    apply('Add label', (list) => [...list, label]);
    setSelectedId(label.id);
  }

  function onLabelPointerDown(e: ReactPointerEvent, id: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedId(id);
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { tx: new Transaction(manager, 'Move label'), id, start: manager.getState() };
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const at = fractionAt(e);
    drag.tx.update((list) => list.map((l) => (l.id === drag.id ? { ...l, anchorX: Math.round(at.x * 100) / 100, anchorY: Math.round(at.y * 100) / 100 } : l)));
    setLabels(manager.getState());
  }

  function onPointerUp() {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (manager.getState() !== drag.start) drag.tx.commit();
    publish();
  }

  function previewText(label: StampLabel): { text: string; placeholder: boolean; missing: boolean } {
    const known = keys.find((k) => k.key === label.propertyKey);
    if (!known) return { text: `missing: ${label.propertyKey}`, placeholder: true, missing: true };
    if (sampleStamp) {
      const real = resolveStampLabelText(propertyContext, sampleStamp, label);
      if (real !== null) return { text: real, placeholder: false, missing: false };
    }
    return { text: `${label.prefix ?? ''}${SAMPLE_VALUES[label.propertyKey] ?? known.label}${label.suffix ?? ''}`, placeholder: true, missing: false };
  }

  const groups = (['stamp', 'custom', 'circuit', 'panel'] as const)
    .map((group) => ({ group, keys: keys.filter((k) => k.group === group) }))
    .filter((g) => g.keys.length > 0);

  return (
    <div className="mep-lbl-grid">
      <div className="mep-lbl-canvas-col">
        <div className="mep-lbl-viewport" ref={viewportRef} onPointerDown={onViewportPointerDown} onContextMenu={(e) => e.preventDefault()}>
          <svg ref={svgRef} className="mep-lbl-svg" onPointerDown={onBackgroundPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            <rect x={0} y={0} width="100%" height="100%" fill="transparent" />
            <g transform={`translate(${view.panX} ${view.panY}) scale(${view.scale})`}>
              <rect x={0} y={0} width={CANVAS_PX} height={CANVAS_PX} className="mep-lbl-sheet" vectorEffect="non-scaling-stroke" />
              <rect x={originX} y={originY} width={boxW} height={boxH} className="mep-lbl-stamp-box" vectorEffect="non-scaling-stroke" />
              <g transform={`translate(${originX} ${originY})`} pointerEvents="none">
                {renderArtwork(boxW, boxH)}
              </g>
              {labels.map((label) => {
                const { anchor, align } = computeStampLabelPlacement(previewStamp, label);
                const ax = originX + (anchor.x + nativeWidth / 2) * pxPerPt;
                const ay = originY + (anchor.y + nativeHeight / 2) * pxPerPt;
                const { text, placeholder, missing } = previewText(label);
                const fontPx = label.fontSize * pxPerPt;
                const width = measureTextPx(text, fontPx) + PADDING_X_PT * 2 * pxPerPt;
                const height = fontPx * LINE_HEIGHT + PADDING_Y_PT * 2 * pxPerPt;
                const left = align === 'left' ? ax : align === 'right' ? ax - width : ax - width / 2;
                const isSelected = label.id === selectedId;
                return (
                  <g key={label.id} className="mep-lbl-item" data-label-id={label.id} onPointerDown={(e) => onLabelPointerDown(e, label.id)}>
                    {(label.background || label.border) && (
                      <rect
                        x={left}
                        y={ay - height / 2}
                        width={width}
                        height={height}
                        rx={2 * pxPerPt}
                        fill={label.background ? label.background.slice(0, 7) : 'none'}
                        fillOpacity={label.background && label.background.length === 9 ? parseInt(label.background.slice(7, 9), 16) / 255 : 1}
                        stroke={label.border ? label.border.slice(0, 7) : 'none'}
                        strokeWidth={0.5 * pxPerPt}
                      />
                    )}
                    <text
                      x={left + PADDING_X_PT * pxPerPt}
                      y={ay}
                      dominantBaseline="central"
                      fontFamily="Arial"
                      fontWeight={600}
                      fontSize={fontPx}
                      fill={missing ? '#c62828' : label.textColor}
                      fontStyle={placeholder ? 'italic' : undefined}
                      opacity={placeholder && !missing ? 0.7 : 1}
                    >
                      {text}
                    </text>
                    {isSelected && (
                      <rect
                        x={left - 1.5 / view.scale}
                        y={ay - height / 2 - 1.5 / view.scale}
                        width={width + 3 / view.scale}
                        height={height + 3 / view.scale}
                        className="mep-lbl-selection"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    <circle cx={ax} cy={ay} r={(isSelected ? 5 : 4) / view.scale} className={`mep-lbl-anchor${isSelected ? ' on' : ''}`} vectorEffect="non-scaling-stroke" />
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <div className="mep-ee-bar mep-lbl-bar">
          <div className="mep-ee-bar-cluster">
            <button type="button" className="mep-rail-btn" onClick={() => zoomAtScreenPoint(1 / ZOOM_STEP, { x: viewportSize.width / 2, y: viewportSize.height / 2 })} title="Zoom out">
              <IconMinus size={16} />
            </button>
            <span className="mep-ee-zoom-readout">{Math.round(view.scale * 100)}%</span>
            <button type="button" className="mep-rail-btn" onClick={() => zoomAtScreenPoint(ZOOM_STEP, { x: viewportSize.width / 2, y: viewportSize.height / 2 })} title="Zoom in">
              <IconPlus size={16} />
            </button>
            <button type="button" className="mep-rail-btn" onClick={() => fitView()} title="Fit">
              <IconZoomFit size={18} />
            </button>
          </div>
        </div>
      </div>
      <div className="mep-lbl-sidebar">
        <div className="mep-section">
          <h4>Labels</h4>
          {labels.length === 0 && <p className="mep-hint">Click the preview to add a label at that point.</p>}
          {labels.map((label) => (
            <div key={label.id} className={`mep-lbl-row${label.id === selectedId ? ' on' : ''}`} onClick={() => setSelectedId(label.id)}>
              <span>{keys.find((k) => k.key === label.propertyKey)?.label ?? `missing: ${label.propertyKey}`}</span>
              <button
                type="button"
                className="mep-property-row-remove"
                title="Remove label"
                onClick={(e) => {
                  e.stopPropagation();
                  removeLabel(label.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="mep-lbl-undo">
            <button type="button" onClick={undo} disabled={!manager.canUndo}>
              Undo
            </button>
            <button type="button" onClick={redo} disabled={!manager.canRedo}>
              Redo
            </button>
          </div>
        </div>
        {selected && (
          <div className="mep-section">
            <h4>Selected label</h4>
            <div className="mep-field-row">
              <label>Property</label>
              <select value={selected.propertyKey} onChange={(e) => updateSelected({ propertyKey: e.target.value })}>
                {!keys.some((k) => k.key === selected.propertyKey) && <option value={selected.propertyKey}>missing: {selected.propertyKey}</option>}
                {groups.map(({ group, keys: groupKeys }) => (
                  <optgroup key={group} label={GROUP_LABELS[group]}>
                    {groupKeys.map((k) => (
                      <option key={k.key} value={k.key}>
                        {k.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="mep-field-row">
              <label>Prefix</label>
              <input type="text" value={selected.prefix ?? ''} onChange={(e) => updateSelected({ prefix: e.target.value || undefined })} />
            </div>
            <div className="mep-field-row">
              <label>Suffix</label>
              <input type="text" value={selected.suffix ?? ''} onChange={(e) => updateSelected({ suffix: e.target.value || undefined })} />
            </div>
            <div className="mep-field-row">
              <label>Font size (pt)</label>
              <input type="number" min={2} max={72} step={0.5} value={selected.fontSize} onChange={(e) => updateSelected({ fontSize: Math.max(2, Number(e.target.value) || DEFAULT_STAMP_LABEL_STYLE.fontSize) })} />
            </div>
            <div className="mep-field-row">
              <label>Text color</label>
              <ColorPicker value={selected.textColor} onChange={(color) => updateSelected({ textColor: color.slice(0, 7) })} />
            </div>
            <div className="mep-field-row">
              <label>Background</label>
              <div className="mep-lbl-toggle-color">
                <input
                  type="checkbox"
                  aria-label="Background"
                  checked={selected.background !== undefined}
                  onChange={(e) => updateSelected({ background: e.target.checked ? DEFAULT_STAMP_LABEL_STYLE.background : undefined })}
                />
                {selected.background && <ColorPicker value={selected.background.slice(0, 7)} onChange={(color) => updateSelected({ background: withAlpha(color, selected.background, 'c8') })} />}
              </div>
            </div>
            <div className="mep-field-row">
              <label>Border</label>
              <div className="mep-lbl-toggle-color">
                <input
                  type="checkbox"
                  aria-label="Border"
                  checked={selected.border !== undefined}
                  onChange={(e) => updateSelected({ border: e.target.checked ? DEFAULT_STAMP_LABEL_STYLE.border : undefined })}
                />
                {selected.border && <ColorPicker value={selected.border.slice(0, 7)} onChange={(color) => updateSelected({ border: withAlpha(color, selected.border, 'b4') })} />}
              </div>
            </div>
            <p className="mep-hint">
              Anchor {Math.round(selected.anchorX * 100)}% × {Math.round(selected.anchorY * 100)}% of the stamp. The anchor turns with the stamp; the text stays
              horizontal.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
