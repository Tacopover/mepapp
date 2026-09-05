# PDF fixtures

Real architectural PDF drawings — floor plans, MEP background sheets — go here.
These are used to validate the stamp-rotation, coordinate-fidelity, and
frame-rate prototypes against real-world files, not synthetic ones.

## What's needed

- **Vector-based, not scanned.** A real CAD/BIM export (Revit, AutoCAD, etc.)
  with actual vector line work and text — not a flattened raster scan. The
  rendering and coordinate-fidelity checks are meaningless against a scanned
  image.
- **At least one small, simple sheet** (roughly 1-3 MB) — for fast iteration
  while developing and debugging the stamp-rotation and coordinate-fidelity
  prototypes.
- **At least one large, complex sheet** (roughly 10 MB+, several thousand
  vector paths, multiple layers) — for the frame-rate-under-load prototype,
  which needs a genuinely heavy real-world sheet, not a small one padded out
  synthetically.
- **At least one PDF with a rotated page** — a page whose PDF page dictionary
  has a non-zero `/Rotate` entry (90 or 270). This is needed to check that
  coordinate calibration survives page rotation, which is a common source of
  transform bugs.

## Why this can't be faked

The stamp-rotation and coordinate-fidelity prototypes are deliberately built to
load real files from this folder rather than embedding or generating synthetic
placeholders. Until real files are added here, those prototypes' visual and
export checks cannot run end to end — this is a known, accepted blocking
dependency, not something worked around with placeholder art.
