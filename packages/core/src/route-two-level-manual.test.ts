import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Vec2 } from './geometry.js';
import { polylinesOfPlan, shapeMetrics, type ShapeMetrics } from './route-shape-metrics.js';
import { manualScenario, runScenario, type Scenario, type ScenarioRun } from './route-scenario.testutil.js';
import { getStampWorldPorts } from './stamp.js';

const FLAG = fileURLToPath(new URL('../../../.claude/roadmap/tools/p2/assert.flag', import.meta.url));

/** The distance in mm from the point p to the straight piece a-b. */
function distanceToPiece(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

/**
 * The terminal of each target port, in mm. The terminal is the stamp centre (`transform.position`) when the port lies more than
 * 10 page points from every polyline of the route. Otherwise the terminal is the port point. The distances use the polylines of this route only.
 */
function terminalsFor(s: Scenario, polylinesMm: readonly (readonly Vec2[])[]): { id: string; point: Vec2; roomId: string | null }[] {
  const { mmPerPt } = s.drawing;
  return s.targetPorts.map((p) => {
    const port = { x: p.world.x * mmPerPt, y: p.world.y * mmPerPt };
    let nearest = Infinity;
    for (const line of polylinesMm) {
      if (line.length === 1) nearest = Math.min(nearest, Math.hypot(line[0]!.x - port.x, line[0]!.y - port.y));
      for (let i = 0; i + 1 < line.length; i++) nearest = Math.min(nearest, distanceToPiece(port, line[i]!, line[i + 1]!));
    }
    const stamp = s.stamps.find((st) => st.id === p.stampId);
    if (!stamp) throw new Error(`manual fixture: no stamp ${p.stampId} for a target port`);
    const centre = { x: stamp.transform.position.x * mmPerPt, y: stamp.transform.position.y * mmPerPt };
    return { id: `${p.stampId}:${p.portId}`, point: nearest > 10 * mmPerPt ? centre : port, roomId: p.roomId };
  });
}

function measure(s: Scenario, polylinesMm: readonly (readonly Vec2[])[], startMm: Vec2, snapMm?: number): ShapeMetrics {
  return shapeMetrics({
    polylines: polylinesMm,
    terminalsMm: terminalsFor(s, polylinesMm),
    startMm,
    rooms: s.drawing.rooms,
    area: s.area,
    mmPerPt: s.drawing.mmPerPt,
    pageIndex: s.pageIndex,
    ...(snapMm === undefined ? {} : { snapMm }),
  });
}

interface Gate { hand: ShapeMetrics; auto: ShapeMetrics; autoRun: ScenarioRun }
let gate: Gate | null = null;

describe('P2 gate M0: shape of the hand route on the manual fixture', () => {
  beforeAll(() => {
    const fixture = manualScenario();
    if (fixture === null) {
      if (existsSync(FLAG)) throw new Error('manual fixture missing: run extract-manual.mjs');
      return;
    }
    const { scenario: s, manual } = fixture;
    const { mmPerPt } = s.drawing;
    const startWorld = s.stamps.find((st) => st.id === s.startStampId);
    const startPort = startWorld ? getStampWorldPorts(startWorld).find((p) => p.id === s.startPortId)?.world : undefined;
    if (!startPort) throw new Error('manual fixture: no start port');
    const startMm = { x: startPort.x * mmPerPt, y: startPort.y * mmPerPt };
    const handMm = [...manual.main, ...manual.room].map((stroke) => stroke.map((p) => ({ x: p.x * mmPerPt, y: p.y * mmPerPt })));
    const autoRun = runScenario(s);
    gate = {
      hand: measure(s, handMm, startMm, 4 * mmPerPt),
      auto: measure(s, polylinesOfPlan(autoRun.plan, mmPerPt), startMm),
      autoRun,
    };
  });

  it('bends: 12 bends, all of them 90 degrees, none of 45 degrees', () => {
    if (gate === null) return;
    const { hand } = gate;
    expect(hand.bends).toBe(12);
    expect(hand.bends90).toBe(12);
    expect(hand.bends45).toBe(0);
  });

  it('bends by place: 6 at served rooms, 5 in corridors, 1 other', () => {
    if (gate === null) return;
    const { hand } = gate;
    expect(hand.bendsServedRooms).toBe(6);
    expect(hand.bendsCorridors).toBe(5);
    expect(hand.bendsOther).toBe(1);
  });

  it('length: within 5 percent of 234000 mm', () => {
    if (gate === null) return;
    const { hand } = gate;
    expect(Math.abs(hand.lengthMm - 234000) / 234000).toBeLessThanOrEqual(0.05);
  });

  it('straight pieces: 7 pieces of 5 m or more, longest within 5 percent of 28200 mm', () => {
    if (gate === null) return;
    const { hand } = gate;
    expect(hand.straightPieces5m).toBe(7);
    expect(Math.abs(hand.longestStraightMm - 28200) / 28200).toBeLessThanOrEqual(0.05);
  });

  it('bends to terminal: mean within 0.1 of 4.0', () => {
    if (gate === null) return;
    const { hand } = gate;
    expect(Math.abs(hand.meanBendsToTerminal - 4.0)).toBeLessThanOrEqual(0.1);
  });

  it('bends to terminal: maximum of 5', () => {
    if (gate === null) return;
    const { hand } = gate;
    expect(hand.maxBendsToTerminal).toBe(5);
  });

  it('rooms: 2 multi-entry rooms, 0 chained rooms', () => {
    if (gate === null) return;
    const { hand } = gate;
    expect(hand.multiEntryRooms).toBe(2);
    expect(hand.chainedRooms).toBe(0);
  });

  it('single-terminal straight: 12 of 12 rooms', () => {
    if (gate === null) return;
    const { hand } = gate;
    expect(hand.singleTerminalStraight).toEqual({ rooms: 12, straight: 12 });
  });

  it('prints the hand route and the old auto plan, and the old auto plan runs', () => {
    if (gate === null) return;
    const { hand, auto, autoRun } = gate;
    const rows: [string, (m: ShapeMetrics) => string][] = [
      ['lengthMm (m)', (m) => (m.lengthMm / 1000).toFixed(1)],
      ['bends', (m) => String(m.bends)],
      ['bends90', (m) => String(m.bends90)],
      ['bends45', (m) => String(m.bends45)],
      ['bendsServedRooms', (m) => String(m.bendsServedRooms)],
      ['bendsCorridors', (m) => String(m.bendsCorridors)],
      ['bendsOther', (m) => String(m.bendsOther)],
      ['tees', (m) => String(m.tees)],
      ['crosses', (m) => String(m.crosses)],
      ['straightPieces5m', (m) => String(m.straightPieces5m)],
      ['longestStraightMm (m)', (m) => (m.longestStraightMm / 1000).toFixed(1)],
      ['meanBendsToTerminal', (m) => m.meanBendsToTerminal.toFixed(2)],
      ['maxBendsToTerminal', (m) => String(m.maxBendsToTerminal)],
      ['pathToManhattan', (m) => m.pathToManhattan.toFixed(3)],
      ['multiEntryRooms', (m) => String(m.multiEntryRooms)],
      ['chainedRooms', (m) => String(m.chainedRooms)],
      ['singleTerminalStraight (straight/rooms)', (m) => `${m.singleTerminalStraight.straight}/${m.singleTerminalStraight.rooms}`],
      ['teeOffsetMm max', (m) => m.teeOffsetMm.max.toFixed(1)],
      ['teeOffsetMm median', (m) => m.teeOffsetMm.median.toFixed(1)],
      ['longestPathFromStartMm (m)', (m) => (m.longestPathFromStartMm / 1000).toFixed(1)],
      ['branchLengthP90Mm (m)', (m) => (m.branchLengthP90Mm / 1000).toFixed(1)],
      ['portsWithManyEnds', (m) => String(m.portsWithManyEnds)],
    ];
    const handCol = rows.map(([, format]) => format(hand));
    const autoCol = rows.map(([, format]) => format(auto));
    const wField = Math.max('field'.length, ...rows.map(([name]) => name.length));
    const wHand = Math.max('hand route'.length, ...handCol.map((v) => v.length));
    const wAuto = Math.max('old auto plan'.length, ...autoCol.map((v) => v.length));
    const lines = [
      `${'field'.padEnd(wField)}  ${'hand route'.padStart(wHand)}  ${'old auto plan'.padStart(wAuto)}`,
      ...rows.map(([name], i) => `${name.padEnd(wField)}  ${handCol[i]!.padStart(wHand)}  ${autoCol[i]!.padStart(wAuto)}`),
    ];
    console.log(['P2 gate M0: shape metrics (the auto numbers of the analysis, 89 bends and 278.4 m, came from the project JSON of the route PDF, so a fresh default run may differ)', ...lines].join('\n'));
    expect(autoRun.status).toBe('ok');
  });
});
