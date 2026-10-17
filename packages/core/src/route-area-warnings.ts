import type { Vec2 } from './geometry.js';
import type { RouteArea } from './route-area.js';

export type RouteAreaWarningCode =
  | 'no-calibration' | 'no-rooms' | 'no-types' | 'no-route-rooms'
  | 'open-room' | 'parts' | 'wall-crossings' | 'shaft-crossing' | 'unreached' | 'stair-name' | 'draft-2d';

export interface RouteAreaWarning {
  code: RouteAreaWarningCode;
  severity: 'error' | 'warning' | 'info';
  count?: number;
  roomIds?: string[];
  points?: Vec2[];
}

const SEVERITY_RANK: Record<RouteAreaWarning['severity'], number> = { error: 0, warning: 1, info: 2 };

function copyPoint(p: Vec2): Vec2 {
  return { x: p.x, y: p.y };
}

export function routeAreaWarnings(area: RouteArea): RouteAreaWarning[] {
  if (area.status !== 'ok') {
    const severity: RouteAreaWarning['severity'] = area.status === 'no-calibration' ? 'error' : 'warning';
    return [{ code: area.status, severity }, { code: 'draft-2d', severity: 'info' }];
  }

  const lines: RouteAreaWarning[] = [];

  const openRooms = area.rooms.filter((r) => r.open);
  if (openRooms.length > 0) {
    lines.push({ code: 'open-room', severity: 'warning', count: openRooms.length, roomIds: openRooms.map((r) => r.roomId) });
  }

  if (area.parts > 1) {
    lines.push({ code: 'parts', severity: 'warning', count: area.parts });
  }

  const wallEntries = area.entries.filter((e) => e.primary && !e.shaft);
  const wallLinks = area.links.filter((l) => !l.shaft);
  const wallCount = wallEntries.length + wallLinks.length;
  if (wallCount > 0) {
    lines.push({
      code: 'wall-crossings',
      severity: 'warning',
      count: wallCount,
      points: [...wallEntries.map((e) => copyPoint(e.point)), ...wallLinks.map((l) => copyPoint(l.point))],
    });
  }

  for (const room of area.rooms) {
    if (room.kind !== 'shaft') continue;
    const shaftEntries = area.entries.filter((e) => e.primary && e.shaft && e.areaRoomId === room.roomId);
    const shaftLinks = area.links.filter((l) => l.shaft && l.roomIds.includes(room.roomId));
    const count = shaftEntries.length + shaftLinks.length;
    if (count > 0) {
      lines.push({
        code: 'shaft-crossing',
        severity: 'warning',
        roomIds: [room.roomId],
        count,
        points: [...shaftEntries.map((e) => copyPoint(e.point)), ...shaftLinks.map((l) => copyPoint(l.point))],
      });
    }
  }

  if (area.unreached.length > 0) {
    lines.push({ code: 'unreached', severity: 'info', count: area.unreached.length, roomIds: area.unreached.map((u) => u.roomId) });
  }

  const stairRooms = area.rooms.filter((r) => r.name !== null && r.name.toLowerCase().includes('trap'));
  if (stairRooms.length > 0) {
    lines.push({ code: 'stair-name', severity: 'info', count: stairRooms.length, roomIds: stairRooms.map((r) => r.roomId) });
  }

  lines.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  lines.push({ code: 'draft-2d', severity: 'info' });
  return lines;
}
