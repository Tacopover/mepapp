// T14c browser check: the editor converts stored capacities when the flow unit changes. Real DOM inputs.
import { open, buildSizingProject } from './r5-lib.mjs';

const M = '.mep-modal';
const t = await open();
const { page, check, idle, shot } = t;

async function main() {
  await t.start();
  await t.openPdf();
  const built = await buildSizingProject(t, { type: 'air', capacities: [36, 72] });
  const [t1, t2] = built.terminalIds;
  const sc = (fn, arg) => page.evaluate(fn, arg);
  const caps = () => sc(() => window.__mepSketchScene.exportProject().terminalCapacities);
  const typeNow = async () => (await sc(() => window.__mepSketchScene.exportProject().networkTypes)).find((x) => x.id === 'supply-air');
  const setUnit = (u) => sc((u) => window.__mepSketchScene.updateNetworkType('supply-air', { flowUnit: u }), u);
  const setCaps = (a, b) => sc(([a, b, t1, t2]) => { window.__mepSketchScene.setTerminalCapacity(t1, a); window.__mepSketchScene.setTerminalCapacity(t2, b); }, [a, b, t1, t2]);

  async function openEditor() {
    await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
    await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
    await page.locator('.mep-discipline-btn', { hasText: 'HVAC' }).first().click();
    await idle(400);
    await page.locator('.mep-networktype-tile', { hasText: 'Supply Air' }).first().locator('button[title="Edit"]').click();
    await page.locator(M).waitFor({ timeout: 20000 });
    await idle(400);
  }
  const save = () => page.locator(M).getByRole('button', { name: /^Save$/ }).first();
  const panel = () => page.locator(`${M} [data-testid=nt-convert-panel]`);
  const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;

  // 1. m3/h -> dm3/s, "Keep numbers"
  await setUnit('m³/h');
  await openEditor();
  await page.locator(`${M} [data-testid=nt-flow-unit]`).selectOption('dm³/s');
  await save().click();
  await idle(300);
  check((await panel().count()) === 1, 'step 1: the convert panel shows after Save');
  const q = await panel().innerText();
  check(/Convert 2 stored capacities from m³\/h to dm³\/s\?/.test(q), 'step 1: question names 2 capacities and both units', q);
  await shot('T14c-convert-question');
  check((await caps())[t1] === 36, 'step 1: nothing stored before an answer');
  await page.locator(`${M} [data-testid=nt-convert-no]`).click();
  await idle(400);
  let c = await caps();
  check(c[t1] === 36 && c[t2] === 72 && (await typeNow()).flowUnit === 'dm³/s', 'step 1: Keep numbers stores 36 and 72 and flowUnit dm³/s', JSON.stringify(c));
  check((await page.locator(M).count()) === 0, 'step 1: the dialog closed');

  // 2. back to m3/h, Convert
  await setUnit('m³/h');
  await setCaps(36, 72);
  await openEditor();
  await page.locator(`${M} [data-testid=nt-flow-unit]`).selectOption('dm³/s');
  await save().click();
  await idle(300);
  await page.locator(`${M} [data-testid=nt-convert-yes]`).click();
  await idle(500);
  c = await caps();
  check(near(c[t1], 10) && near(c[t2], 20) && (await typeNow()).flowUnit === 'dm³/s', 'step 2: Convert stores 10 and 20 and flowUnit dm³/s', JSON.stringify(c));

  // 3. kind change: volume -> power
  await setUnit('dm³/s');
  await setCaps(10, 20);
  await openEditor();
  await page.locator(`${M} [data-testid=nt-flow-unit]`).selectOption('kW');
  await save().click();
  await idle(300);
  const w = await panel().innerText();
  check(/cannot be converted/.test(w), 'step 3: the kind warning shows', w);
  check((await page.locator(`${M} [data-testid=nt-convert-yes]`).count()) === 0, 'step 3: no Convert button');
  check((await page.locator(`${M} [data-testid=nt-convert-no]`).count()) === 1, 'step 3: Keep numbers button shows');
  await shot('T14c-unit-warning');
  await page.locator(`${M} [data-testid=nt-convert-no]`).click();
  await idle(400);
  c = await caps();
  check(c[t1] === 10 && c[t2] === 20 && (await typeNow()).flowUnit === 'kW', 'step 3: numbers kept, flowUnit kW', JSON.stringify(c));

  // 4. Not set -> dm3/s: no panel, the Note shows
  await setUnit(undefined);
  await openEditor();
  await page.locator(`${M} [data-testid=nt-flow-unit]`).selectOption('dm³/s');
  const note = await page.locator(`${M} [data-testid=nt-unit-read-note]`).innerText();
  check(/read as dm³\/s/.test(note), 'step 4: the Note shows', note);
  await shot('T14c-unit-read-note');
  await save().click();
  await idle(400);
  check((await page.locator(M).count()) === 0 && (await typeNow()).flowUnit === 'dm³/s', 'step 4: saved with no panel');
  c = await caps();
  check(c[t1] === 10 && c[t2] === 20, 'step 4: numbers unchanged', JSON.stringify(c));

  // 5. a terminal on two types is not converted
  await sc((a) => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    p.segments.push({ id: 'segment-x', pageIndex: 0, networkTypeId: 'return-air', shape: 'round', diameter: 200, endpointA: { kind: 'fitting', fittingId: 'fitting-3' }, endpointB: { kind: 'port', elementId: a, portId: 'in' }, geometry: p.segments.find((q) => q.id === 'segment-6').geometry });
    p.networkTypes.push({ id: 'return-air', name: 'Return Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#4fc3f7', lineWidthPt: 2, linePattern: 'dashed' });
    s.loadProjectFromJson(p);
  }, t1);
  await idle(1500);
  await setUnit('m³/h');
  await setCaps(36, 72);
  await openEditor();
  await page.locator(`${M} [data-testid=nt-flow-unit]`).selectOption('dm³/s');
  await save().click();
  await idle(300);
  const q5 = await panel().innerText();
  check(/Convert 1 stored capacity/.test(q5) && /not converted/.test(q5), 'step 5: one capacity converts, one is reported as not converted', q5);
  await page.locator(`${M} [data-testid=nt-convert-yes]`).click();
  await idle(500);
  c = await caps();
  check(c[t1] === 36 && near(c[t2], 20), 'step 5: the mixed terminal keeps 36, the other becomes 20', JSON.stringify(c));
  // 6. a stamp that is not routed yet (Auto-place writes the capacity and the routing targets first) is converted too
  const placeUnrouted = (targets, x) =>
    sc(
      async ([targets, x]) => {
        const s = window.__mepSketchScene;
        const canvas = new OffscreenCanvas(60, 60);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(10, 10, 40, 40);
        const bitmap = await createImageBitmap(canvas);
        const definition = { id: 'custom-t14c', label: 'T14c', discipline: 'ventilation', category: 'terminal', nativeWidth: 14, nativeHeight: 14, ports: [{ id: 'in', name: 'in', fractionX: 0, fractionY: 0.5 }, { id: 'out', name: 'out', fractionX: 1, fractionY: 0.5 }], iconRef: 'data:image/png;base64,AAAA', source: 'custom' };
        const stamp = { position: { x, y: 600 }, rotationDegrees: 0, ruleId: 'r', roomId: 'room', capacity: 36, routingTargets: targets };
        return s.autoPlaceStamps([{ definition, bitmap, stamps: [stamp] }])[0];
      },
      [targets, x],
    );
  await setUnit('m³/h');
  await setCaps(36, 72);
  const unroutedId = await placeUnrouted({ in: 'supply-air' }, 300);
  const unroutedMixedId = await placeUnrouted({ in: 'supply-air', out: 'return-air' }, 400);
  c = await caps();
  check(c[unroutedId] === 36 && c[unroutedMixedId] === 36, 'step 6: both unrouted stamps have capacity 36', JSON.stringify(c));
  await openEditor();
  await page.locator(`${M} [data-testid=nt-flow-unit]`).selectOption('dm³/s');
  await save().click();
  await idle(300);
  const q6 = await panel().innerText();
  check(/Convert 2 stored capacities/.test(q6) && /not converted/.test(q6), 'step 6: the unrouted stamp is counted (2 convertible), the mixed ones are reported', q6);
  await shot('T24-convert-unrouted');
  await page.locator(`${M} [data-testid=nt-convert-yes]`).click();
  await idle(500);
  c = await caps();
  check(near(c[unroutedId], 10) && c[unroutedMixedId] === 36 && near(c[t2], 20) && c[t1] === 36, 'step 6: the unrouted stamp becomes 10, the unrouted mixed stamp keeps 36', JSON.stringify(c));
}

try {
  await main();
} catch (err) {
  t.check(false, 'script error', String(err?.stack ?? err));
}
t.finish();
