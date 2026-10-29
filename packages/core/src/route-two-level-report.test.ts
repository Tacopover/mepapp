// Gate G-P2 report (P2-T12). The default run prints the tables and the criteria and asserts only that the plans are ok.
// The criteria are asserted in route-two-level-assert.test.ts (flag file).
import { describe, expect, it } from 'vitest';
import { buildGate } from './route-two-level-gate-load.testutil.js';
import { causeOf, evaluate, marginLines, teeRows, type Side } from './route-two-level-gate.testutil.js';

const TEST_TIMEOUT = 600000;

function table(header: string[], body: string[][]): string[] {
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i]!.length)));
  const line = (cells: readonly string[]): string => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join('  ');
  return [line(header), ...body.map(line)];
}

function row(side: Side): string[] {
  const m = side.shape;
  return [
    side.label,
    (m.lengthMm / 1000).toFixed(1),
    String(m.bends), String(m.bends90), String(m.bends45),
    String(m.bendsServedRooms), String(m.bendsCorridors), String(m.bendsOther),
    String(m.tees), String(m.crosses), String(m.straightPieces5m), (m.longestStraightMm / 1000).toFixed(1),
    m.meanBendsToTerminal.toFixed(2), String(m.maxBendsToTerminal), m.pathToManhattan.toFixed(3),
    String(m.multiEntryRooms), String(m.chainedRooms),
    `${m.singleTerminalStraight.straight}/${m.singleTerminalStraight.rooms}`,
    m.teeOffsetMm.max.toFixed(0), m.teeOffsetMm.median.toFixed(0),
    (m.longestPathFromStartMm / 1000).toFixed(1), (m.branchLengthP90Mm / 1000).toFixed(1),
    String(m.portsWithManyEnds),
    String(side.old ? side.old.bendsOutside : side.shape.bendsOther), side.run ? String(side.portsLeft) : 'n/a', String(side.wallCrossings),
  ];
}

const HEADER = ['plan', 'len m', 'bends', 'b90', 'b45', 'bServed', 'bCorr', 'bOther', 'tees', 'crosses', 'str5m', 'longStr m', 'meanB', 'maxB', 'p/Manh', 'multiEntry', 'chained', 'singleStr', 'teeMax', 'teeMed', 'longPath m', 'brP90 m', 'manyEnds', 'bendsOutside', 'portsLeft', 'wallCross'];

describe('route two-level report (gate G-P2, P2-T12)', () => {
  it('measures the four plans, prints the tables and the criteria', () => {
    const input = buildGate();
    if (input === null) {
      console.log('SKIP: manual fixture missing');
      return;
    }
    const { m, others } = input;
    for (const side of [m.balanced, m.branches, m.twoLevel]) expect(side.run!.status, `manual ${side.label}`).toBe('ok');
    for (const c of others) {
      expect(c.balanced.run!.status, `${c.drawing} ${c.kind} Balanced`).toBe('ok');
      expect(c.twoLevel.run!.status, `${c.drawing} ${c.kind} twoLevel`).toBe('ok');
    }
    const lines: string[] = ['P2 gate: four plans on the manual scenario', ...table(HEADER, [m.balanced, m.branches, m.twoLevel, m.hand].map(row))];

    lines.push('', 'Old route metrics (routeMetrics) of the plans: chained / multiEntry / bendsOutside / portsLeft / wallCrossings');
    for (const side of [m.balanced, m.branches, m.twoLevel]) {
      const o = side.old!;
      lines.push(`${side.label}: ${o.chainedRooms} / ${o.multiEntryRooms} / ${o.bendsOutside} / ${o.portsLeft} / ${o.wallCrossings}`);
    }

    const rows = teeRows(m.twoLevel, m.hand);
    lines.push('', `Tee points of twoLevel against the hand route (${rows.length} rooms with a branch in both; same main line ${rows.filter((r) => r.sameLine).length}):`);
    lines.push(...table(['room', 'along mm', 'perp mm', 'same line'], rows.map((r) => [r.roomId, r.alongMm.toFixed(0), r.perpMm.toFixed(0), r.sameLine ? 'yes' : 'no'])));
    const sameAlong = rows.filter((r) => r.sameLine).map((r) => r.alongMm).sort((a, b) => a - b);
    lines.push(`same-line tee distance: median ${sameAlong[Math.floor(sameAlong.length / 2)]?.toFixed(0) ?? 'n/a'} mm, max ${sameAlong[sameAlong.length - 1]?.toFixed(0) ?? 'n/a'} mm`);
    lines.push(`Aim (not asserted): tees on the same main line as the hand route ${rows.filter((r) => r.sameLine).length}/${rows.length}; total bends ${m.twoLevel.shape.bends} (aim <= 16)`);

    const results = evaluate(input);
    lines.push('', 'Criteria (twoLevel on the manual scenario):');
    for (const r of results) {
      const status = r.pass === null ? 'INFO' : r.pass ? 'PASS' : 'FAIL';
      lines.push(`${status} ${r.id} ${r.text}: measured ${r.measured}; threshold ${r.threshold}`);
      if (r.pass === false) for (const id of r.rooms) lines.push(`    ${causeOf(m.twoLevel, id)}`);
    }

    lines.push('', 'Other drawings (twoLevel, Balanced in brackets):', ...marginLines(others));
    if (input.skipped.length > 0) lines.push(...input.skipped.map((s) => `SKIP ${s}`));

    const t = m.twoLevel;
    lines.push('', `twoLevel warnings: ${[...t.warnings.entries()].map(([code, ids]) => `${code}[${ids.join(',')}]`).join('; ')}`);
    lines.push(`multi-entry rooms (metric): ${t.shape.multiEntryRoomIds.map((id) => `${id} (${t.shape.multiEntryPointsMm[id]!.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' | ')}) [${causeOf(t, id)}]`).join('\n  ')}`);
    lines.push(`chained rooms (metric): ${t.shape.chainedRoomIds.map((id) => `${id} via ${t.shape.chainedVia[id]}`).join(', ')}`);
    lines.push(`rooms with bends: ${Object.entries(t.shape.bendPlaces).map(([id, n]) => `${id}:${n}`).join(', ')}`);
    lines.push(`smallest hole distance: hand ${Math.min(...m.hand.holes.map((h) => h.cornerMm)).toFixed(0)} mm; holes under 200 mm in twoLevel: ${t.holes.filter((h) => h.cornerMm < 200).map((h) => `${h.fromRoomId}->${h.toRoomId} ${h.cornerMm.toFixed(0)}`).join(', ') || 'none'}`);
    console.log(lines.join('\n'));
  }, TEST_TIMEOUT);
});
