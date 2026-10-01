// Types and parameters for room detection from vector PDF floor plans.
// Pure math on typed arrays: no rendering, no I/O, and no dependency on
// @mepapp/pdf-engine or mupdf. Algorithm description:
// .claude/plans/room-detection-algorithm.md

import type { Vec2 } from '../geometry.js';

// Segment layout. This MIRRORS the layout of VectorPageData in
// packages/pdf-engine/src/index.ts (core must not import that package). The
// caller passes `VectorPageData.segments` and `.segmentCount` straight in.
// A test (rooms.test.ts) documents these constants.
export const SEGMENT_STRIDE = 8;
export const SEG_X0 = 0;
export const SEG_Y0 = 1;
export const SEG_X1 = 2;
export const SEG_Y1 = 3;
export const SEG_WIDTH = 4; // stroke width in pt, 0 for fills
export const SEG_COLOR = 5; // 0xRRGGBB (not used by the algorithm: it must not depend on colour)
export const SEG_KIND = 6; // (kind & 3): 0 stroked line, 1 filled edge, 2 stroked curve piece, 3 filled curve piece
export const SEG_PATH_ID = 7; // segments of one subpath share an id
export const KIND_MASK = 3;
export const KIND_CLOSED_FLAG = 4; // added to kind when the segment belongs to a closed subpath

// Page-space segments that may be wall lines. Page space is the displayed
// page space of calibration.ts (points, origin top-left, y down).
export interface WallCandidateSegments {
  segments: Float64Array; // 8 numbers per segment, see SEGMENT_STRIDE
  segmentCount: number;
  // Page rectangle [x0, y0, x1, y1] in points. Limits the raster area. When
  // absent, the bounding box of all segments is used.
  bounds?: readonly [number, number, number, number];
}

// Wall filter parameters. All lengths are in millimetres of real drawing size
// (converted with the mmPerPt argument).
export interface WallFilterParams {
  minLenMm: number; // long pair member: minimum length
  stubMinMm: number; // shortest line that can join a pair
  stubTouchMm: number; // a stub must end within this distance of a long kept line
  maxWallMm: number; // largest distance between the two faces of a wall
  minGapMm: number; // smallest distance between two lines of a pair (drops duplicates)
  minOverlapMm: number; // minimum overlap along the wall
  partnerMinMm: number; // a line shorter than partnerLineMaxMm only counts partners at least this long (chair lines beside a table edge do not make it a wall); 0 = off
  partnerLineMaxMm: number; // longer lines (walls, facades) count every partner
  angTolDeg: number;
  coverFrac: number; // partner overlaps must cover this fraction of a line
  hatchPartners: number; // this many partners and a short line means hatch
  hatchMaxLenMm: number;
  curveChordMm: number; // curves are cut into chords of about this length
  curveAngTolDeg: number;
  curveOverlapFrac: number;
  furnMaxMm: number; // furniture loop rule
  furnMinMm: number;
  furnAspect: number;
  furnThickMm: number;
  furnBigMaxMm: number;
  bridgeTouchMm: number; // a loop touched by wall ends on two opposite sides is a column
  stairMinSteps: number; // 0 turns the stair rule off
  stairMinPitchMm: number;
  stairMaxPitchMm: number;
  stairMinLenMm: number;
  stairMaxLenMm: number;
  stairLenRatio: number;
  stairBox: boolean;
  stairBoxMaxSpanMm: number;
  stairEndTolMm: number;
  dashMinRun: number;
  dashMinPieceMm: number; // pieces shorter than this are ignored by the dash rule (ticks, dots)
  dashEndTolMm: number; // another line ending this close to a dash end touches it ...
  dashMaxContacts: number; // ... and a run whose pieces have more touching lines (median) is not dashed (windows between frames)
  minCompMm: number; // free-standing components smaller than this are dropped ...
  compFrac: number; // ... or smaller than this fraction of the largest component
  // Reject paired lines that have no hatch ticks between them (furniture next
  // to hatched walls). Acts only on a drawing in hatch style (hatchStyleFrac);
  // on the other fixtures it rejects nothing.
  hatchEvidence: boolean;
  hatchTickMaxMm: number;
  hatchMinAngDeg: number;
  hatchMinDens: number; // ticks per metre
  hatchThinMm: number;
  hatchExemptLenMm: number;
  hatchTouchMm: number;
  hatchRunAngDeg: number;
  hatchRejMinW: number; // pen width in pt
  hatchBridge: boolean;
  hatchStyleFrac: number;
}

export interface RoomFillParams {
  gapMm: number; // door gaps up to this width count as wall
  pxMm: number; // raster resolution, millimetres per pixel
  seedRadiusMm: number; // the auto seed search stays within this distance
  roiMm: number; // half side of the square raster area around the seed
  // The fill grows this far into the wall line. 0 puts the boundary on the
  // wall's inner face (drawn line). The study fitted 100 to architect labels.
  wallGrowMm: number;
  fillHoles: boolean; // islands (columns, furniture) inside the room become part of the fill
  seedClosed: boolean; // the auto seed walks only through pixels wider than the gap
  autoSeed: boolean; // move the seed to the widest point near the click
  // Fill the rounded corners that the grow back leaves at room corners (dead-end pockets next to the fill). Door openings stay closed.
  squareCorners: boolean;
  // Snap the polygon edges to the kept wall lines and rebuild the corners as line intersections. Only with wallGrowMm 0.
  snapToWalls: boolean;
  snapTolPx: number; // largest move of an edge or corner vertex when snapping, in pixels
  snapAngDeg: number; // largest direction difference between a polygon edge and the wall line it snaps to
  simplifyTolPx: number; // Douglas-Peucker tolerance of the polygon, in pixels
  openRatio: number; // fill area above this multiple of labelAreaM2 flags the room as open
  labelAreaM2?: number; // area printed in the drawing, when known
}

export type RoomDetectionParams = WallFilterParams & RoomFillParams;

export const DEFAULT_ROOM_DETECTION_PARAMS: RoomDetectionParams = {
  minLenMm: 250,
  stubMinMm: 150,
  stubTouchMm: 60,
  maxWallMm: 500,
  minGapMm: 15,
  minOverlapMm: 400,
  partnerMinMm: 800,
  partnerLineMaxMm: 3000,
  angTolDeg: 1.0,
  coverFrac: 0.1,
  hatchPartners: 5,
  hatchMaxLenMm: 600,
  curveChordMm: 500,
  curveAngTolDeg: 12,
  curveOverlapFrac: 0.4,
  furnMaxMm: 1500,
  furnMinMm: 150,
  furnAspect: 3.0,
  furnThickMm: 600,
  furnBigMaxMm: 4500,
  bridgeTouchMm: 80,
  stairMinSteps: 4,
  stairMinPitchMm: 150,
  stairMaxPitchMm: 400,
  stairMinLenMm: 600,
  stairMaxLenMm: 3500,
  stairLenRatio: 0.8,
  stairBox: true,
  stairBoxMaxSpanMm: 3600,
  stairEndTolMm: 60,
  dashMinRun: 3,
  dashMinPieceMm: 20,
  dashEndTolMm: 20,
  dashMaxContacts: 2,
  minCompMm: 1500,
  compFrac: 0.05,
  hatchEvidence: true,
  hatchTickMaxMm: 900,
  hatchMinAngDeg: 20,
  hatchMinDens: 15,
  hatchThinMm: 150,
  hatchExemptLenMm: 3000,
  hatchTouchMm: 80,
  hatchRunAngDeg: 5,
  hatchRejMinW: 0.3,
  hatchBridge: true,
  hatchStyleFrac: 0.35,

  gapMm: 1000,
  pxMm: 33.3,
  seedRadiusMm: 3000,
  roiMm: 50000,
  wallGrowMm: 0,
  fillHoles: true,
  seedClosed: true,
  autoSeed: true,
  squareCorners: true,
  snapToWalls: true,
  snapTolPx: 2,
  snapAngDeg: 3,
  simplifyTolPx: 1.5,
  openRatio: 1.3,
};

// Why the filter rejected a segment (WallFilterResult.reason). 0 means kept.
export const REJECT_REASON = {
  kept: 0,
  shortOrNotLine: 1,
  noPartner: 2,
  hatch: 3,
  stubUntouched: 4,
  unpairedCurve: 5,
  loop: 6,
  stair: 7,
  dash: 8,
  component: 9,
  noHatchEvidence: 10,
} as const;

export interface WallFilterStats {
  kept: number;
  stubsKept: number;
  chords: number;
  chordsPaired: number;
  loopDropped: number;
  loopBridged: number;
  stairDropped: number;
  dashDropped: number;
  compDropped: number;
  compLimMm: number;
  hatchShare?: number; // only with hatchEvidence
  hatchRejected?: number;
}

export interface WallFilterResult {
  keep: Uint8Array; // 1 per kept segment
  reason: Uint8Array; // REJECT_REASON value per segment
  stats: WallFilterStats;
}

// The input segments together with the result of the filter.
export interface FilteredWalls {
  walls: WallCandidateSegments;
  keep: Uint8Array;
}

export interface RoomPolygon {
  outer: Vec2[]; // closed implicitly (last point is not repeated), page points
  holes: Vec2[][];
}

export interface RoomFillFlags {
  touchesRoiBorder: boolean; // the fill reached the edge of the raster area: the room is not closed
  open: boolean; // touchesRoiBorder, or the fill area exceeds openRatio * labelAreaM2
  fillEmpty: boolean; // no free pixel near the seed: no polygon
  enclosing?: boolean; // detect-all only: the region wraps other rooms (outside of a building), its holes were not filled
}

export interface RoomFillResult {
  polygon: RoomPolygon;
  areaM2: number; // exact area of the polygon (shoelace), holes subtracted
  pixelAreaM2: number; // pixel count times pixel area
  seedPt: Vec2; // the seed after the auto seed search, page points
  flags: RoomFillFlags;
}

// Caller-owned cache of the filter result for repeated clicks on one page.
export interface RoomDetectionCache {
  segments?: Float64Array;
  segmentCount?: number;
  mmPerPt?: number;
  paramsKey?: string;
  filtered?: FilteredWalls;
}

// Detect all rooms on a page (detect-all.ts).
export type DetectAllPhase = 'filter' | 'raster' | 'distance' | 'rooms' | 'labels' | 'done';

export interface DetectAllOptions {
  minRoomM2?: number; // rooms with a smaller area are dropped, default 1.5
  maxPixels?: number; // above this raster size the raster gets coarser, default 60 million
  onProgress?: (fraction: number, phase: DetectAllPhase) => void;
  shouldCancel?: () => boolean; // polled between components
}

// A free-space region that is not a room: it touches the page raster edge (the
// outside of the building, or a room with no closed wall that leaks into it),
// or it wraps other rooms (the outside inside a drawing frame).
export interface LeakRegion {
  kind: 'border' | 'enclosing'; // touches the raster edge, or wraps other rooms
  bounds: [number, number, number, number]; // page points
  coreAreaM2: number;
  seedPt: Vec2; // widest point of the region, page points
}

export interface DetectAllResult {
  rooms: RoomFillResult[];
  leaks: LeakRegion[];
  pxMm: number; // raster resolution used (coarser than requested for a very large page)
  componentsDropped: number; // too small or empty
  cancelled: boolean;
}
