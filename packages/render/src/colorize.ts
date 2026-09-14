import { CanvasSource, Texture, type Sprite } from 'pixi.js';

/**
 * Recolors a stamp's art for a chosen appearance color. PixiJS Sprite.tint
 * is multiplicative (result = pixel * tint / 255), which can never recolor
 * the fixture stamps: they're real CAD symbols drawn in pure black
 * (#000000), and black times any tint is still black. The old MEPSketcher
 * hit the same wall and fixed it the same way this does (see
 * ImageColorizer.cs, CreateColorizedImage): replace each non-transparent
 * pixel with the target color, blended by how dark (luminance) the source
 * pixel already was, so anti-aliased edges and gradients survive.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function colorizeImageData(imageData: ImageData, color: Rgb): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const luminance = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    const blend = 1 - luminance;
    data[i] = color.r * blend + data[i] * (1 - blend);
    data[i + 1] = color.g * blend + data[i + 1] * (1 - blend);
    data[i + 2] = color.b * blend + data[i + 2] * (1 - blend);
  }
}

const colorizedCache = new Map<Texture, Map<string, Texture>>();

/**
 * Returns a recolored variant of `baseTexture` for `colorHex`, caching per
 * (texture, color) — syncStampSprites re-applies a stamp's color on every
 * drawing-layer sync (including every mousemove frame during a drag of
 * something else entirely), so this must not rebuild the canvas each time.
 */
export function getColorizedTexture(baseTexture: Texture, colorHex: string): Texture {
  let byColor = colorizedCache.get(baseTexture);
  const cached = byColor?.get(colorHex);
  if (cached) return cached;

  const width = baseTexture.source.pixelWidth;
  const height = baseTexture.source.pixelHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(baseTexture.source.resource as CanvasImageSource, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  colorizeImageData(imageData, hexToRgb(colorHex));
  ctx.putImageData(imageData, 0, 0);

  const texture = new Texture({ source: new CanvasSource({ resource: canvas }) });
  if (!byColor) {
    byColor = new Map();
    colorizedCache.set(baseTexture, byColor);
  }
  byColor.set(colorHex, texture);
  return texture;
}

/** Applies `color` to `sprite` against `baseTexture` — the shared read path for placeStamp/syncStampSprites/pasteClipboard/loadProjectFromJson, so they can't drift into re-adding the old (broken) tint approach independently. */
export function applyStampColor(sprite: { texture: Texture }, baseTexture: Texture, color: string | undefined): void {
  sprite.texture = color ? getColorizedTexture(baseTexture, color) : baseTexture;
}

/** Destroys every colorized variant cached for `baseTexture` — call alongside destroying baseTexture itself (document teardown, project reload) so no cache entry outlives its source. */
export function releaseColorizedTextures(baseTexture: Texture): void {
  const byColor = colorizedCache.get(baseTexture);
  if (!byColor) return;
  for (const texture of byColor.values()) texture.destroy(true);
  colorizedCache.delete(baseTexture);
}

/**
 * Tears down a batch of stamp sprites and their base textures (document
 * teardown, project reload) — never via `sprite.destroy({texture: true})`,
 * since a colored sprite's live `.texture` may be a cache-shared colorized
 * variant (destroying it here would break sibling sprites still using that
 * cache entry) and since consecutive placements of the same stamp definition
 * share one base texture (set once by setStampTexture, reused by every
 * placeStamp call until the next pick), so a naive per-entry destroy would
 * double-free it. `Texture.WHITE` (debugPopulateForBenchmark's placeholder
 * art) is a shared PixiJS singleton and is never destroyed.
 */
export function destroyStampEntries(entries: Iterable<{ sprite: Sprite; baseTexture: Texture }>): void {
  const released = new Set<Texture>();
  for (const entry of entries) {
    entry.sprite.destroy();
    if (released.has(entry.baseTexture)) continue;
    released.add(entry.baseTexture);
    releaseColorizedTextures(entry.baseTexture);
    if (entry.baseTexture !== Texture.WHITE) entry.baseTexture.destroy(true);
  }
}
