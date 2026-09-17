import type { FederatedPointerEvent } from 'pixi.js';
import { measureRealDistance, type Vec2 } from '@mepapp/core';
import type { Tool, ToolContext } from './types.js';

/**
 * Click-to-measure tool: two clicks capture a segment and emit its real-world distance,
 * using the document's existing calibration. Warns instead of measuring when no
 * calibration has been set yet. Ported unchanged from scene.ts's onPointerDown 'measure'
 * branch.
 */
export class MeasureTool implements Tool {
  readonly id = 'measure' as const;

  onPointerDown(ctx: ToolContext, _event: FederatedPointerEvent, world: Vec2): void {
    const pendingPoints = [...ctx.getPendingPoints(), world];
    ctx.setPendingPoints(pendingPoints);
    if (pendingPoints.length === 2) {
      const [p1, p2] = pendingPoints;
      ctx.setPendingPoints([]);
      if (ctx.doc.calibration) {
        ctx.emit('measurement', measureRealDistance(p1, p2, ctx.doc.calibration));
      } else {
        console.warn('[render] measure tool used with no calibration set yet.');
      }
    }
    ctx.redrawOverlay();
  }
}
