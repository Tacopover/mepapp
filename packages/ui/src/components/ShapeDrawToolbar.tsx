import type { ComponentType } from 'react';
import { ColorPicker } from './ColorPicker.js';
import { ZOOM_STEP, type BuiltinShapeTool, type ShapeDrawEditor } from '../useShapeDrawEditor.js';
import {
  IconArcThreePointTool,
  IconArcTool,
  IconBringToFront,
  IconCircleTool,
  IconCopy,
  IconEllipseTool,
  IconGridSnap,
  IconLineArrow,
  IconMinus,
  IconMirror,
  IconObjectSnap,
  IconPlus,
  IconPolygonTool,
  IconPort,
  IconRectTool,
  IconRedo,
  IconRotate,
  IconScale,
  IconSegment,
  IconSelect,
  IconSendToBack,
  IconSnapAngle,
  IconTextbox,
  IconTrash,
  IconUndo,
  IconZoomFit,
  type IconProps,
} from '../icons.js';

export interface ShapeToolDef<TTool extends string> {
  tool: TTool;
  label: string;
  Icon: ComponentType<IconProps>;
}

/** The tools `useShapeDrawEditor` handles itself, in rail order. A consumer with its own tool (the stamp editor's Port) splices it in. */
export const BUILTIN_SHAPE_TOOL_DEFS: ShapeToolDef<BuiltinShapeTool>[] = [
  { tool: 'select', label: 'Select', Icon: IconSelect },
  { tool: 'line', label: 'Line', Icon: IconSegment },
  { tool: 'arrow', label: 'Arrow', Icon: IconLineArrow },
  { tool: 'rect', label: 'Rect', Icon: IconRectTool },
  { tool: 'circle', label: 'Circle', Icon: IconCircleTool },
  { tool: 'ellipse', label: 'Ellipse', Icon: IconEllipseTool },
  { tool: 'arc', label: 'Arc', Icon: IconArcTool },
  { tool: 'arcThreePoint', label: 'Arc (3-pt)', Icon: IconArcThreePointTool },
  { tool: 'polygon', label: 'Polygon', Icon: IconPolygonTool },
  { tool: 'text', label: 'Text', Icon: IconTextbox },
];

export type PortShapeTool = BuiltinShapeTool | 'port';

/** The built-in tools plus the Port tool, right after Select. The stamp editor and the symbol editor both use it; `usePortEditor` handles the tool's click. */
export const PORT_SHAPE_TOOL_DEFS: ShapeToolDef<PortShapeTool>[] = [BUILTIN_SHAPE_TOOL_DEFS[0], { tool: 'port', label: 'Port', Icon: IconPort }, ...BUILTIN_SHAPE_TOOL_DEFS.slice(1)];

/** Icon-only rail (element-editor-ui-redesign-spec.md §2) — reuses the main canvas's own icon set (Rail.tsx / icons.tsx) where a tool already has one. Sits in the first column of `.mep-ee-grid`. */
export function ShapeToolRail<TTool extends string>({ editor, tools }: { editor: ShapeDrawEditor<TTool>; tools: ShapeToolDef<TTool>[] }) {
  return (
    <div className="mep-ee-rail" style={{ gridColumn: '1 / 2' }}>
      {tools.map(({ tool, label, Icon }) => (
        <button key={tool} type="button" className={`mep-rail-btn${editor.tool === tool ? ' active' : ''}`} title={label} onClick={() => editor.setTool(tool)}>
          <Icon size={18} />
        </button>
      ))}
      <div className="mep-rail-divider" />
      <button type="button" className="mep-rail-btn" title="Undo" disabled={!editor.shapesManager.canUndo} onClick={editor.undoShapes}>
        <IconUndo size={18} />
      </button>
      <button type="button" className="mep-rail-btn" title="Redo" disabled={!editor.shapesManager.canRedo} onClick={editor.redoShapes}>
        <IconRedo size={18} />
      </button>
    </div>
  );
}

/** Style, selection actions, zoom and snap controls under the canvas. */
export function ShapeStyleBar<TTool extends string>({ editor }: { editor: ShapeDrawEditor<TTool> }) {
  return (
    <div className="mep-ee-bar">
      <div className="mep-ee-bar-cluster mep-shape-style-row">
        <label>
          Stroke <ColorPicker value={editor.activeStyle.stroke} onChange={(color) => editor.updateActiveStyle({ stroke: color })} />
        </label>
        <label>
          Width{' '}
          <input
            type="number"
            min={0.002}
            max={0.05}
            step={0.002}
            value={editor.activeStyle.strokeWidth}
            onChange={(e) => editor.updateActiveStyle({ strokeWidth: Number(e.target.value) })}
            style={{ width: 56 }}
          />
        </label>
        <label>
          <input type="checkbox" checked={editor.activeStyle.fill !== null} onChange={(e) => editor.updateActiveStyle({ fill: e.target.checked ? editor.activeStyle.stroke : null })} /> Fill
        </label>
        {editor.activeStyle.fill !== null && <ColorPicker value={editor.activeStyle.fill} onChange={(color) => editor.updateActiveStyle({ fill: color })} />}
      </div>
      <div className="mep-ee-bar-divider" />
      <div className="mep-ee-bar-cluster">
        <button type="button" className="mep-rail-btn" onClick={editor.duplicateSelection} disabled={editor.selectedShapes.length === 0} title="Duplicate">
          <IconCopy size={18} />
        </button>
        <button type="button" className="mep-rail-btn" onClick={editor.rotateSelection90} disabled={editor.selectedShapes.length === 0} title="Rotate 90°">
          <IconRotate size={18} />
        </button>
        <button type="button" className="mep-rail-btn" onClick={() => editor.mirrorSelection('horizontal')} disabled={editor.selectedShapes.length === 0} title="Mirror horizontally">
          <IconMirror size={18} />
        </button>
        <button type="button" className="mep-rail-btn" onClick={() => editor.mirrorSelection('vertical')} disabled={editor.selectedShapes.length === 0} title="Mirror vertically">
          <IconMirror size={18} style={{ transform: 'rotate(90deg)' }} />
        </button>
        <label className="mep-ee-scale-field">
          <IconScale size={16} />
          <input
            type="number"
            min={1}
            style={{ width: 48 }}
            value={editor.scalePercentInput}
            disabled={editor.selectedShapes.length === 0}
            onChange={(e) => editor.setScalePercentInput(e.target.value)}
            onBlur={editor.applyScalePercent}
            onKeyDown={(e) => {
              if (e.key === 'Enter') editor.applyScalePercent();
            }}
          />
          %
        </label>
        <button type="button" className="mep-rail-btn" onClick={editor.bringSelectionToFront} disabled={editor.selectedShapes.length === 0} title="Bring to front">
          <IconBringToFront size={18} />
        </button>
        <button type="button" className="mep-rail-btn" onClick={editor.sendSelectionToBack} disabled={editor.selectedShapes.length === 0} title="Send to back">
          <IconSendToBack size={18} />
        </button>
        <button type="button" className="mep-rail-btn" onClick={editor.deleteSelectedShapes} disabled={editor.selectedShapes.length === 0} title="Delete">
          <IconTrash size={18} />
        </button>
      </div>
      <div className="mep-ee-bar-divider" />
      <div className="mep-ee-bar-cluster">
        <button type="button" className="mep-rail-btn" onClick={() => editor.zoomAtScreenPoint(1 / ZOOM_STEP, { x: editor.viewportSize.width / 2, y: editor.viewportSize.height / 2 })} title="Zoom out">
          <IconMinus size={16} />
        </button>
        <span className="mep-ee-zoom-readout">{Math.round(editor.view.scale * 100)}%</span>
        <button type="button" className="mep-rail-btn" onClick={() => editor.zoomAtScreenPoint(ZOOM_STEP, { x: editor.viewportSize.width / 2, y: editor.viewportSize.height / 2 })} title="Zoom in">
          <IconPlus size={16} />
        </button>
        <button type="button" className="mep-rail-btn" onClick={() => editor.fitView()} title="Fit">
          <IconZoomFit size={18} />
        </button>
      </div>
      <div className="mep-ee-bar-divider" />
      <div className="mep-ee-bar-cluster">
        <button type="button" className={`mep-rail-btn${editor.gridSnapEnabled ? ' active' : ''}`} onClick={() => editor.setGridSnapEnabled((v) => !v)} title="Grid snap">
          <IconGridSnap size={16} />
        </button>
        <button type="button" className={`mep-rail-btn${editor.objectSnapEnabled ? ' active' : ''}`} onClick={() => editor.setObjectSnapEnabled((v) => !v)} title="Object snap">
          <IconObjectSnap size={16} />
        </button>
        <button type="button" className={`mep-rail-btn${editor.angleSnapEnabled ? ' active' : ''}`} onClick={() => editor.setAngleSnapEnabled((v) => !v)} title="Angle snap">
          <IconSnapAngle size={16} />
        </button>
        <input
          type="number"
          min={1}
          max={180}
          className="mep-ee-angle-input"
          value={editor.angleSnapDegreesInput}
          disabled={!editor.angleSnapEnabled}
          onChange={(e) => editor.setAngleSnapDegreesInput(e.target.value)}
          title="Angle snap increment (degrees)"
        />
      </div>
      {editor.singleSelectedShape?.kind === 'arc' && (
        <>
          <div className="mep-ee-bar-divider" />
          <div className="mep-ee-bar-cluster">
            <label>
              Start°
              <input
                type="number"
                style={{ width: 52 }}
                value={Math.round((editor.singleSelectedShape.startAngle * 180) / Math.PI)}
                onChange={(e) =>
                  editor.commitShapes(
                    editor.shapes.map((s) => (s.id === editor.singleSelectedShape!.id && s.kind === 'arc' ? { ...s, startAngle: (Number(e.target.value) * Math.PI) / 180 } : s)),
                  )
                }
              />
            </label>
            <label>
              End°
              <input
                type="number"
                style={{ width: 52 }}
                value={Math.round((editor.singleSelectedShape.endAngle * 180) / Math.PI)}
                onChange={(e) =>
                  editor.commitShapes(
                    editor.shapes.map((s) => (s.id === editor.singleSelectedShape!.id && s.kind === 'arc' ? { ...s, endAngle: (Number(e.target.value) * Math.PI) / 180 } : s)),
                  )
                }
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
