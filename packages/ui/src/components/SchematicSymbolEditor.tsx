import { useEffect, useState } from 'react';
import { validateSchematicSymbol, type SchematicSymbol } from '@mepapp/core';
import { fitCanvasSize } from '../shapeCanvasSize.js';
import { GRID_SPACING_FRACTION, useShapeDrawEditor } from '../useShapeDrawEditor.js';
import { usePortEditor } from '../usePortEditor.js';
import { PortMarkers, PortsSidebar } from './PortEditorParts.js';
import { ShapeDrawSurface } from './ShapeDrawSurface.js';
import { PORT_SHAPE_TOOL_DEFS, ShapeStyleBar, ShapeToolRail, type PortShapeTool } from './ShapeDrawToolbar.js';

export interface SchematicSymbolEditorProps {
  /** The symbol being edited, or undefined for a new one. */
  symbol?: SchematicSymbol;
  onSave: (symbol: SchematicSymbol) => void;
  onCancel: () => void;
}

/** Longer side of the drawing area on screen at 100% zoom. The shapes are fractions, so this does not change the symbol. */
const SYMBOL_EDITOR_MAX_PX = 520;
const DEFAULT_SYMBOL_SIZE_MM = 10;

/**
 * Draws one schematic symbol and its ports (shared-drawing-tool.md Phase 4). It uses the same
 * drawing surface, tools and port editor as the stamp editor. It fills the schematic dialog in
 * place of the template editor, like `SchematicDrawingEditor`, because a second Dialog would close
 * both on Escape. There is no raster step: the library draws the shapes as SVG.
 */
export function SchematicSymbolEditor({ symbol, onSave, onCancel }: SchematicSymbolEditorProps) {
  const [name, setName] = useState(symbol?.name ?? '');
  const [widthMm, setWidthMm] = useState(symbol?.widthMm ?? DEFAULT_SYMBOL_SIZE_MM);
  const [heightMm, setHeightMm] = useState(symbol?.heightMm ?? DEFAULT_SYMBOL_SIZE_MM);
  const [error, setError] = useState<string | null>(null);

  const { widthPx, heightPx } = fitCanvasSize(widthMm, heightMm, SYMBOL_EDITOR_MAX_PX);
  const editor = useShapeDrawEditor<PortShapeTool>({
    canvasWidthPx: widthPx,
    canvasHeightPx: heightPx,
    initialShapes: symbol?.shapes ?? [],
    onUnhandledToolPointerDown: (tool, point) => {
      if (tool === 'port') portsEditor.addPortAt(point.fractionX, point.fractionY);
    },
  });
  const portsEditor = usePortEditor({
    initialPorts: symbol?.ports ?? [],
    initialGroups: symbol?.portGroups ?? [],
    gridSnapEnabled: editor.gridSnapEnabled,
    gridSpacingFraction: GRID_SPACING_FRACTION,
    fractionFromEvent: editor.fractionFromEvent,
  });

  // Dialog closes on Escape at the document level, which would throw away the symbol. A capture
  // listener on the document runs first. While a polygon or arc is half drawn, the hook cancels it.
  const { polygonDraft, arcThreePointDraft, setSelectedShapeIds, setTool } = editor;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || polygonDraft || arcThreePointDraft) return;
      event.stopPropagation();
      setSelectedShapeIds(new Set());
      setTool('select');
    }
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [polygonDraft, arcThreePointDraft, setSelectedShapeIds, setTool]);

  function handleSave() {
    const built: SchematicSymbol = {
      id: symbol?.id ?? crypto.randomUUID(),
      name: name.trim(),
      widthMm,
      heightMm,
      shapes: editor.shapes,
      ports: portsEditor.ports,
      portGroups: portsEditor.groups.length > 0 ? portsEditor.groups : undefined,
    };
    const issues = validateSchematicSymbol(built);
    if (issues.length > 0) {
      setError(issues[0]);
      return;
    }
    onSave(built);
  }

  return (
    <div className="mep-schematic mep-schematic-drawing mep-schematic-symbol">
      <div className="mep-schematic-bar">
        <button type="button" onClick={handleSave}>
          Save symbol
        </button>
        <button type="button" onClick={onCancel} title="Leave without keeping the changes made in this editor">
          Cancel
        </button>
        <input placeholder="Symbol name" aria-label="Symbol name" value={name} onChange={(e) => setName(e.target.value)} />
        <label>
          W mm
          <input type="number" min={0.5} step={0.5} value={widthMm} onChange={(e) => setWidthMm(Number(e.target.value))} />
        </label>
        <label>
          H mm
          <input type="number" min={0.5} step={0.5} value={heightMm} onChange={(e) => setHeightMm(Number(e.target.value))} />
        </label>
        <span className="mep-schematic-hint">Size in the schematic when placed. The shapes and ports scale with it.</span>
      </div>
      <div className="mep-ee-body">
        <div className="mep-ee-grid">
          <ShapeToolRail editor={editor} tools={PORT_SHAPE_TOOL_DEFS} />
          <ShapeDrawSurface editor={editor} canvasWidthPx={widthPx} canvasHeightPx={heightPx} paperFill="#ffffff">
            <PortMarkers portsEditor={portsEditor} viewScale={editor.view.scale} />
          </ShapeDrawSurface>
          <div className="mep-ee-sidebar">
            <PortsSidebar portsEditor={portsEditor} hint="Use the Port tool to add a connection point. Annotations snap to ports. Drag a port to move it. Double-click a port to rename it." />
          </div>
        </div>
        <ShapeStyleBar editor={editor} />
        {error && <p className="mep-field-error">{error}</p>}
      </div>
    </div>
  );
}
