// B6-T09 no-flag check: plain app (no seed flag), a good save shows no error toast.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, menu, until, statusText } = t;
await t.start();
await t.openPdf('/root/MepApp/fixtures/pdfs/00_arch_ground_floor.pdf', 'a.pdf');
await menu('Save');
await until(async () => /^(Saved |Failed)/.test(await statusText()), 'save');
await page.waitForTimeout(1000);
check((await statusText()) === 'Saved a.pdf.', 'the status line says "Saved a.pdf."', await statusText());
check((await page.locator('.mep-toast-error').count()) === 0, 'no error toast after a good save');
await t.finish();
