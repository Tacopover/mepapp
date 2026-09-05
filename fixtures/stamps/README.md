# Stamp image fixtures

Raster stamp images — the symbols placed on drawings for Terminal and
Equipment elements (diffusers, outlets, air handling units, panels, etc.) —
go here.

## What's needed

- **PNG with alpha transparency.** The colorization/tint feature recolors a
  stamp by its alpha mask, so a flat rectangle or a JPEG without transparency
  won't exercise that path correctly.
- **High source resolution.** The old application rasterized vector source art
  at 300 DPI specifically so stamps stay sharp at high zoom (up to 800%).
  Low-resolution source art will show blur/aliasing that has nothing to do
  with the rotation logic being tested — match or exceed that resolution.
- **At least one asymmetric stamp** — for example a directional, arrow-like
  symbol. A rotationally symmetric stamp (a plain circle, say) looks identical
  before and after a wrong rotation, so it can't actually reveal an anchor-point
  or drift bug. This is the single most important fixture for the
  stamp-rotation prototype.
- **At least one stamp with more than one defined port** — for later
  port-transform testing, once the Symbol Creator prototype exists. Not
  required for the first pass of the stamp-rotation prototype, but worth
  including now since ports are defined per stamp image.

## Why this can't be faked

The stamp-rotation prototype is deliberately built to load its stamp art from
this folder rather than embedding or generating synthetic placeholder images.
Until real files are added here, the prototype's visual sharpness check and its
PDF-flatten/export check cannot run end to end — this is a known, accepted
blocking dependency, not something worked around with placeholder art.
