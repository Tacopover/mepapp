// Stamp art (fixtures/stamps, see that folder's README) is fetched as either
// a raster PNG or a vector SVG. `createImageBitmap()` decodes PNG directly,
// but Chromium's ImageBitmap decoder can't handle SVG sources — it rejects
// with "InvalidStateError: The source image could not be decoded." SVG blobs
// are routed through an <img>+<canvas> rasterization pass instead, since
// canvas drawImage() can paint an SVG-backed <img> even though
// createImageBitmap() can't decode the same bytes directly.

/** Same 300 DPI convention as @mepapp/render's STAMP_SOURCE_DPI (scene.ts) — stamp art's pixel size at 300 DPI is expected to match its nominal size in PDF points. */
const STAMP_SOURCE_DPI = 300;

export interface StampBitmapTarget {
  /** Nominal size in PDF points (StampDefinition.nativeWidth/nativeHeight) to rasterize an SVG at. Ignored for raster formats, which keep their own pixel dimensions. */
  widthPt: number;
  heightPt: number;
}

export async function loadStampBitmap(blob: Blob, target?: StampBitmapTarget): Promise<ImageBitmap> {
  if (blob.type !== 'image/svg+xml') return createImageBitmap(blob);
  const px = target
    ? { width: (target.widthPt / 72) * STAMP_SOURCE_DPI, height: (target.heightPt / 72) * STAMP_SOURCE_DPI }
    : undefined;
  return rasterizeSvg(blob, px);
}

function rasterizeSvg(blob: Blob, px?: { width: number; height: number }): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      // "Contain" scaling: rasterize at the SVG's OWN intrinsic aspect ratio
      // rather than stretching independently on each axis to exactly fill
      // px's target box. A StampDefinition's nativeWidth/nativeHeight is
      // sometimes a poor match for the art's real aspect ratio (see
      // fixtures/stamps/D5_Luminaire_rectangular.svg, whose 676x190 viewBox
      // doesn't match its 60x30 definition) — stretching to fill would bake
      // a non-uniform, aspect-distorting scale into the rasterized pixels
      // before scene.ts ever recomputes a placed size from them.
      const naturalWidth = img.naturalWidth || 1;
      const naturalHeight = img.naturalHeight || 1;
      const scale = px ? Math.min(px.width / naturalWidth, px.height / naturalHeight) : 1;
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      URL.revokeObjectURL(url);
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable for SVG rasterization'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      createImageBitmap(canvas).then(resolve, reject);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG stamp art'));
    };
    img.src = url;
  });
}
