// T08: the five consumers of computeNetworks, the group toggle and the paste, on a file with a mixed group.
// No product code. Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t08-check.mjs
import { open, buildMixedGroupProject, screenOf, networkCountText } from './r3-lib.mjs';

const t = await open();
const { page, check, idle } = t;
const S = (fn, arg) => page.evaluate(fn, arg);

const clickAt = async (point, shift = false) => {
  const q = await screenOf(page, point);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(q.x, q.y);
  if (shift) await page.keyboard.up('Shift');
  await idle(400);
};
const deselect = async () => {
  await page.mouse.click(110, 150);
  await idle(300);
};
const tab = async (name) => { await page.locator("button, [role=tab], div", { hasText: new RegExp(`^${name}$`) }).first().click(); await idle(400); };
const groupCount = () => S(() => window.__mepSketchScene.exportProject().portGroups.reduce((n, g) => n + g.portIds.length, 0));
const linked = (name) => page.locator('label.mep-checkbox-row', { hasText: name }).locator('input[type=checkbox]');
const reload = async (mutate, arg) => {
  const raw = await S(
    ([src, arg]) => {
      const p = window.__mepSketchScene.exportProject();
      // eslint-disable-next-line no-new-func
      new Function('p', 'arg', src)(p, arg);
      return JSON.stringify(p);
    },
    [mutate, arg],
  );
  await S((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), raw);
  await idle(1500);
};

await t.start();
await t.openPdf();

// Setup A: mixed group, with a grille at the end of each network and a spare terminal with a routing target.
const b = await buildMixedGroupProject(t, 'mixed');
const extend = `
  const a = p.stamps[0];
  const fp = (id) => p.fittings.find((f) => f.id === id).position;
  const mk = (id, pos, extra) => ({ ...JSON.parse(JSON.stringify(a)), id, category: 'terminal', ports: [{ id: 'p', name: 'P', fractionX: 0.5, fractionY: 0.5 }], transform: { ...a.transform, position: pos }, ...extra });
  const g1 = mk('grille-1', fp('fitting-2'));
  const g2 = mk('grille-2', fp('fitting-4'));
  const sp = mk('spare-1', { x: fp('fitting-4').x, y: fp('fitting-4').y + 150 }, { routingTargets: { p: 'return-air' } });
  p.stamps.push(g1, g2, sp);
  const s2 = p.segments.find((s) => s.id === 'segment-2');
  const s4 = p.segments.find((s) => s.id === 'segment-4');
  s2.endpointB = { kind: 'port', elementId: 'grille-1', portId: 'p' };
  s4.endpointB = { kind: 'port', elementId: 'grille-2', portId: 'p' };
  p.fittings = p.fittings.filter((f) => f.id !== 'fitting-2' && f.id !== 'fitting-4');
`;
await reload(extend);
const stampsNow = await S(() => window.__mepSketchScene.exportProject().stamps.map((s) => s.id));
check(stampsNow.includes('grille-1') && stampsNow.includes('grille-2'), 'setup: grilles exist', JSON.stringify(stampsNow));
await page.locator('button.mep-rail-btn[title="Select"]').first().click();

// 1: status bar
const count = await networkCountText(page);
const summary = await S(() => window.__mepSketchScene.getDrawingSummary());
check(count === '2 networks' && summary.networkCount === 2, 'consumer 3: status bar says 2 networks and networkCount is 2', `${count} ${summary.networkCount}`);
await t.shot('T08-statusbar-two-networks');

// 2: Networks list
const sums = await S(() => window.__mepSketchScene.getNetworkSummaries().map((n) => ({ t: n.networkTypeName, s: n.segmentCount })));
check(sums.length === 2 && sums.some((n) => n.t === 'Supply Air' && n.s === 2) && sums.some((n) => n.t === 'Return Air' && n.s === 2), 'consumer 2: two summaries, Supply Air and Return Air, 2 segments each', JSON.stringify(sums));
await tab("Networks");
await idle(500);
if ((await page.locator('.mep-net-tree-row-network').count()) === 0) {
  await page.locator('.mep-net-tree-row-discipline', { hasText: 'Ventilation' }).click();
  await idle(300);
}
const rows = await page.locator('.mep-net-tree-row-network').allInnerTexts();
check(rows.length === 2 && rows.some((r) => r.includes('Supply Air')) && rows.some((r) => r.includes('Return Air')), 'consumer 2: the Networks panel shows two rows', JSON.stringify(rows));
await t.shot('T08-networks-list');

// 3: flow, with the Capacity input of each grille
const flow0 = await S(() => window.__mepSketchScene.getFlowResult());
check(flow0.length === 2 && flow0.every((f) => f.resolved), 'consumer 4: two flow results, both resolved', JSON.stringify(flow0.map((f) => f.resolved)));
const setCapacity = async (stampId, value) => {
  await tab("Properties");
  await S((id) => window.__mepSketchScene.selectStampById(id), stampId);
  await idle(500);
  const input = page.locator('.mep-field-row', { hasText: 'Capacity' }).locator('input[type=number]').first();
  await input.waitFor({ timeout: 10000 });
  await input.fill(String(value));
  await input.press('Enter');
  await idle(500);
};
await setCapacity('grille-1', 120);
await setCapacity('grille-2', 80);
const flow1 = await S(() => window.__mepSketchScene.getFlowResult().map((f) => ({ supply: 'segment-2' in f.segmentCapacity, ret: 'segment-4' in f.segmentCapacity, total: f.totalCapacity })));
check(flow1.length === 2 && flow1.find((f) => f.supply)?.total === 120 && flow1.find((f) => f.ret)?.total === 80, 'consumer 4: each network total equals the capacity of its own grille (120, 80)', JSON.stringify(flow1));

// 4: visible fittings
await deselect();
const seg2 = await S(() => {
  const s = window.__mepSketchScene.exportProject().segments.find((x) => x.id === 'segment-2');
  return { x: (s.geometry[0].x + s.geometry[1].x) / 2, y: (s.geometry[0].y + s.geometry[1].y) / 2 };
});
await clickAt(seg2);
const vis = await S(() => {
  const s = window.__mepSketchScene;
  return [...s.computeVisibleFittingIds(s.doc.drawingHistory.getState())];
});
check(vis.includes('fitting-1') && !vis.includes('fitting-3'), 'consumer 5: only the fitting of the selected network is visible', JSON.stringify(vis));

// 7: group toggle, then the highlight of the unit in both rows
await deselect();
await clickAt(b.aPos);
await tab("Properties");
await linked('Return in').waitFor({ timeout: 10000 });
await tab("Properties");
await linked('Return in').click();
await idle(400);
check((await networkCountText(page)) === '2 networks', 'toggle off: still 2 networks (types differ)', await networkCountText(page));
check((await groupCount()) === 1, 'toggle off: the group keeps 1 linked port (1 port)', String(await groupCount()));
await linked('Return in').click();
await idle(400);
check((await groupCount()) === 2, 'toggle on: the group has 2 linked ports again', String(await groupCount()));
check((await networkCountText(page)) === '2 networks', 'toggle on: 2 networks', await networkCountText(page));
await tab("Networks");
const rows2 = await page.locator('.mep-net-tree-row-network').count();
check(rows2 === 2, 'list keeps two rows after the toggle', String(rows2));
await deselect();
await clickAt(b.aPos);
await idle(500);
await tab("Networks");
const on = await page.locator('.mep-net-tree-row-element.on').count();
check(on === 2, 'the unit is highlighted in both rows', String(on));
await t.shot('T08-unit-highlight');

// 5: open ports do not depend on networks
const spareBuild = `
  const a = p.stamps[0];
  p.stamps.push({ ...JSON.parse(JSON.stringify(a)), id: 'spare-1', category: 'terminal', ports: [{ id: 'p', name: 'P', fractionX: 0.5, fractionY: 0.5 }], routingTargets: { p: 'return-air' }, transform: { ...a.transform, position: { x: a.transform.position.x, y: a.transform.position.y + 300 } } });
`;
await buildMixedGroupProject(t, 'group');
await reload(spareBuild);
const withG = await S(() => ({ n: window.__mepSketchScene.getDrawingSummary().networkCount, o: window.__mepSketchScene.getDrawingSummary().openPorts.reduce((a, x) => a + x.count, 0), g: window.__mepSketchScene.exportProject().portGroups.length }));
await reload(`p.portGroups = [];`);
const noG = await S(() => ({ n: window.__mepSketchScene.getDrawingSummary().networkCount, o: window.__mepSketchScene.getDrawingSummary().openPorts.reduce((a, x) => a + x.count, 0), g: window.__mepSketchScene.exportProject().portGroups.length }));
check(withG.g === 1 && noG.g === 0, 'open ports: the two builds differ in the group', `${JSON.stringify(withG)} ${JSON.stringify(noG)}`);
check(withG.o === noG.o && withG.o >= 1, 'open ports: the counts are equal with and without the group', `${withG.o} ${noG.o}`);
check(withG.n === 1 && noG.n === 2, 'open ports: the network count differs (1 with, 2 without)', `${withG.n} ${noG.n}`);

// 8: paste (finding F-R3-01)
const b2 = await buildMixedGroupProject(t, 'mixed');
// loadProjectFromJson without an icon resolver leaves stamps with no sprite, and copySelection skips those. Reload once with a plain bitmap resolver (setup only).
await S(async () => {
  const s = window.__mepSketchScene;
  const raw = JSON.parse(JSON.stringify(s.exportProject()));
  await s.loadProjectFromJson(raw, async () => { const c = document.createElement('canvas'); c.width = 40; c.height = 40; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(5, 5, 30, 30); return await createImageBitmap(c); });
});
await idle(1000);
const segPoints = await S(() =>
  window.__mepSketchScene.exportProject().segments.map((s) => ({ x: (s.geometry[0].x + s.geometry[1].x) / 2, y: (s.geometry[0].y + s.geometry[1].y) / 2 })),
);
await deselect();
await S((id) => window.__mepSketchScene.selectStampById(id), b2.aId);
await idle(400);
for (const pt of segPoints) await clickAt(pt, true);
console.log('selected ids ' + JSON.stringify(await S(() => [...window.__mepSketchScene.doc.selectedIds])));
const before = await S(() => { const p = window.__mepSketchScene.exportProject(); return { stamps: p.stamps.length, segments: p.segments.length, networks: window.__mepSketchScene.getDrawingSummary().networkCount, ids: p.stamps.map((s) => s.id) }; });
console.log('before paste ' + JSON.stringify(before));
console.log('seq before ' + (await S(() => window.__mepSketchScene.doc.nextStampSeq)) + ' sprites ' + JSON.stringify(await S(() => [...window.__mepSketchScene.doc.stamps.keys()])));
await page.locator('body').press('Control+c');
await idle(300);
await page.locator('body').press('Control+v');
await idle(1200);
const afterPaste = await S(() => {
  const p = window.__mepSketchScene.exportProject();
  return { stamps: p.stamps.length, segments: p.segments.length, groups: p.portGroups, networks: window.__mepSketchScene.getDrawingSummary().networkCount };
});
console.log('segments after paste ' + JSON.stringify(await S(() => window.__mepSketchScene.exportProject().segments.map((s) => [s.id, s.endpointA.kind === 'port' ? s.endpointA.elementId : s.endpointA.fittingId, s.endpointB.kind === 'port' ? s.endpointB.elementId : s.endpointB.fittingId]))));
console.log('stamps after paste ' + JSON.stringify(await S(() => ({ ids: window.__mepSketchScene.exportProject().stamps.map((s) => s.id), seq: window.__mepSketchScene.doc.nextStampSeq, hasSprite: [...window.__mepSketchScene.doc.stamps.keys()] }))));
const pastedGroups = afterPaste.groups.filter((g) => g.elementId !== b2.aId);
console.log(`PASTE same drawing: stamps ${afterPaste.stamps}, segments ${afterPaste.segments}, groups ${JSON.stringify(afterPaste.groups)}, networks ${afterPaste.networks}`);
console.log(`FINDING pasted unit ${pastedGroups.length > 0 ? 'has' : 'has no'} port group (same drawing); networks after paste: ${afterPaste.networks}`);
check(afterPaste.stamps === before.stamps + 1 && afterPaste.segments === before.segments + 4, 'paste: one unit and four segments were pasted', JSON.stringify({ before, afterPaste }));

await t.openPdf('/root/MepApp/fixtures/pdfs/Example_1.pdf', 'second.pdf');
const segBefore = await S(() => window.__mepSketchScene.exportProject().segments.length);
await page.locator('body').press('Control+v');
await idle(1200);
const second = await S(() => {
  const p = window.__mepSketchScene.exportProject();
  return { stamps: p.stamps.length, segments: p.segments.length, groups: p.portGroups, networks: window.__mepSketchScene.getDrawingSummary().networkCount };
});
console.log(`PASTE other drawing: stamps ${second.stamps}, segments ${second.segments}, groups ${JSON.stringify(second.groups)}, networks ${second.networks}`);
console.log(`PASTE other drawing delta: segments +${second.segments - segBefore}`);
check(second.segments - segBefore === 4, 'paste into the other drawing added the four segments', String(second.segments - segBefore));
console.log(`FINDING pasted unit ${second.groups.length > 0 ? 'has' : 'has no'} port group (other drawing); networks after paste: ${second.networks}`);

await t.finish();
