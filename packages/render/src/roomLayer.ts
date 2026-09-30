import { Container, Graphics, Text } from 'pixi.js';
import { roomAreaM2, roomAreaWarning, roomBounds, roomLabelPoint, type Calibration, type Room, type Vec2 } from '@mepapp/core';

const ROOM_COLOR = 0x2e7d32;
const REVIEW_COLOR = 0xef6c00; // open room, or an area far from the printed one
const MIN_FONT_PT = 6;
const MAX_FONT_PT = 14;

const flat = (ring: readonly Vec2[]): number[] => ring.flatMap((p) => [p.x, p.y]);

/** Redraws the room overlay of one page into `layer`: a tinted polygon with holes cut out, an outline, and a number / name / area label. Rooms that need review are orange. */
export function drawRooms(layer: Container, rooms: readonly Room[], calibration: Calibration | null): void {
  for (const child of layer.removeChildren()) child.destroy();
  if (rooms.length === 0) return;
  const shapes = new Graphics();
  layer.addChild(shapes);
  for (const room of rooms) {
    const review = room.open || (calibration !== null && roomAreaWarning(room, calibration) !== null);
    const color = review ? REVIEW_COLOR : ROOM_COLOR;
    shapes.poly(flat(room.polygon.outer)).fill({ color, alpha: 0.14 });
    for (const hole of room.polygon.holes) shapes.poly(flat(hole)).cut();
    shapes.poly(flat(room.polygon.outer)).stroke({ width: 1.2, color, alpha: 0.9 });
    for (const hole of room.polygon.holes) shapes.poly(flat(hole)).stroke({ width: 1, color, alpha: 0.6 });

    const lines = [[room.number, room.name].filter(Boolean).join(' ')];
    if (calibration) lines.push(`${roomAreaM2(room, calibration).toFixed(1)} m²`);
    const text = lines.filter((l) => l !== '').join('\n');
    if (text === '') continue;
    const b = roomBounds(room);
    const fontSize = Math.min(MAX_FONT_PT, Math.max(MIN_FONT_PT, Math.sqrt((b.maxX - b.minX) * (b.maxY - b.minY)) / 10));
    const label = new Text({ text, style: { fontSize, fill: color, align: 'center' } });
    label.anchor.set(0.5);
    const p = roomLabelPoint(room);
    label.position.set(p.x, p.y);
    layer.addChild(label);
  }
}
