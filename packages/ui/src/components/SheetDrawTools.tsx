import type { ComponentType, ReactNode } from 'react';
import { getBlocksBounds, type ResolvedBlock } from '@mepapp/core';
import { FILLABLE_TOOLS, LINE_WIDTHS_MM, SHEET_DRAW_TOOLS, type SheetDrawTool } from '../sheetDraw.js';
import type { SheetDraw } from '../useSheetDraw.js';
import type { useSheetView } from '../useSheetView.js';
import {
  IconArcTool,
  IconCircleTool,
  IconEllipseTool,
  IconLineArrow,
  IconMinus,
  IconPlus,
  IconPolygonTool,
  IconRectTool,
  IconSegment,
  IconSelect,
  IconStamp,
  IconTextbox,
  IconZoomFit,
  type IconProps,
} from '../icons.js';

const TOOL_ICONS: Record<SheetDrawTool, ComponentType<IconProps>> = {
  select: IconSelect,
  line: IconSegment,
  arrow: IconLineArrow,
  rect: IconRectTool,
  circle: IconCircleTool,
  ellipse: IconEllipseTool,
  arc: IconArcTool,
  polygon: IconPolygonTool,
  text: IconTextbox,
  symbol: IconStamp,
};

const LINE_TOOLS: SheetDrawTool[] = ['line', 'arrow', 'rect', 'circle', 'ellipse', 'arc', 'polygon'];

/** The vertical tool bar left of the sheet, in the template editor and the schematic dialog (electrical-schematic-templates.md Phase 5c). */
export function SheetToolRail({ draw, children }: { draw: SheetDraw; children?: ReactNode }) {
  return (
    <div className="mep-ws-rail" role="toolbar" aria-label="Draw tools" aria-orientation="vertical">
      {SHEET_DRAW_TOOLS.map((tool) => {
        const Icon = TOOL_ICONS[tool.id];
        return (
          <button
            key={tool.id}
            type="button"
            className={`mep-rail-btn${draw.tool === tool.id ? ' active' : ''}`}
            aria-pressed={draw.tool === tool.id}
            aria-label={tool.label}
            title={`${tool.label} (${tool.key})`}
            onClick={() => draw.chooseTool(tool.id)}
          >
            <Icon size={18} />
          </button>
        );
      })}
      {children && <div className="mep-rail-divider" />}
      {children}
    </div>
  );
}

export interface SheetToolOptionsProps {
  draw: SheetDraw;
  /** Opens the symbol library so the user can pick the symbol that the Symbol tool places. */
  onChooseSymbol: () => void;
  /** The target selector of the surface ("Add to" or "Attach to"). */
  children?: ReactNode;
}

/** The options of the active draw tool, in one bar above the sheet. Nothing shows while Select is active. */
export function SheetToolOptions({ draw, onChooseSymbol, children }: SheetToolOptionsProps) {
  if (draw.tool === 'select' && !draw.pendingText) return null;
  const label = SHEET_DRAW_TOOLS.find((t) => t.id === draw.tool)?.label;
  return (
    <div className="mep-ws-options" role="group" aria-label="Tool options">
      <strong>{label}</strong>
      {draw.pendingText ? (
        <>
          <label>
            Text
            <input
              type="text"
              autoFocus
              value={draw.textValue}
              onChange={(e) => draw.setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  draw.confirmText();
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  draw.escape();
                }
              }}
            />
          </label>
          <button type="button" onClick={draw.confirmText}>
            Place text
          </button>
        </>
      ) : (
        <>
          {LINE_TOOLS.includes(draw.tool) && (
            <label>
              Line
              <select value={draw.lineWidthMm} onChange={(e) => draw.setLineWidthMm(Number(e.target.value))}>
                {LINE_WIDTHS_MM.map((w) => (
                  <option key={w} value={w}>
                    {w} mm
                  </option>
                ))}
              </select>
            </label>
          )}
          {FILLABLE_TOOLS.includes(draw.tool) && (
            <label>
              <input type="checkbox" checked={draw.fill} onChange={(e) => draw.setFill(e.target.checked)} /> Fill
            </label>
          )}
          {draw.tool === 'symbol' && (
            <>
              <span className="mep-ws-options-value">{draw.symbol ? draw.symbol.name : 'No symbol chosen'}</span>
              <button type="button" onClick={onChooseSymbol}>
                Choose…
              </button>
            </>
          )}
          <label title="Stay on the tool after a shape is finished. Holding Shift while you finish a shape does the same for that shape.">
            <input type="checkbox" checked={draw.keepTool} onChange={(e) => draw.setKeepTool(e.target.checked)} /> Keep tool
          </label>
          {children}
        </>
      )}
    </div>
  );
}

const SHEET_FURNITURE = new Set(['frame', 'titleBlock', 'totalsTable']);

/** The bounds that "Zoom to content" shows: every block except the frame, title block and totals table, which sit at the sheet edges. */
export function contentBounds(blocks: ResolvedBlock[]) {
  return getBlocksBounds(blocks.filter((b) => !SHEET_FURNITURE.has(b.type))) ?? getBlocksBounds(blocks);
}

/** The hint under the sheet for what the pointer does now. */
export function sheetStatusText(draw: SheetDraw, selectHint: string): string {
  if (draw.pendingText) return 'Type the text in the bar above the sheet. Enter places it, Escape cancels.';
  if (draw.tool === 'polygon' && draw.cornerCount > 0) return `${draw.cornerCount} corner${draw.cornerCount === 1 ? '' : 's'}. Click to add a corner. Enter or double-click finishes, Backspace removes the last corner, Escape cancels.`;
  if (draw.tool === 'symbol' && !draw.symbol) return 'Choose a symbol in the bar above the sheet.';
  if (draw.tool === 'symbol') return 'Click on the sheet to place the symbol. Escape leaves the tool.';
  if (draw.tool === 'select') return selectHint;
  return `${SHEET_DRAW_TOOLS.find((t) => t.id === draw.tool)?.hint}. Hold Alt to turn off the grid. Escape leaves the tool.`;
}

export interface SheetViewBarProps {
  sheetView: ReturnType<typeof useSheetView>;
  /** Zooms to the blocks on the sheet. Undefined when there is nothing to zoom to. */
  onZoomToContent?: () => void;
  status: string;
  /** Controls of the surface, such as the grid. */
  children?: ReactNode;
}

const ZOOM_STEP = 1.25;

/** The bar under the sheet: zoom controls, the surface's own controls and the status line. */
export function SheetViewBar({ sheetView, onZoomToContent, status, children }: SheetViewBarProps) {
  return (
    <div className="mep-ws-viewbar">
      <div className="mep-ee-bar-cluster">
        <button type="button" className="mep-rail-btn" title="Zoom out" aria-label="Zoom out" onClick={() => sheetView.zoomBy(1 / ZOOM_STEP)}>
          <IconMinus size={16} />
        </button>
        <span className="mep-ee-zoom-readout" title="Zoom, as a percentage of the whole sheet">
          {sheetView.zoomPercent}%
        </span>
        <button type="button" className="mep-rail-btn" title="Zoom in" aria-label="Zoom in" onClick={() => sheetView.zoomBy(ZOOM_STEP)}>
          <IconPlus size={16} />
        </button>
        <button type="button" className="mep-rail-btn" title="Fit the sheet" aria-label="Fit the sheet" onClick={sheetView.fit}>
          <IconZoomFit size={16} />
        </button>
        <button type="button" className="mep-ws-textbtn" disabled={!onZoomToContent} onClick={onZoomToContent} title="Zoom to the circuits and the other blocks, without the frame, title block and totals table">
          Zoom to content
        </button>
      </div>
      {children && <div className="mep-ee-bar-divider" />}
      {children}
      <span className="mep-ws-status" role="status" title={status}>
        {status}
      </span>
    </div>
  );
}
