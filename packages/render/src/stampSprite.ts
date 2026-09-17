import type { Sprite, Texture } from 'pixi.js';
import type { Transform2D, Vec2 } from '@mepapp/core';

export function applyTransformToSprite(sprite: Sprite, transform: Transform2D, baseScale: Vec2): void {
  sprite.position.set(transform.position.x, transform.position.y);
  sprite.rotation = (transform.rotationDegrees * Math.PI) / 180; // absolute set — never +=, see core/geometry.ts
  sprite.scale.set(baseScale.x * transform.scale.x, baseScale.y * transform.scale.y);
}

/** Converts texture pixels -> world units at transform.scale = 1, shared by placeStamp and the stamp ghost preview so the two never drift apart. */
export function computeStampBaseScale(nativeWidth: number, nativeHeight: number, texture: Texture): Vec2 {
  return { x: nativeWidth / texture.width, y: nativeHeight / texture.height };
}
