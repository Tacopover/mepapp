// U1-T02: with the label language set to NL, the Auto-place, Route and Size dialogs and the room Properties panel
// show English room type names. Setup through the scene API, reads of the DOM text only.
import { open, D, SP } from '/root/MepApp/.claude/worktrees/routing-feedback/.claude/roadmap/browser/lib.mjs';

const t = await open({ seed: { 'mepapp.settings.labelLanguage.v1': 'nl' } });
const { page, check, idle, nav } = t;
const DUTCH = /\b(Kantoor|Vergaderruimte|Lokaal|Gang|Entree en hal|Trappenhuis|Badkamer|Keuken en pantry|Kantine|Berging en opslag|Werkkast|Afvalruimte|Technische ruimte|Schacht|Meterkast|Kleedruimte|Woonkamer|Slaapkamer)\b/;
const text = (sel) => page.locator(sel).first().innerText();

await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.settings.labelLanguage.v1'))) === 'nl', 'the label language is nl');
await t.openPdf();
await t.openAutoPlace();
await t.detect();

// Give rooms known types (user choice), through the scene API (setup only).
const ids = await page.evaluate(() => {
  const s = window.__mepSketchScene;
  const rooms = s.listRooms();
  const types = ['office', 'meeting', 'corridor', 'toilet', 'storage', 'technical'];
  rooms.slice(0, types.length).forEach((r, i) => s.setRoomType([r.id], types[i]));
  return rooms.slice(0, types.length).map((r) => r.id);
});
check(ids.length >= 3, 'rooms with types exist', String(ids.length));

// ---------- Auto-place dialog ----------
await page.locator(`${nav} button[data-item="types"]`).click();
await idle();
let body = await text(D);
check(/Office/.test(body), 'Auto-place types step shows the English name Office', body.slice(0, 200));
check(!DUTCH.test(body), 'Auto-place types step has no Dutch room type name', (body.match(DUTCH) ?? [])[0]);
await t.shot('U1-T02-autoplace-nl-setting');
await page.locator(`${D} [role=tab]`, { hasText: 'Room type library' }).click();
await idle();
body = await text(D);
check(!DUTCH.test(body), 'Room type library tab has no Dutch name', (body.match(DUTCH) ?? [])[0]);
await page.locator(`${nav} button[data-item="rules"], ${nav} button[data-rule]`).first().click().catch(() => {});
await idle(600);
body = await text(D);
check(!DUTCH.test(body), 'Rules step has no Dutch name', (body.match(DUTCH) ?? [])[0]);
await page.keyboard.press('Escape');
await idle(600);

// ---------- Route dialog ----------
await t.openRoute();
await idle(800);
const R = '.mep-modal--route';
body = await text(R);
check(/Office|Meeting room|Corridor/.test(body), 'Route dialog shows English room type names', body.slice(0, 300));
check(!DUTCH.test(body), 'Route dialog has no Dutch room type name', (body.match(DUTCH) ?? [])[0]);
await t.shot('U1-T02-route-nl-setting');
await page.keyboard.press('Escape');
await idle(500);

// ---------- Size dialog ----------
await t.openSize();
await idle(800);
body = await text(R);
check(!DUTCH.test(body), 'Size dialog has no Dutch word', (body.match(DUTCH) ?? [])[0]);
await t.shot('U1-T02-size-nl-setting');
await page.keyboard.press('Escape');
await idle(500);

// ---------- Properties panel of a room ----------
await page.evaluate((id) => window.__mepSketchScene.selectRooms([id]), ids[0]);
await idle(600);
await page.locator('.mep-dock-tab-label', { hasText: 'Properties' }).first().click();
await idle(600);
const panel = page.locator('.mep-dock, .mep-dock-body').filter({ hasText: /Room type/i }).first();
body = await panel.innerText();
check(/Office/.test(body), 'Properties panel shows Office for the room', body.slice(0, 300));
check(!DUTCH.test(body), 'Properties panel has no Dutch room type name', (body.match(DUTCH) ?? [])[0]);
const select = panel.locator('select').first();
const options = await select.locator('option').allInnerTexts();
check(options.includes('Meeting room') && !options.some((o) => DUTCH.test(o)), 'the room type select lists English names', options.join('|'));
await t.shot('U1-T02-room-properties');


await t.finish();
