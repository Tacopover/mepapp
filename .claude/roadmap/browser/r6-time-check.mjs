// R6 timing: scene.planRoute on the first floor with many served rooms.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r6-time-check.mjs
import { open, setupRooms, buildRoutingProject } from './r6-lib.mjs';

const t = await open();
const { page, check, finish } = t;
try {
  await setupRooms(t, { pdf: '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf', scale: '50' });
  for (const targets of [6, 15, 25]) {
    let b;
    try {
      b = await buildRoutingProject(t, { targets });
    } catch (e) {
      console.log(`targets ${targets}: ${e.message}`);
      continue;
    }
    const runs = [];
    let last = null;
    for (let i = 0; i < 3; i++) {
      const r = await page.evaluate((ids) => {
        const s = window.__mepSketchScene;
        const from = performance.now();
        const v = s.planRoute({ startStampId: 'ahu', startPortId: 'out', networkTypeId: 'supply-air', scope: { kind: 'stamps', stampIds: new Set(ids) }, includeOutsideRooms: true, portsPerStamp: 'one' });
        return { ms: performance.now() - from, status: v.status, stats: v.plan.stats };
      }, b.terminalIds);
      runs.push(Math.round(r.ms));
      last = r;
    }
    console.log(`targets ${targets}: ${runs.join(' ms, ')} ms; status ${last.status}; segments ${last.stats.segments}, ports ${last.stats.ports}, left ${last.stats.portsLeft}`);
    check(last.status === 'ok', `targets ${targets}: plan ok`);
  }
} catch (e) {
  check(false, 'check ran to the end', String(e && e.stack ? e.stack : e));
}
await finish();
