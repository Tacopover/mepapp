// P2 T16 check: the "Two-level" toggle in the Route dialog (real DOM). Empty networkTypes project.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/p2-t16-check.mjs
import { open, setupRooms, buildRoutingProject } from './r6-lib.mjs';
import { helpers } from './r6-ui-lib.mjs';

const t = await open();
const { page, check, shot, finish, idle } = t;
const H = helpers(t);
const { tid } = H;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await setupRooms(t, { pdf: '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf', scale: '50' });
  await buildRoutingProject(t, { targets: 6 });
  await H.reload(`p.networkTypes = [];`);
  const segCount = () => page.evaluate(() => window.__mepSketchScene.exportProject().segments.length);
  check((await segCount()) === 0, 'no segments before');

  await H.openDialog();
  await H.selectInputs('supply-air', 'out');
  await H.waitPlan();
  const toggle = tid('route-build-two-level');
  check((await toggle.count()) === 1, 'the Two-level toggle exists');
  check(await toggle.isChecked(), 'the toggle is on by default');
  check(((await toggle.locator('xpath=..').getAttribute('title')) ?? '').length > 0, 'the toggle has a tooltip');
  const on = await H.summaryNumbers();
  console.log('on:', on.text);
  await tid('route-build').scrollIntoViewIfNeeded().catch(() => {});
  await shot('P2-T16-chip-on');

  await toggle.uncheck();
  await idle(400);
  await H.waitPlan();
  const off1 = await H.summaryNumbers();
  console.log('off:', off1.text);
  console.log('codes on:', JSON.stringify(await H.lineCodes()));
  check(typeof on.segments === 'number' && on.segments > 0, 'the plan with Two-level has segments', on.text);
  await tid('route-build').scrollIntoViewIfNeeded().catch(() => {});
  await shot('P2-T16-chip-off');

  await toggle.check();
  await H.waitPlan();
  const off2 = await H.summaryNumbers();
  check(off2.text === on.text, 'toggle on again gives the same numbers as at the start', `${on.text} | ${off2.text}`);
  await toggle.uncheck();
  await H.waitPlan();
  const off3 = await H.summaryNumbers();
  check(off3.text === off1.text, 'toggle off again gives the same numbers', `${off1.text} | ${off3.text}`);

  await toggle.check();
  await H.waitPlan();
  const on2 = await H.summaryNumbers();
  check(on2.text === on.text, 'toggle on again gives the same numbers', `${on.text} | ${on2.text}`);

  await tid('route-place').click();
  await tid('route-build-result').waitFor({ state: 'visible', timeout: 15000 });
  const placed = (await tid('route-build-result').innerText()).trim();
  console.log(placed);
  await shot('P2-T16-placed');
  await H.closeDialog();
  const n = await segCount();
  check(n === on.segments, 'placed segment count equals the preview count', `${n} vs ${on.segments}`);
  const types = await page.evaluate(() => window.__mepSketchScene.exportProject().networkTypes.map((x) => x.id));
  check(types.includes('supply-air'), 'the network type is adopted', JSON.stringify(types));

  await H.undo();
  check((await segCount()) === 0, 'rail Undo removes the plan', String(await segCount()));
  check(errors.length === 0, 'no page error', errors.join(' | '));
} catch (e) {
  check(false, 'ran to the end', String(e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e));
}
await finish();
