import { Sprite } from 'pixi.js';
import { getStampDefinition, normalizeDegrees, type PlacedStamp, type StampCategory, type Vec2 } from '@mepapp/core';
import { applyStampColor } from '../colorize.js';
import { createStampCommand } from '../drawingCommands.js';
import { applyTransformToSprite, computeStampBaseScale } from '../stampSprite.js';
import type { Tool, ToolContext } from './types.js';

/**
 * Stamp-placement tool, shared between 'place-terminal' and 'place-equipment' (one class,
 * `category` as the only difference — see scene.ts's original placeStamp). The
 * placement-preview ghost sprite/rotation/texture is shared scene-level state (both
 * place-* tools preview and place the same pending pick), reached through `ToolContext`,
 * not owned by either tool instance.
 */
export class PlaceStampTool implements Tool {
  readonly id: 'place-terminal' | 'place-equipment';

  constructor(private readonly category: StampCategory) {
    this.id = category === 'terminal' ? 'place-terminal' : 'place-equipment';
  }

  onPointerDown(ctx: ToolContext, _event: unknown, world: Vec2): void {
    const pending = ctx.getPendingStampTexture();
    if (!pending) return;
    this.placeStamp(ctx, world, pending);
  }

  onKeyDown(ctx: ToolContext, event: KeyboardEvent): boolean {
    if (event.key === 'Escape') {
      ctx.setTool('select');
      return true;
    }
    if (event.code === 'Space' && ctx.getStampGhostSprite()) {
      event.preventDefault(); // Space otherwise scrolls the page
      const rotation = normalizeDegrees(ctx.getStampGhostRotationDegrees() + 45);
      ctx.setStampGhostRotationDegrees(rotation);
      ctx.getStampGhostSprite()!.rotation = (rotation * Math.PI) / 180;
      return true;
    }
    return false;
  }

  private placeStamp(
    ctx: ToolContext,
    worldPosition: Vec2,
    pending: NonNullable<ReturnType<ToolContext['getPendingStampTexture']>>,
  ): void {
    const { texture, nativeWidth, nativeHeight, definitionId, appearanceDefault } = pending;
    const id = `stamp-${ctx.doc.nextStampSeq++}`;
    // Copy the definition's ports onto the placed instance so resolveSegmentEndpoint's port-snapping has something to snap to.
    const definition = definitionId ? getStampDefinition(definitionId, ctx.doc.customStampDefinitions) : undefined;
    const ports = definition ? [...definition.ports] : [];
    const scaleFactor = appearanceDefault?.scale ?? 1;
    const data: PlacedStamp = {
      id,
      category: this.category,
      transform: { position: worldPosition, rotationDegrees: ctx.getStampGhostRotationDegrees(), scale: { x: scaleFactor, y: scaleFactor } },
      nativeWidth,
      nativeHeight,
      ports,
      definitionId,
      color: appearanceDefault?.color,
    };
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5); // pivot = own center, matching the reference semantics
    const baseScale = computeStampBaseScale(nativeWidth, nativeHeight, texture);
    applyTransformToSprite(sprite, data.transform, baseScale);
    applyStampColor(sprite, texture, data.color);
    ctx.doc.stamps.set(id, { sprite, baseScale, baseTexture: texture });
    ctx.doc.stampsLayer.addChild(sprite);
    ctx.doc.drawingHistory.execute(createStampCommand(data));
    // Instantiates the definition's authoring-time port groups (Element Editor dialog link
    // mode) into real instance-level PortGroup entries — pushed directly (not via
    // setPortGroup, which assumes one group per element) since a definition can carry
    // several independent groups (e.g. an AHU's supply pair and return pair).
    for (const group of definition?.definitionPortGroups ?? []) {
      ctx.doc.portGroups.push({ elementId: id, portIds: group });
    }
    ctx.doc.selectedIds = new Set([id]);
    ctx.syncDrawingLayer();
    ctx.markDirty();
    // Deliberately does NOT revert to Select (unlike draw-textbox/draw-sticky-note) —
    // stamp placement stays active so the user can place the same stamp repeatedly;
    // Escape is the only way out.
    ctx.emit('selectionChanged', ctx.getSelection());
  }
}
