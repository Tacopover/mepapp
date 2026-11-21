// B7-T04b UI review: with no building open, the Properties panel of a fitting and of a segment shows no new node. Also a Tab sequence.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf, placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { TYPE } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t04b/';
const W = '/root/MepApp/.claude/worktrees/buildings-b7/fixtures/pdfs/';
const t = await open();
const { page, check, idle } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
await t.openPdf(W + '00_arch_ground_floor.pdf', 'solo.pdf');
await placeOneStamp(t);
const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
await page.evaluate(
  ([H, type]) => {
    const scene = window.__mepSketchScene;
    const p = scene.exportProject();
    const base = JSON.parse(JSON.stringify(p.stamps[0]));
    delete base.routingTargets;
    delete base.autoPlaced;
    const s = base.transform.scale?.x ?? 1;
    const sy = base.transform.scale?.y ?? 1;
    const inPort = { id: 'in', name: 'In', fractionX: 0, fractionY: 0.5 };
    const rf = { x: 300, y: H - 300 };
    const at = { x: 500, y: H - 300 };
    base.id = 't0';
    base.category = 'terminal';
    base.ports = [inPort];
    base.transform = { ...base.transform, position: { x: at.x - (0 - 0.5) * base.nativeWidth * s, y: at.y - (0.5 - 0.5) * base.nativeHeight * sy } };
    p.stamps = [base];
    p.fittings = [{ id: 'rf', pageIndex: 0, position: rf, kind: 'junction' }];
    p.segments = [{ id: 's1', pageIndex: 0, networkTypeId: type.id, shape: 'round', diameter: 200, endpointA: { kind: 'fitting', fittingId: 'rf' }, endpointB: { kind: 'port', elementId: 't0', portId: 'in' }, geometry: [rf, at] }];
    p.portGroups = [];
    p.terminalCapacities = { t0: 150 };
    p.networkTypes = [type];
    scene.loadProjectFromJson(p);
  },
  [H, TYPE],
);
await idle(1200);
await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));
await page.locator('button.mep-rail-btn[title="Select"]').click();

async function clickPoint(p) {
  const at = await screenOf(page, p);
  await page.mouse.click(at.x, at.y);
  await idle(500);
}
const dump = () =>
  page.evaluate(() => {
    const body = document.querySelector('.mep-dock-body');
    return {
      sections: body.querySelectorAll('.mep-section').length,
      h4: [...body.querySelectorAll('h4')].map((h) => h.textContent),
      rows: [...body.querySelectorAll('.mep-field-row')].map((r) => r.querySelector('label')?.textContent),
      textRows: body.querySelectorAll('.mep-field-row--text, .mep-field-text, [data-testid^="props-riser"], [data-testid^="props-segment-riser"]').length,
      hints: [...body.querySelectorAll('.mep-hint')].map((h) => h.textContent),
      text: body.innerText.replace(/\n+/g, ' | '),
    };
  });
const tabSeq = async (n) => {
  const seq = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    seq.push(
      await page.evaluate(() => {
        const a = document.activeElement;
        const inBody = !!a?.closest('.mep-dock-body');
        const row = a?.closest('.mep-field-row')?.querySelector('label')?.textContent ?? '';
        return `${a?.tagName.toLowerCase()}${inBody ? '[dock]' : ''}${row ? ' ' + row : ''}${a?.getAttribute('title') ? ' (' + a.getAttribute('title') + ')' : ''}`;
      }),
    );
  }
  return seq;
};

await clickPoint({ x: 300, y: H - 300 });
const fit = await dump();
console.log('FITTING', JSON.stringify(fit));
check(fit.textRows === 0 && fit.h4.length === 0 && JSON.stringify(fit.rows) === JSON.stringify(['Kind', 'X (pt)', 'Y (pt)', 'Solved capacity']), 'no building: the Fitting panel has the four old rows and no riser node');
await page.locator('.mep-dock-body select').first().focus();
console.log('TAB fitting no building', JSON.stringify(await tabSeq(6)));
await page.screenshot({ path: `${SHOTS}ui-review-nobuilding-fitting.png`, clip: { x: 1180, y: 40, width: 420, height: 400 } });
await clickPoint({ x: 400, y: H - 300 });
const seg = await dump();
console.log('SEGMENT', JSON.stringify(seg));
check(seg.textRows === 0 && !seg.hints.some((h) => /riser/i.test(h)), 'no building: the Segment panel has no riser hint');
await page.screenshot({ path: `${SHOTS}ui-review-nobuilding-segment.png`, clip: { x: 1180, y: 40, width: 420, height: 400 } });
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
