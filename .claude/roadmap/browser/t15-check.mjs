// T15: the list of route-area room types goes from localStorage to the scene state (wiring check, seeds through open({seed})).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t15-check.mjs
import { open, setupRooms } from './r4-lib.mjs';

const FIXTURES = '/root/MepApp/fixtures/pdfs/';
const PDF1 = FIXTURES + '01_arch_first_floor.pdf';
const KEY = 'mepapp.routeRoomTypes.v1';
let worst = 0;

async function run(label, seed, body) {
  console.log(`--- ${label}`);
  const t = await open({ seed });
  const { page, check } = t;
  const setup = await setupRooms(t, { pdf: PDF1, scale: '50', shaft: true });
  check(setup.shaftId !== null, `${label}: setup has a shaft room`, String(setup.shaftId));
  const types = await page.evaluate(() => window.__mepSketchScene.getRouteAreaRoomTypes());
  const view = await page.evaluate(() => JSON.parse(JSON.stringify(window.__mepSketchScene.getRouteArea())));
  const stored = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await body({ check, setup, types, view, stored });
  await t.finish();
  worst = Math.max(worst, process.exitCode ?? 0);
}

await run('run 1: seed ["corridor"]', { [KEY]: '["corridor"]' }, ({ check, setup, types, view, stored }) => {
  check(JSON.stringify(types) === '["corridor"]', 'scene list is ["corridor"]', JSON.stringify(types));
  check(view.area.status === 'ok' && view.area.rooms.length > 0, 'area status ok', view.area.status);
  check(!view.area.rooms.some((r) => r.kind === 'shaft' || r.roomId === setup.shaftId), 'the area has no shaft room', JSON.stringify(view.area.rooms.map((r) => r.kind)));
  check(stored === '["corridor"]', 'stored value stays ["corridor"]', String(stored));
});

await run('run 2: no seed', {}, ({ check, setup, types, view, stored }) => {
  check(JSON.stringify(types) === '["corridor","shaft"]', 'scene list is ["corridor","shaft"]', JSON.stringify(types));
  check(view.area.rooms.some((r) => r.kind === 'shaft' && r.roomId === setup.shaftId), 'the area has the shaft room', JSON.stringify(view.area.rooms.map((r) => r.kind)));
  check(stored === '["corridor","shaft"]', 'default list is saved', String(stored));
});

await run('run 3: seed []', { [KEY]: '[]' }, ({ check, types, view, stored }) => {
  check(JSON.stringify(types) === '[]', 'scene list is []', JSON.stringify(types));
  check(view.area.status === 'no-types', 'area status is no-types', view.area.status);
  check(stored === '[]', 'stored value stays []', String(stored));
});

process.exitCode = worst;
