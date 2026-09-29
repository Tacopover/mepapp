// Room detection from vector PDF floor plans. Headless: no rendering, no I/O.
export * from './types.js';
export { filterWallSegments } from './filter.js';
export { fillRoomAt } from './fill.js';
export { detectRoomAt } from './detect.js';
export { signedRingArea, pointInRing } from './polygon.js';
