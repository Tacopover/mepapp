import { ImageSource, Texture } from 'pixi.js';

/** Wraps an already-decoded bitmap (backdrop raster or stamp art) as a PixiJS texture. */
export function textureFromImageBitmap(bitmap: ImageBitmap): Texture {
  const source = new ImageSource({ resource: bitmap });
  return new Texture({ source });
}
