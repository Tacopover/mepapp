// R6 T24 check: Save, reload, Open and the PDF round trip of the route marks (real menu, real dialog).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r6-t24-check.mjs
import { open, setupRooms, buildRoutingProject } from './r6-lib.mjs';
import { helpers } from './r6-ui-lib.mjs';
import { BASE } from './lib.mjs';

const t = await open();
const { page, check, shot, finish, idle, menu, until, statusText } = t;
const H = helpers(t);
const { tid } = H;

const projectNow = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__mepSketchScene.exportProject())));
const pick = (p) => JSON.stringify({ stamps: p.stamps, segments: p.segments, fittings: p.fittings, portGroups: p.portGroups, schemaVersion: p.schemaVersion });
const section = async (name, fn) => {
  console.log(`\n=== ${name} ===`);
  try {
    await fn();
  } catch (e) {
    check(false, `${name}: ran to the end`, String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  }
};

try {
  await setupRooms(t, { pdf: '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf', scale: '50' });
  const b = await buildRoutingProject(t, { targets: 4 });
  const off = b.roomIds.slice(3);
  const run = await H.placeRun({ roomsOff: off });
  const before = await projectNow();
  const markedBefore = { s: before.segments.filter((s) => s.routedBy === 'route').length, f: before.fittings.filter((f) => f.routedBy === 'route').length };
  check(before.schemaVersion === 21 && markedBefore.s === run.segments && markedBefore.f === run.fittings, 'setup: schema 21 and the run is marked', JSON.stringify({ v: before.schemaVersion, markedBefore, run }));

  await section('1. Save As through the real menu', async () => {
    await menu('Save As…');
    await until(async () => /Saved as|Downloaded|Failed to save/.test(await statusText()), 'save', 60000);
    const status = await statusText();
    console.log(`status after Save As: ${status}`);
    check(/Saved as/.test(status), '1: the PDF is saved', status);
    const size = await page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('export.json')).getFile()).size);
    check(size > 1000, '1: the saved file has bytes', String(size));
    const marker = await page.evaluate(async () => {
      const file = await (await (await navigator.storage.getDirectory()).getFileHandle('export.json')).getFile();
      const text = new TextDecoder('latin1').decode(new Uint8Array(await file.arrayBuffer()));
      return { head: text.slice(0, 8), hasRoutedBy: text.includes('routedBy'), hasProject: /mepapp/i.test(text) };
    });
    console.log(`saved file: ${JSON.stringify(marker)}`);
    check(marker.head.startsWith('%PDF'), '1: the saved file is a PDF', marker.head);
  });

  await section('2. reload the page and Open the saved file', async () => {
    await page.goto(BASE, { timeout: 180000 });
    await page.locator('button.mep-onboarding-start').click({ timeout: 4000 }).catch(() => {});
    await page.waitForFunction(() => window.__mepSketchScene !== undefined);
    await page.evaluate(() => { window.__nextFile = 'export.json'; });
    await menu('Open…');
    await until(async () => /Loaded|Could not open/.test(await statusText()), 'open saved', 120000);
    await idle(1500);
    const status = await statusText();
    console.log(`status after Open: ${status}`);
    check(/Loaded/.test(status), '2: the saved file opens', status);
    const after = await projectNow();
    check(pick(after) === pick(before), '2: stamps, segments, fittings and port groups equal the export before (marks included)', `segments ${after.segments.length}/${before.segments.length}`);
    check(after.segments.filter((s) => s.routedBy === 'route').length === markedBefore.s && after.fittings.filter((f) => f.routedBy === 'route').length === markedBefore.f, '2: the same items carry the mark');
    check(after.schemaVersion === 21, '2: schemaVersion is 21', String(after.schemaVersion));
    console.log(`whole export equal: ${JSON.stringify(after) === JSON.stringify(before)}`);
  });

  await section('3. a re-run offers the same removal count', async () => {
    await H.openDialog();
    await H.selectInputs('supply-air');
    const scaleOk = (await H.lineOf('no-calibration')) === null;
    console.log(`no-calibration line after reopen: ${!scaleOk}`);
    check(scaleOk, '3: the scale is kept in the saved file');
    const roomCount = await page.evaluate(() => window.__mepSketchScene.listRooms().length);
    check(roomCount > 0, '3: the rooms are kept in the saved file', String(roomCount));
    await H.setRooms(off, false);
    const rem = await H.removeNumbers();
    console.log(`remove line after reopen: ${rem?.text}`);
    check(rem && rem.segments === markedBefore.s && rem.fittings === markedBefore.f, '3: the removal count equals the first run', JSON.stringify(rem));
    await H.scrollTo('route-build-remove');
    await shot('T24-reopen-rerun');
    await H.closeDialog();
  });

  await section('4. a schema 20 file loads and a run on it removes nothing', async () => {
    const out = await page.evaluate((p) => {
      try {
        const old = JSON.parse(JSON.stringify(p));
        old.schemaVersion = 20;
        for (const s of old.segments) delete s.routedBy;
        for (const f of old.fittings) delete f.routedBy;
        window.__mepSketchScene.loadProjectFromJson(old);
        const now = window.__mepSketchScene.exportProject();
        return { ok: true, version: now.schemaVersion, segments: now.segments.length, marked: now.segments.filter((s) => s.routedBy).length };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }, before);
    await idle(1500);
    check(out.ok && out.version === 21 && out.segments === before.segments.length && out.marked === 0, '4: the schema 20 file loads as schema 21 with no marks', JSON.stringify(out));
    await H.openDialog();
    await H.selectInputs('supply-air');
    await H.setRooms(off, false);
    const codes = await H.lineCodes();
    console.log(`lines on the schema 20 file: ${JSON.stringify(codes)}`);
    check((await H.lineOf('removes-routed')) === null, '4: a run on it removes nothing (no removal line)');
    await H.closeDialog();
  });

  await section('5. a bad routedBy loads with the field removed', async () => {
    const out = await page.evaluate((p) => {
      try {
        const bad = JSON.parse(JSON.stringify(p));
        bad.segments[0].routedBy = 'x';
        bad.segments[1].routedBy = true;
        bad.fittings[0].routedBy = 1;
        window.__mepSketchScene.loadProjectFromJson(bad);
        const now = window.__mepSketchScene.exportProject();
        const byId = (arr, id) => arr.find((x) => x.id === id);
        return {
          ok: true,
          s0: byId(now.segments, bad.segments[0].id),
          s1: byId(now.segments, bad.segments[1].id),
          f0: byId(now.fittings, bad.fittings[0].id),
          marked: now.segments.filter((s) => s.routedBy === 'route').length,
          orig: [bad.segments[0], bad.segments[1], bad.fittings[0]],
        };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }, before);
    await idle(1000);
    check(out.ok && out.s0.routedBy === undefined && out.s1.routedBy === undefined && out.f0.routedBy === undefined, '5: the bad values are removed', JSON.stringify(out.ok ? [out.s0.routedBy, out.s1.routedBy, out.f0.routedBy] : out));
    check(out.ok && out.s0.diameter === out.orig[0].diameter && out.s0.endpointA.kind === out.orig[0].endpointA.kind && out.f0.position.x === out.orig[2].position.x, '5: the other fields stay');
    check(out.ok && out.marked === before.segments.length - 2, '5: the valid marks stay', String(out.marked));
  });
} catch (e) {
  check(false, 'check ran to the end', String(e && e.stack ? e.stack : e));
}
await finish();
