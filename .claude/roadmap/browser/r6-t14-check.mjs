// R6 T14 check: the R6 browser helpers build a routing project and a routed sample.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r6-t14-check.mjs
import { open, setupRooms, buildRoutingProject, buildRoutedSample, markedIds, legAngles, reachFromStart } from './r6-lib.mjs';

const t = await open();
const { page, check, shot, finish } = t;
try {
  const { rooms, corridorIds } = await setupRooms(t, { pdf: '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf', scale: '50' });
  console.log(`rooms ${rooms.length}, corridors ${corridorIds.length}`);
  const b = await buildRoutingProject(t, { targets: 3 });

  const view = await page.evaluate(
    ([b]) => {
      const s = window.__mepSketchScene;
      const p = s.exportProject();
      const inside = (pt, ring) => {
        let c = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i];
          const q = ring[j];
          if (a.y > pt.y !== q.y > pt.y && pt.x < ((q.x - a.x) * (pt.y - a.y)) / (q.y - a.y) + a.x) c = !c;
        }
        return c;
      };
      const portPoint = (st) => {
        const port = st.ports[0];
        const sx = st.transform.scale?.x ?? 1;
        const sy = st.transform.scale?.y ?? 1;
        return { x: st.transform.position.x + port.fractionX * st.nativeWidth * sx, y: st.transform.position.y + port.fractionY * st.nativeHeight * sy };
      };
      const roomsNow = s.listRooms();
      const ring = (id) => roomsNow.find((r) => r.id === id).polygon.outer;
      const eq = p.stamps.find((x) => x.id === b.equipmentId);
      const terms = b.terminalIds.map((id) => p.stamps.find((x) => x.id === id));
      return {
        hasEquipment: !!eq && eq.category === 'equipment',
        terminalCount: terms.filter((x) => x && x.category === 'terminal').length,
        targetsOk: terms.every((x) => x.routingTargets && x.routingTargets.in === 'supply-air'),
        equipmentInCorridor: inside(portPoint(eq), ring(b.corridorId)),
        terminalsInRooms: terms.map((x, i) => inside(portPoint(x), ring(b.roomIds[i]))),
        hasType: p.networkTypes.some((n) => n.id === 'supply-air'),
        segmentCount: p.segments.length,
        schemaVersion: p.schemaVersion,
      };
    },
    [b],
  );
  check(view.hasEquipment, 'equipment stamp exists');
  check(view.terminalCount === 3, '3 terminal stamps', String(view.terminalCount));
  check(view.targetsOk, 'each terminal has routingTargets.in supply-air');
  check(view.equipmentInCorridor, 'equipment port lies in the corridor');
  check(view.terminalsInRooms.length === 3 && view.terminalsInRooms.every(Boolean), 'each terminal port lies in its room', JSON.stringify(view.terminalsInRooms));
  check(view.hasType, 'networkTypes has supply-air');
  check(view.segmentCount === 0, 'no segments', String(view.segmentCount));
  check(view.schemaVersion === 21, 'schemaVersion 21', String(view.schemaVersion));
  console.log(`project: equipment 1, terminals ${view.terminalCount}, segments ${view.segmentCount}, rooms served ${b.roomIds.length}`);

  const r = await buildRoutedSample(t);
  const marks = await markedIds(page);
  check(marks.segments.length === 4 && marks.fittings.length === 2, 'sample: 4 segments and 2 fittings marked', JSON.stringify(marks));
  const legs = await legAngles(page);
  console.log('legs ' + legs.map((l) => `${l.id}:${l.cls}`).join(' '));
  check(legs.filter((l) => l.id === 'r-s1' || l.id === 'r-s2').every((l) => l.cls !== 'free'), 'sample: r-s1 and r-s2 are not free legs');
  const reach = await reachFromStart(page, r.equipmentId, 'out');
  const want = r.terminalIds.map((id) => `port:${id}:in`).sort();
  check(JSON.stringify(reach) === JSON.stringify(want), 'sample: both terminal ports reachable from the start', JSON.stringify(reach));
  console.log(`sample: segments ${marks.segments.length}, fittings ${marks.fittings.length}, reach ${reach.length}`);
  await shot('t14-routing-project');
} catch (e) {
  check(false, 'check ran to the end', String(e && e.stack ? e.stack : e));
}
await finish();
