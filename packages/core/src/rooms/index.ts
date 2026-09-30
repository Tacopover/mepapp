// Room detection from vector PDF floor plans. Headless: no rendering, no I/O.
export * from './types.js';
export { filterWallSegments } from './filter.js';
export { fillRoomAt } from './fill.js';
export { detectRoomAt, detectAllRoomsOnPage, detectLabelledRoomsOnPage } from './detect.js';
export { detectAllRooms } from './detect-all.js';
export { signedRingArea, pointInRing } from './polygon.js';
export * from './worker.js';
export * from './room.js';
export * from './labels.js';
export * from './edit.js';
export { resolveRoomAt, wallComponents, type ResolveOptions, type ResolveResult, type ResolveMethod } from './resolve.js';
export { snapOutlineToWalls, type OutlineSnapOptions } from './outline-snap.js';
export { detectLabelledRooms, type LabelTarget, type LabelledRoom, type LabelledResult, type LabelledOptions, type LabelledMethod } from './labelled.js';
