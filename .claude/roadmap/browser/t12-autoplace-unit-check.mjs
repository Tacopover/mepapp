// T12 check: autoPlaceStamps writes the capacity in the flow unit of the routing-target type (scene API on a hand-built plan).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/THIS.mjs
import { open } from './r5-lib.mjs';

const PDF = '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf';
const t = await open();
const { page, check, idle } = t;
await t.start();
await t.openPdf(PDF);

const run = (typeUnit, capacity, capacityUnit, targetType = 'supply-air') =>
  page.evaluate(
    async ([typeUnit, capacity, capacityUnit, targetType]) => {
      const sc = window.__mepSketchScene;
      sc.adoptNetworkTypes([targetType]);
      if (typeUnit) sc.updateNetworkType(targetType, { flowUnit: typeUnit });
      else sc.updateNetworkType(targetType, { flowUnit: undefined });
      const canvas = new OffscreenCanvas(60, 60);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(10, 10, 40, 40);
      const bitmap = await createImageBitmap(canvas);
      const definition = { id: 'custom-t12', label: 'T12', discipline: 'ventilation', category: 'terminal', nativeWidth: 14, nativeHeight: 14, ports: [{ id: 'in', name: 'in', fractionX: 0, fractionY: 0.5 }], iconRef: 'data:image/png;base64,AAAA', source: 'custom' };
      const stamp = { position: { x: 200, y: 200 }, rotationDegrees: 0, ruleId: 'r', roomId: 'room', capacity, ...(capacityUnit ? { capacityUnit } : {}), routingTargets: { in: targetType } };
      const ids = sc.autoPlaceStamps([{ definition, bitmap, stamps: [stamp] }]);
      const p = sc.exportProject();
      return ids.map((id) => p.terminalCapacities[id]);
    },
    [typeUnit, capacity, capacityUnit, targetType],
  );

const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-9;
let r = await run('m³/h', 10, 'dm³/s');
check(near(r[0], 36), 'type m³/h, rule dm³/s: 10 is stored as 36', JSON.stringify(r));
r = await run('dm³/s', 10, 'dm³/s');
check(near(r[0], 10), 'same unit: number unchanged', JSON.stringify(r));
r = await run('dm³/s', 2500, 'W');
check(near(r[0], 2500), 'power rule on a volume type: number unchanged', JSON.stringify(r));
r = await run(undefined, 10, 'dm³/s');
check(near(r[0], 10), 'type without flowUnit: number unchanged', JSON.stringify(r));
r = await run('l/s', 10, undefined);
check(near(r[0], 10), 'no capacityUnit on the plan: number unchanged', JSON.stringify(r));

const notesNow = () => page.evaluate(() => window.__mepSketchScene.getAutoPlaceUnitNotes());
// Several routing targets (two ports, two types).
const runTwo = (unitA, unitB) =>
  page.evaluate(
    async ([unitA, unitB]) => {
      const sc = window.__mepSketchScene;
      sc.adoptNetworkTypes(['supply-air', 'return-air']);
      sc.updateNetworkType('supply-air', { flowUnit: unitA });
      sc.updateNetworkType('return-air', { flowUnit: unitB });
      const canvas = new OffscreenCanvas(60, 60);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(10, 10, 40, 40);
      const bitmap = await createImageBitmap(canvas);
      const definition = { id: 'custom-t12b', label: 'T12b', discipline: 'ventilation', category: 'terminal', nativeWidth: 14, nativeHeight: 14, ports: [{ id: 'in', name: 'in', fractionX: 0, fractionY: 0.5 }, { id: 'out', name: 'out', fractionX: 1, fractionY: 0.5 }], iconRef: 'data:image/png;base64,AAAA', source: 'custom' };
      const stamp = { position: { x: 300, y: 300 }, rotationDegrees: 0, ruleId: 'r', roomId: 'room', capacity: 36, capacityUnit: 'm³/h', routingTargets: { in: 'supply-air', out: 'return-air' } };
      const ids = sc.autoPlaceStamps([{ definition, bitmap, stamps: [stamp] }]);
      return { cap: ids.map((id) => sc.exportProject().terminalCapacities[id]), notes: sc.getAutoPlaceUnitNotes() };
    },
    [unitA, unitB],
  );
await run('dm³/s', 10, 'dm³/s');
let notes = await notesNow();
check(notes.length === 0, 'one target with a unit: no note', JSON.stringify(notes));
await run(undefined, 10, 'dm³/s');
notes = await notesNow();
check(notes.length === 1 && notes[0].reason === 'noTargetUnit', 'target without a unit: note noTargetUnit', JSON.stringify(notes));
let two = await runTwo('dm³/s', 'l/min');
check(near(two.cap[0], 36) && two.notes.length === 1 && two.notes[0].reason === 'targetUnitsDiffer', 'two targets with different units: 36 kept, note targetUnitsDiffer', JSON.stringify(two));
two = await runTwo('dm³/s', 'dm³/s');
check(Math.abs(two.cap[0] - 10) < 1e-9 && two.notes.length === 0, 'two targets with one unit: converted, no note', JSON.stringify(two));
two = await runTwo(undefined, 'dm³/s');
check(Math.abs(two.cap[0] - 10) < 1e-9 && two.notes.length === 0, 'one of two targets has a unit: converted, no note', JSON.stringify(two));
two = await runTwo(undefined, undefined);
check(near(two.cap[0], 36) && two.notes[0]?.reason === 'noTargetUnit', 'no target has a unit: 36 kept, note noTargetUnit', JSON.stringify(two));
t.finish();
