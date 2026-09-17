import type { FederatedPointerEvent } from 'pixi.js';
import { calibrateFromKnownDistance, type Vec2 } from '@mepapp/core';
import type { Tool, ToolContext } from './types.js';

/**
 * Click-to-calibrate tool: two clicks capture a known-distance segment, then prompts for
 * its real-world length via the 'calibrationNeeded' event before setting the document's
 * calibration. Ported unchanged from scene.ts's onPointerDown 'calibrate' branch.
 */
export class CalibrateTool implements Tool {
  readonly id = 'calibrate' as const;

  onPointerDown(ctx: ToolContext, _event: FederatedPointerEvent, world: Vec2): void {
    const pendingPoints = [...ctx.getPendingPoints(), world];
    ctx.setPendingPoints(pendingPoints);
    if (pendingPoints.length === 2) {
      const [p1, p2] = pendingPoints;
      ctx.setPendingPoints([]);
      ctx.emit('calibrationNeeded', p1, p2, (mm: number | null) => {
        if (mm !== null && mm > 0) {
          ctx.doc.calibration = calibrateFromKnownDistance(p1, p2, mm);
          ctx.emit('calibrationSet', ctx.doc.calibration);
          ctx.setTool('select');
        }
        ctx.redrawOverlay();
      });
    }
    ctx.redrawOverlay();
  }
}
