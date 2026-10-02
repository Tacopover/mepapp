import { Container, Graphics, Text } from 'pixi.js';
import { roomAreaM2, roomAreaWarning, roomBounds, roomLabelPoint, type Calibration, type Room, type Vec2, type VertexRef } from '@mepapp/core';

const ROOM_COLOR = 0x2e7d32;
const REVIEW_COLOR = 0xef6c00; // open room, or an area far from the printed one
const MIN_FONT_PT = 6;
const MAX_FONT_PT = 14;

const flat = (ring: readonly Vec2[]): number[] => ring.flatMap((p) => [p.x, p.y]);

/** Redraws the room overlay of one page into `layer`: a tinted polygon with holes cut out, an outline, and a number / name / area label. Rooms that need review are orange. */
export function drawRooms(layer: Container, rooms: readonly Room[], calibration: Calibration | null, selected: ReadonlySet<string> = new Set(), handleRadiusPt = 0, selectedVertices: readonly VertexRef[] = [], textResolution = 1): void {
  for (const child of layer.removeChildren()) child.destroy();
  if (rooms.length === 0) return;
  const shapes = new Graphics();
  layer.addChild(shapes);
  for (const room of rooms) {
    const review = room.open || (calibration !== null && roomAreaWarning(room, calibration) !== null);
    const color = review ? REVIEW_COLOR : ROOM_COLOR;
    const isSelected = selected.has(room.id);
    shapes.poly(flat(room.polygon.outer)).fill({ color, alpha: isSelected ? 0.32 : 0.14 });
    for (const hole of room.polygon.holes) shapes.poly(flat(hole)).cut();
    shapes.poly(flat(room.polygon.outer)).stroke({ width: isSelected ? 3 : 1.2, color: isSelected ? 0x1565c0 : color, alpha: 0.95 });
    for (const hole of room.polygon.holes) shapes.poly(flat(hole)).stroke({ width: 1, color, alpha: 0.6 });

    // A single selected room shows its vertices as handles (edit-room tool).
    if (isSelected && selected.size === 1 && handleRadiusPt > 0) {
      // Selected vertices: larger, solid orange squares with a dark outline.
      const picked = new Set(selectedVertices.map((r) => `${r.ring}:${r.index}`));
      [room.polygon.outer, ...room.polygon.holes].forEach((ring, r) => {
        ring.forEach((v, i) => {
          if (picked.has(`${r}:${i}`)) return;
          shapes.rect(v.x - handleRadiusPt, v.y - handleRadiusPt, 2 * handleRadiusPt, 2 * handleRadiusPt).fill({ color: 0xffffff }).stroke({ width: handleRadiusPt / 4, color: 0x1565c0 });
        });
      });
      [room.polygon.outer, ...room.polygon.holes].forEach((ring, r) => {
        ring.forEach((v, i) => {
          if (!picked.has(`${r}:${i}`)) return;
          const h = handleRadiusPt * 1.4;
          shapes.rect(v.x - h, v.y - h, 2 * h, 2 * h).fill({ color: 0xff6d00 }).stroke({ width: handleRadiusPt / 3, color: 0x212121 });
        });
      });
    }

    const lines = [room.number ?? '', room.name ?? ''];
    if (calibration) lines.push(`${roomAreaM2(room, calibration).toFixed(1)} m²`);
    const text = lines.filter((l) => l !== '').join('\n');
    if (text === '') continue;
    const b = roomBounds(room);
    const fontSize = Math.min(MAX_FONT_PT, Math.max(MIN_FONT_PT, Math.sqrt((b.maxX - b.minX) * (b.maxY - b.minY)) / 10));
    const label = new Text({ text, style: { fontSize, fill: color, align: 'center' }, resolution: textResolution });
    label.anchor.set(0.5);
    const p = roomLabelPoint(room);
    label.position.set(p.x, p.y);
    layer.addChild(label);
  }
}
