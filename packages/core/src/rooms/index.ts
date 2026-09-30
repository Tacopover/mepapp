// Room detection from vector PDF floor plans. Headless: no rendering, no I/O.
export * from './types.js';
export { filterWallSegments } from './filter.js';
export { fillRoomAt } from './fill.js';
export { detectRoomAt, detectAllRoomsOnPage } from './detect.js';
export { detectAllRooms } from './detect-all.js';
export { signedRingArea, pointInRing } from './polygon.js';
export * from './worker.js';
export * from './room.js';
export * from './labels.js';
