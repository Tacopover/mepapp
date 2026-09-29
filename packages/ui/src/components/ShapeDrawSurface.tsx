import { useEffect, useRef, type ReactNode } from 'react';
import {
  POLYGON_CLOSE_HIT_RADIUS_PX,
  ROTATE_HANDLE_RADIUS_PX,
  rotateHandlePosition,
  scaleHandlePosition,
  type ShapeDrawEditor,
} from '../useShapeDrawEditor.js';
import { SymbolShapesSvg, describeArcPath } from '../symbolShapeSvg.js';
import { arcFromThreePoints, selectionBounds, shapeHandles, symbolShapeBounds } from '../symbolShapeCanvas.js';

/** Geometry-handle and scale-handle drawing radii — the hit-test radii these handles are
    actually caught by live inside useShapeDrawEditor (deliberately larger, for a forgiving
    click target); only the visual radius belongs here. */
const GEOMETRY_HANDLE_RADIUS_PX = 5;
const SCALE_HANDLE_HALF_PX = 5;

/** Object-snap indicator chrome — a distinct accent color so it doesn't get lost against the selection-blue #2f6fed. */
const SNAP_INDICATOR_COLOR = '#e8590c';
const SNAP_INDICATOR_RADIUS_PX = 5;

export interface ShapeDrawSurfaceProps<TTool extends string> {
  editor: ShapeDrawEditor<TTool>;
  canvasWidthPx: number;
  canvasHeightPx: number;
  /** Fills the drawing area behind the shapes (the schematic drawing editor draws on white paper). undefined = transparent. */
  paperFill?: string;
  /** Smallest stroke drawn, in canvas px. undefined = the renderer's default of 1. */
  minStrokePx?: number;
  /** HTML laid over the drawing area in its own percentage space, above the SVG (the stamp editor's port markers). Elements opt back in to pointer events themselves. */
  children?: ReactNode;
}

/**
 * The shared drawing surface (shared-drawing-tool.md §6): the pan/zoom viewport, the SVG that draws
 * the shapes live, and the selection, handle, marquee, snap and draft-preview chrome. It renders
 * from a `useShapeDrawEditor` editor and owns no state of its own. The stamp editor and the
 * schematic drawing editor both mount it.
 *
 * Rendered live as SVG (§4); the stamp editor's save-time raster bake is a separate step that calls
 * rasterizeSymbolShapes directly. Plain render-time JSX, not a useEffect + imperative draw call:
 * React already re-renders whenever any value below changes, and there is no devicePixelRatio
 * buffer-sizing concern, because the browser rasterizes SVG at native resolution.
 */
export function ShapeDrawSurface<TTool extends string>({ editor, canvasWidthPx, canvasHeightPx, paperFill, minStrokePx, children }: ShapeDrawSurfaceProps<TTool>) {
  const textRenameRef = useRef<HTMLInputElement | null>(null);

  // Text placement opens the rename input from inside the same pointerdown
  // that created the shape — autoFocus there loses a race against the
  // browser's own post-mousedown focus handling (mousedown targets the
  // canvas, a non-focusable element, which blurs whatever just got focused).
  // Deferring the focus call, same fix already used for the floating
  // textbox-annotation prompt in App.tsx.
  useEffect(() => {
    if (!editor.editingTextId) return;
    const id = setTimeout(() => textRenameRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [editor.editingTextId]);

  // draftShapes either replaces in-place shapes being dragged (select tool) or holds one
  // not-yet-committed new shape being drawn (drag-to-create tools) — handle both by replacing
  // matching ids and appending any that aren't found.
  const draftById = editor.draftShapes ? new Map(editor.draftShapes.map((s) => [s.id, s])) : null;
  const toDraw = draftById
    ? [...editor.shapes.map((s) => draftById.get(s.id) ?? s), ...editor.draftShapes!.filter((s) => !editor.shapes.some((orig) => orig.id === s.id))]
    : editor.shapes;
  // Selection/handle/marquee "chrome" is drawn in the same zoomed world-space <g> as the shapes
  // (see the transform on the <g> in the JSX below), so a literal screen-px size (stroke width,
  // dash length, handle radius) would visibly grow/shrink with zoom — divide by view.scale first
  // so it renders at a constant size on screen instead, same convention scene.ts uses for its own
  // handle/selection-outline drawing.
  const chromeScale = 1 / editor.view.scale;

  const selectedForHandle = editor.tool === 'select' && !editor.marquee ? toDraw.filter((s) => editor.selectedShapeIds.has(s.id)) : [];
  const rotateHandle = rotateHandlePosition(selectedForHandle, canvasWidthPx, canvasHeightPx, editor.view.scale);
  const rotateHandleStemTopY = rotateHandle ? selectionBounds(selectedForHandle, canvasWidthPx, canvasHeightPx).y * canvasHeightPx : 0;
  const scaleHandle = scaleHandlePosition(selectedForHandle, canvasWidthPx, canvasHeightPx);

  // Click-accumulate previews for Polygon and Arc (3-pt): placed vertices plus a rubber-band line
  // (or, for Arc 3-pt once start+end are placed, a live preview of the actual arc bulging toward
  // the pointer) to the current pointer position.
  const activeDraftPoints = editor.tool === 'polygon' ? editor.polygonDraft : editor.tool === 'arcThreePoint' ? editor.arcThreePointDraft : null;
  const previewArc =
    editor.tool === 'arcThreePoint' && activeDraftPoints && activeDraftPoints.length === 2 && editor.pendingPoint
      ? arcFromThreePoints(activeDraftPoints[0], activeDraftPoints[1], editor.pendingPoint, editor.defaultStyle, canvasWidthPx, canvasHeightPx)
      : null;
  const polygonClosePx =
    editor.tool === 'polygon' && activeDraftPoints && activeDraftPoints.length >= 3 && editor.pendingPoint
      ? Math.hypot(
          (editor.pendingPoint.fractionX - activeDraftPoints[0].fractionX) * canvasWidthPx,
          (editor.pendingPoint.fractionY - activeDraftPoints[0].fractionY) * canvasHeightPx,
        )
      : Infinity;
  const showPolygonCloseHint = polygonClosePx <= POLYGON_CLOSE_HIT_RADIUS_PX / editor.view.scale;

  const chrome = (
    <>
      {paperFill && <rect x={0} y={0} width={canvasWidthPx} height={canvasHeightPx} fill={paperFill} />}
      {/* Canvas bounds — the fixed box shapes/ports are defined against, drawn first (behind
          shapes/selection chrome) so the user can see the extent while placing geometry. */}
      <rect x={0} y={0} width={canvasWidthPx} height={canvasHeightPx} fill="none" stroke="#57676f" strokeWidth={chromeScale} strokeDasharray={`${6 * chromeScale} ${4 * chromeScale}`} />
      <SymbolShapesSvg shapes={toDraw} widthPx={canvasWidthPx} heightPx={canvasHeightPx} minStrokePx={minStrokePx} />
      {toDraw
        .filter((s) => editor.selectedShapeIds.has(s.id))
        .map((shape) => {
          const b = symbolShapeBounds(shape, canvasWidthPx, canvasHeightPx);
          const pad = 3 * chromeScale;
          return (
            <rect
              key={shape.id}
              x={b.x * canvasWidthPx - pad}
              y={b.y * canvasHeightPx - pad}
              width={b.width * canvasWidthPx + pad * 2}
              height={b.height * canvasHeightPx + pad * 2}
              fill="none"
              stroke="#2f6fed"
              strokeWidth={chromeScale}
              strokeDasharray={`${4 * chromeScale} ${3 * chromeScale}`}
            />
          );
        })}
      {editor.marquee &&
        (() => {
          const minX = Math.min(editor.marquee.start.fractionX, editor.marquee.current.fractionX) * canvasWidthPx;
          const minY = Math.min(editor.marquee.start.fractionY, editor.marquee.current.fractionY) * canvasHeightPx;
          const w = Math.abs(editor.marquee.current.fractionX - editor.marquee.start.fractionX) * canvasWidthPx;
          const h = Math.abs(editor.marquee.current.fractionY - editor.marquee.start.fractionY) * canvasHeightPx;
          return <rect x={minX} y={minY} width={w} height={h} fill="rgba(47, 111, 237, 0.12)" stroke="#2f6fed" strokeWidth={chromeScale} />;
        })()}
      {rotateHandle && (
        <>
          <line x1={rotateHandle.x * canvasWidthPx} y1={rotateHandleStemTopY} x2={rotateHandle.x * canvasWidthPx} y2={rotateHandle.y * canvasHeightPx} stroke="#2f6fed" strokeWidth={chromeScale} />
          <circle cx={rotateHandle.x * canvasWidthPx} cy={rotateHandle.y * canvasHeightPx} r={ROTATE_HANDLE_RADIUS_PX * chromeScale} fill="#2f6fed" />
        </>
      )}
      {/* Geometry (resize/reshape) handles — only when exactly one shape is selected, per the
          hit-test order in useShapeDrawEditor's pointer-down handler: rotate handle → geometry
          handle → body drag. */}
      {selectedForHandle.length === 1 &&
        shapeHandles(selectedForHandle[0], canvasWidthPx, canvasHeightPx).map((geomHandle) => (
          <circle
            key={geomHandle.id}
            cx={geomHandle.x * canvasWidthPx}
            cy={geomHandle.y * canvasHeightPx}
            r={GEOMETRY_HANDLE_RADIUS_PX * chromeScale}
            fill="#fff"
            stroke="#2f6fed"
            strokeWidth={chromeScale}
          />
        ))}
      {/* Scale handle — multi-shape selections only (see scaleHandlePosition's own doc comment).
          Drawn as a square (vs. the round geometry/rotate handles) so it reads as a distinct
          affordance. */}
      {scaleHandle &&
        (() => {
          const hx = scaleHandle.x * canvasWidthPx;
          const hy = scaleHandle.y * canvasHeightPx;
          const half = SCALE_HANDLE_HALF_PX * chromeScale;
          return <rect x={hx - half} y={hy - half} width={half * 2} height={half * 2} fill="#fff" stroke="#2f6fed" strokeWidth={chromeScale} />;
        })()}
      {/* Object-snap indicator (§6.3) — a distinct accent color so it doesn't get lost against
          the selection-blue #2f6fed, shown at whatever point a handle-drag is currently snapped
          to. */}
      {editor.snapIndicator && (
        <circle
          cx={editor.snapIndicator.x * canvasWidthPx}
          cy={editor.snapIndicator.y * canvasHeightPx}
          r={SNAP_INDICATOR_RADIUS_PX * chromeScale}
          fill="none"
          stroke={SNAP_INDICATOR_COLOR}
          strokeWidth={1.5 * chromeScale}
        />
      )}
      {activeDraftPoints && activeDraftPoints.length > 0 && (
        <>
          {previewArc && previewArc.kind === 'arc' ? (
            <path
              d={describeArcPath(
                previewArc.cx * canvasWidthPx,
                previewArc.cy * canvasHeightPx,
                previewArc.radius * Math.min(canvasWidthPx, canvasHeightPx),
                previewArc.startAngle,
                previewArc.endAngle,
              )}
              fill="none"
              stroke="#2f6fed"
              strokeWidth={chromeScale}
              strokeDasharray={`${4 * chromeScale} ${3 * chromeScale}`}
            />
          ) : (
            <polyline
              points={[...activeDraftPoints, ...(editor.pendingPoint ? [editor.pendingPoint] : [])]
                .map((p) => `${p.fractionX * canvasWidthPx},${p.fractionY * canvasHeightPx}`)
                .join(' ')}
              fill="none"
              stroke="#2f6fed"
              strokeWidth={chromeScale}
              strokeDasharray={`${4 * chromeScale} ${3 * chromeScale}`}
            />
          )}
          {activeDraftPoints.map((p, i) => (
            <circle key={i} cx={p.fractionX * canvasWidthPx} cy={p.fractionY * canvasHeightPx} r={3 * chromeScale} fill="#2f6fed" />
          ))}
          {/* Highlight the polygon's start vertex when the pointer is within closing range,
              hinting that clicking there finishes the shape instead of adding another vertex. */}
          {showPolygonCloseHint && (
            <circle
              cx={activeDraftPoints[0].fractionX * canvasWidthPx}
              cy={activeDraftPoints[0].fractionY * canvasHeightPx}
              r={GEOMETRY_HANDLE_RADIUS_PX * chromeScale}
              fill="#fff"
              stroke="#2f6fed"
              strokeWidth={chromeScale}
            />
          )}
        </>
      )}
    </>
  );

  const editingTextShape = editor.editingTextShape;

  return (
    <div className="mep-ee-canvas-col" style={{ gridColumn: '2 / 3' }}>
      <div className="mep-element-editor-preview" ref={editor.viewportRef} onPointerDown={editor.handleViewportPointerDown} onContextMenu={(e) => e.preventDefault()}>
        <svg className="mep-ee-shapes-svg" onPointerDown={editor.handleCanvasPointerDown} onPointerMove={editor.handleCanvasPointerMove} onDoubleClick={editor.handleCanvasDoubleClick}>
          {/* Full-viewport transparent hit target — an <svg> only reports pointer events where
              something is "painted" (pointer-events: visiblePainted, the default), unlike an
              HTML <canvas> which is hit-testable across its whole box regardless of pixel
              content. Outside the pan/zoom <g> below, so it always covers the full viewport
              regardless of pan/zoom state, matching the canvas's old inset:0/100%/100%
              coverage — same trick the schematic mockup's own SVG editor uses for its block
              drag handles (mockup.html's hitEl). */}
          <rect x={0} y={0} width="100%" height="100%" fill="transparent" />
          {/* Shapes and all chrome are pointer-events:none (inherited by every descendant) so
              every click/drag funnels through this <svg>'s own handlers above, doing the same
              manual fractionFromEvent + hitTestSymbolShape hit-testing the Canvas2D canvas did
              — never native SVG per-element hit-testing, which would behave differently (e.g.
              an unfilled shape's interior wouldn't be clickable the way hitTestSymbolShape's
              tolerance-based edge test makes it clickable today). */}
          <g pointerEvents="none" transform={`translate(${editor.view.panX} ${editor.view.panY}) scale(${editor.view.scale})`}>
            {chrome}
          </g>
        </svg>
        <div
          className="mep-ee-artwork"
          style={{ width: canvasWidthPx, height: canvasHeightPx, transform: `translate(${editor.view.panX}px, ${editor.view.panY}px) scale(${editor.view.scale})` }}
        >
          {children}
          {editingTextShape && (
            <input
              ref={textRenameRef}
              className="mep-element-editor-port-rename"
              style={{
                left: `${editingTextShape.x * 100}%`,
                top: `${editingTextShape.y * 100}%`,
                transform: `scale(${1 / editor.view.scale}) translate(-50%, -140%)`,
              }}
              value={editor.editingTextValue}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => editor.setEditingTextValue(e.target.value)}
              onBlur={editor.commitTextEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') editor.commitTextEdit();
                if (e.key === 'Escape') editor.setEditingTextId(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
