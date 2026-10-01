// Room detection from vector PDF floor plans. Headless: no rendering, no I/O.
export * from './types.js';
export { filterWallSegments } from './filter.js';
export { fillRoomAt } from './fill.js';
export { detectRoomAt, detectRoomAtWithLabels, type ClickFillResult, detectAllRoomsOnPage, detectLabelledRoomsOnPage } from './detect.js';
export { detectAllRooms } from './detect-all.js';
export { signedRingArea, pointInRing } from './polygon.js';
export * from './worker.js';
export * from './room.js';
export * from './labels.js';
export * from './edit.js';
export { resolveRoomAt, wallComponents, type ResolveOptions, type ResolveResult, type ResolveMethod } from './resolve.js';
export { polygonUnion, polygonDifference, polygonIntersection, overlapAreaPt2, rectPolygon } from './clip.js';
export { splitRectangular, type RectSplitTarget } from './rect-split.js';
export { roomConfidence, roomPriority, resolveRoomOverlaps, planRoomOverlaps, type OverlapItem, type OverlapOptions, type OverlapResult, type RoomOverlapPlan } from './overlap.js';
export { snapOutlineToWalls, type OutlineSnapOptions } from './outline-snap.js';
export { orthogonalizeOutline, type OrthoOptions } from './ortho.js';
export { detectLabelledRooms, type LabelTarget, type LabelledRoom, type LabelledResult, type LabelledOptions, type LabelledMethod } from './labelled.js';
export * from './export.js';
