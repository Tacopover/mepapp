import { useEffect } from 'react';
import type { SymbolShape } from '@mepapp/core';
import { fitCanvasSize } from '../shapeCanvasSize.js';
import { useShapeDrawEditor, type BuiltinShapeTool } from '../useShapeDrawEditor.js';
import { ShapeDrawSurface } from './ShapeDrawSurface.js';
import { BUILTIN_SHAPE_TOOL_DEFS, ShapeStyleBar, ShapeToolRail } from './ShapeDrawToolbar.js';

export interface SchematicDrawingEditorProps {
  title: string;
  /** The shapes when the editor opens. The editor keeps its own list and hands it back through `onDone`. */
  shapes: SymbolShape[];
  /** Size of the block in sheet mm. It sets the shape of the drawing area. */
  widthMm: number;
  heightMm: number;
  onDone: (shapes: SymbolShape[]) => void;
  onCancel: () => void;
}

/** Longer side of the drawing area on screen at 100% zoom. The shapes are stored as fractions, so this size does not change what the block looks like. */
const DRAWING_EDITOR_MAX_PX = 600;

/**
 * Draws the free shapes of one `drawing` block on the shared drawing surface
 * (shared-drawing-tool.md Phase 3). It fills the schematic dialog in place of the template editor,
 * because a second Dialog would close both on Escape. Undo history is local to this editor: the
 * caller turns "Done" into one step of the template's own history.
 */
export function SchematicDrawingEditor({ title, shapes, widthMm, heightMm, onDone, onCancel }: SchematicDrawingEditorProps) {
  const { widthPx, heightPx } = fitCanvasSize(widthMm, heightMm, DRAWING_EDITOR_MAX_PX);
  const editor = useShapeDrawEditor<BuiltinShapeTool>({ canvasWidthPx: widthPx, canvasHeightPx: heightPx, initialShapes: shapes });

  // Dialog closes on Escape at the document level, which would throw away the drawing. A capture
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

  return (
    <div className="mep-schematic mep-schematic-drawing">
      <div className="mep-schematic-bar">
        <button type="button" onClick={() => onDone(editor.shapes)}>
          Done
        </button>
        <button type="button" onClick={onCancel} title="Leave without keeping the changes made in this editor">
          Cancel
        </button>
        <strong>{title}</strong>
        <span className="mep-schematic-hint">
          Drawing area {Math.round(widthMm * 100) / 100} × {Math.round(heightMm * 100) / 100} mm. Change the block size in its properties; the shapes scale with it.
        </span>
      </div>
      <div className="mep-ee-body">
        <div className="mep-ee-grid mep-schematic-drawing-grid">
          <ShapeToolRail editor={editor} tools={BUILTIN_SHAPE_TOOL_DEFS} />
          <ShapeDrawSurface editor={editor} canvasWidthPx={widthPx} canvasHeightPx={heightPx} paperFill="#ffffff" />
        </div>
        <ShapeStyleBar editor={editor} />
      </div>
    </div>
  );
}
