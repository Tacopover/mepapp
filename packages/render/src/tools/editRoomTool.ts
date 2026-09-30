import type { FederatedPointerEvent } from 'pixi.js';
import { insertVertex, moveVertex, removeVertex, type Vec2 } from '@mepapp/core';
import type { Tool, ToolContext, ToolDragHandlers } from './types.js';

/**
 * Room selection and correction tool. A click selects the room under the pointer (Shift adds), a
 * click on nothing clears. On the single selected room: drag a vertex to move it, click an edge to
 * add a vertex, Alt-click a vertex to remove it. Delete removes the selected rooms (SketchScene).
 */
export class EditRoomTool implements Tool {
  readonly id = 'edit-room' as const;

  onPointerDown(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void {
    const vertex = ctx.hitRoomVertex(world);
    if (vertex) {
      if (event.altKey) {
        const removed = removeVertex(vertex.polygon, vertex);
        if (removed) ctx.commitRoomPolygon(vertex.roomId, removed);
        return;
      }
      ctx.drag = { kind: 'room-vertex', roomId: vertex.roomId, ring: vertex.ring, index: vertex.index, polygon: vertex.polygon, changed: false };
      return;
    }
    const edge = ctx.hitRoomEdge(world);
    if (edge && !event.shiftKey) {
      const polygon = insertVertex(edge.polygon, edge.ring, edge.index, edge.point);
      ctx.previewRoomPolygon(edge.roomId, polygon);
      ctx.drag = { kind: 'room-vertex', roomId: edge.roomId, ring: edge.ring, index: edge.index + 1, polygon, changed: true };
      return;
    }
    ctx.selectRoomAtPoint(world, event.shiftKey);
  }

  onKeyDown(ctx: ToolContext, event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    ctx.clearRoomSelection();
    return true;
  }

  onDeactivate(ctx: ToolContext): void {
    ctx.clearRoomSelection();
  }

  dragKinds: Tool['dragKinds'] = {
    'room-vertex': {
      onMove: (ctx, _event, world) => {
        const drag = ctx.drag;
        if (drag.kind !== 'room-vertex') return;
        drag.polygon = moveVertex(drag.polygon, { ring: drag.ring, index: drag.index }, world);
        drag.changed = true;
        ctx.previewRoomPolygon(drag.roomId, drag.polygon);
      },
      onEnd: (ctx) => {
        const drag = ctx.drag;
        if (drag.kind !== 'room-vertex') return;
        ctx.previewRoomPolygon(drag.roomId, null);
        if (drag.changed) ctx.commitRoomPolygon(drag.roomId, drag.polygon);
      },
    } satisfies ToolDragHandlers,
  };
}
