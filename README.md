# MepApp

MepApp is a from-scratch web and desktop rebuild of MEPSketcher, a CAD
(computer-aided design) tool for designing HVAC, electrical, plumbing, and
fire-protection systems by drawing annotated elements on PDF architectural
drawings.

MepApp is fully open source under the AGPLv3 (GNU Affero General Public
License, version 3). The stack uses no paid SDKs and no paid libraries,
anywhere.

## Stack

- TypeScript everywhere
- PixiJS v8 for the interactive overlay (the drawing canvas layer on top of
  the PDF)
- MuPDF.js behind a swappable `PdfEngine` interface, so the PDF engine can be
  replaced later without touching the rest of the app
- Tauri 2 for the desktop build
- pnpm workspaces and Turborepo to manage the monorepo (a single repository
  holding multiple packages)

## AGPLv3 network-use notice

This software uses the GNU Affero General Public License, version 3. Under
AGPLv3 section 13, running a modified version of this software over a
network requires offering the corresponding source code to the users of that
network service.

## Status

This is an active prototype-validation phase. MepApp is not yet a finished
product.

## Test fixtures

See `fixtures/pdfs/README.md` and `fixtures/stamps/README.md` for the test
assets this project needs.
