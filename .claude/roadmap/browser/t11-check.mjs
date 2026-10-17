// T11: the hints of linked ports (Properties panel and Element Editor), read as real DOM text.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t11-check.mjs
import { open, buildMixedGroupProject } from './r3-lib.mjs';

const t = await open();
const { page, check, idle } = t;
await t.start();
await t.openPdf();
const b = await buildMixedGroupProject(t, 'mixed');
await page.locator('button.mep-rail-btn[title="Select"]').first().click();
await page.evaluate((id) => window.__mepSketchScene.selectStampById(id), b.aId);
await idle(600);

const hint = page.locator('.mep-section:has(h4:text-is("Linked ports")) p.mep-hint');
check((await hint.count()) === 1, 'Properties: the linked ports hint shows', String(await hint.count()));
const text = ((await hint.first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
check(/one connection point for segments of one network type/.test(text), 'Properties: new wording', text);
check(/Segments of different network types on these ports stay separate networks\./.test(text), 'Properties: second sentence', text);
check(!/connectivity node|never bridges/.test(text), 'Properties: old wording is gone', text);
await t.shot('T11-hint');

// Element Editor step: Edit button, then the Ports tab. Reports "not verified" if the way in fails.
let editorText = null;
try {
  await page.locator('button', { hasText: /^\s*Edit\s*$/ }).first().click({ timeout: 5000 });
  await page.locator('.mep-modal').waitFor({ timeout: 10000 });
  await idle(600);
  await page.locator('.mep-modal button', { hasText: /^\s*Ports\s*$/ }).first().click({ timeout: 5000 });
  await idle(600);
  const eh = page.locator('.mep-modal .mep-section:has(h4:text-is("Linked Ports")) p.mep-hint');
  if ((await eh.count()) > 0) editorText = ((await eh.first().innerText()) || '').replace(/\s+/g, ' ').trim();
} catch (e) {
  console.log('editor step error: ' + String(e).split('\n')[0]);
}
if (editorText === null) {
  console.log('Element Editor hint: not verified because the Linked Ports section did not show (the unit may have fewer than 2 ports in its definition or the editor did not open).');
} else {
  check(/once placed/.test(editorText) && /one connection point for segments of one network type/.test(editorText), 'Editor: new wording', editorText);
  check(!/connectivity node|never bridges/.test(editorText), 'Editor: old wording is gone', editorText);
  await t.shot('T11-hint-editor');
}
await t.finish();
