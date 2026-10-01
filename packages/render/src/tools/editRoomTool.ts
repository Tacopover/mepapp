import type { FederatedPointerEvent } from 'pixi.js';
import { insertVertex, moveVertices, removeVertex, type Vec2, type VertexRef } from '@mepapp/core';
import type { Tool, ToolContext, ToolDragHandlers } from './types.js';

/** Screen distance a box-select drag needs before it counts as a drag and not as a click. */
const BOX_MIN_DRAG_PX = 4;

/**
 * Room selection and correction tool. A click selects the room under the pointer (Shift adds), a
 * click on nothing clears. On the single selected room: a click on a vertex selects it (Shift
 * toggles it in the vertex selection), a drag from empty space inside or near the room box-selects
 * vertices (Shift adds), a drag on a selected vertex moves all selected vertices, a click on an edge
 * adds a vertex, Alt-click a vertex removes it. Delete removes the selected vertices, or the
 * selected rooms when no vertex is selected (SketchScene). Escape clears the vertex selection, then
 * the room selection.
 */
export class EditRoomTool implements Tool {
  readonly id = 'edit-room' as const;

  onPointerDown(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void {
    const vertex = ctx.hitRoomVertex(world);
    if (vertex) {
      const ref: VertexRef = { ring: vertex.ring, index: vertex.index };
      const same = (r: VertexRef) => r.ring === ref.ring && r.index === ref.index;
      const selection = ctx.getRoomVertexSelection();
      if (event.altKey) {
        const removed = removeVertex(vertex.polygon, vertex);
        ctx.setRoomVertexSelection([]);
        if (removed) ctx.commitRoomPolygon(vertex.roomId, removed);
        return;
      }
      if (event.shiftKey) {
        ctx.setRoomVertexSelection(selection.some(same) ? selection.filter((r) => !same(r)) : [...selection, ref]);
        return;
      }
      const grabbedSelected = selection.some(same);
      if (!grabbedSelected) ctx.setRoomVertexSelection([ref]);
      ctx.drag = {
        kind: 'room-vertex',
        roomId: vertex.roomId,
        refs: grabbedSelected ? [...selection] : [ref],
        origin: (vertex.ring === 0 ? vertex.polygon.outer : vertex.polygon.holes[vertex.ring - 1]!)[vertex.index]!,
        base: vertex.polygon,
        polygon: vertex.polygon,
        changed: false,
        narrowTo: grabbedSelected && selection.length > 1 ? ref : null,
      };
      return;
    }
    const edge = ctx.hitRoomEdge(world);
    if (edge && !event.shiftKey) {
      const polygon = insertVertex(edge.polygon, edge.ring, edge.index, edge.point);
      const ref: VertexRef = { ring: edge.ring, index: edge.index + 1 };
      ctx.previewRoomPolygon(edge.roomId, polygon);
      // The insert moves the indices of the vertices after it: the old vertex selection is stale.
      ctx.setRoomVertexSelection([ref]);
      ctx.drag = { kind: 'room-vertex', roomId: edge.roomId, refs: [ref], origin: edge.point, base: polygon, polygon, changed: true, narrowTo: null };
      return;
    }
    const nearRoomId = ctx.selectedRoomNear(world);
    if (nearRoomId) {
      ctx.drag = { kind: 'room-vertex-box', roomId: nearRoomId, startWorld: world, currentWorld: world, additive: event.shiftKey };
      return;
    }
    ctx.selectRoomAtPoint(world, event.shiftKey);
  }

  onKeyDown(ctx: ToolContext, event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    if (ctx.getRoomVertexSelection().length > 0) ctx.setRoomVertexSelection([]);
    else ctx.clearRoomSelection();
    return true;
  }

  onDeactivate(ctx: ToolContext): void {
    ctx.setRoomVertexSelection([]);
  }

  dragKinds: Tool['dragKinds'] = {
    'room-vertex': {
      onMove: (ctx, _event, world) => {
        const drag = ctx.drag;
        if (drag.kind !== 'room-vertex') return;
        drag.polygon = ctx.pushRoomVerticesOut(drag.roomId, moveVertices(drag.base, drag.refs, { x: world.x - drag.origin.x, y: world.y - drag.origin.y }), drag.refs);
        drag.changed = true;
        ctx.previewRoomPolygon(drag.roomId, drag.polygon);
      },
      onEnd: (ctx) => {
        const drag = ctx.drag;
        if (drag.kind !== 'room-vertex') return;
        ctx.previewRoomPolygon(drag.roomId, null);
        if (drag.changed) ctx.commitRoomPolygon(drag.roomId, drag.polygon);
        else if (drag.narrowTo) ctx.setRoomVertexSelection([drag.narrowTo]);
      },
    } satisfies ToolDragHandlers,
    'room-vertex-box': {
      onMove: (ctx, _event, world) => {
        if (ctx.drag.kind !== 'room-vertex-box') return;
        ctx.drag = { ...ctx.drag, currentWorld: world };
        ctx.redrawOverlay();
      },
      onEnd: (ctx) => {
        const drag = ctx.drag;
        if (drag.kind !== 'room-vertex-box') return;
        const { startWorld, currentWorld, additive } = drag;
        // A drag that stays under the threshold is a plain click.
        if (Math.hypot(currentWorld.x - startWorld.x, currentWorld.y - startWorld.y) * ctx.getZoomScale() < BOX_MIN_DRAG_PX) {
          ctx.selectRoomAtPoint(startWorld, additive);
          return;
        }
        const min = { x: Math.min(startWorld.x, currentWorld.x), y: Math.min(startWorld.y, currentWorld.y) };
        const max = { x: Math.max(startWorld.x, currentWorld.x), y: Math.max(startWorld.y, currentWorld.y) };
        ctx.selectRoomVerticesInBox(drag.roomId, min, max, additive);
      },
    } satisfies ToolDragHandlers,
  };
}
