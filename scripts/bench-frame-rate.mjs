#!/usr/bin/env node
// Step 3 frame-rate/load benchmark (see /root/.claude/plans/luminous-chasing-rain.md).
//
// Drives the real dev server with a real PDF backdrop and a large number of
// placeholder overlay objects (plain tinted rectangles — the plan explicitly
// allows placeholder art here, since this step measures redraw/object-count
// cost, not rendering fidelity) and reports actual browser paint FPS during
// continuous pan and during a drag of a large selection.
//
// Usage:
//   pnpm --filter @mepapp/web dev &   # or: (cd apps/web && pnpm dev &)
//   node scripts/bench-frame-rate.mjs [chromium|firefox] [devServerUrl]
//
// IMPORTANT: FPS numbers are only meaningful on a machine with real GPU
// acceleration. A headless/sandboxed container with no GPU device falls back
// to software rendering (SwiftShader/llvmpipe), which produces uniformly low,
// non-representative numbers regardless of app performance. Check for a
// "GPU stall" / software-renderer console warning in the output before
// trusting any number this script reports.

import { chromium, firefox } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER_NAME = process.argv[2] || 'chromium';
const DEV_SERVER_URL = process.argv[3] || 'http://127.0.0.1:5173/';
const launcher = BROWSER_NAME === 'firefox' ? firefox : chromium;

const OBJECT_COUNT = 3000;
const BACKDROP_PDF = path.join(REPO_ROOT, 'fixtures/pdfs/00_arch_ground_floor.pdf');
const BACKDROP_PAGE_SIZE = { width: 2384, height: 3370 }; // 00_arch_ground_floor.pdf's own page points

function measureFps(page, durationMs) {
  return page.evaluate((duration) => new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    function step() {
      frames++;
      const elapsed = performance.now() - start;
      if (elapsed < duration) requestAnimationFrame(step);
      else resolve({ frames, ms: elapsed, fps: (frames / elapsed) * 1000 });
    }
    requestAnimationFrame(step);
  }), durationMs);
}

async function newLoadedPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const glWarnings = [];
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  page.on('console', (msg) => {
    if (/GPU stall|SwiftShader|software rendering/i.test(msg.text())) glWarnings.push(msg.text());
  });
  await page.goto(DEV_SERVER_URL, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[accept="application/pdf"]', BACKDROP_PDF);
  await page.waitForTimeout(1500);
  const populated = await page.evaluate(({ count, w, h }) => {
    const scene = window.__mepSketchScene;
    if (!scene) return { ok: false };
    scene.debugPopulateForBenchmark(count, w, h);
    return { ok: true };
  }, { count: OBJECT_COUNT, w: BACKDROP_PAGE_SIZE.width, h: BACKDROP_PAGE_SIZE.height });
  await page.waitForTimeout(300);
  return { page, populated, glWarnings };
}

// Zoom is applied via wheel ticks, each tick multiplying current zoom by 1.1
// (or dividing, for zoom-out). Called immediately after a fresh page load, so
// the scene's starting zoom is always exactly 1.0 — this makes the resulting
// absolute zoom level exact, not compounded across calls.
async function setAbsoluteZoom(page, canvasBox, targetZoom) {
  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2;
  const ticks = Math.round(Math.log(targetZoom) / Math.log(1.1));
  await page.mouse.move(cx, cy);
  for (let i = 0; i < Math.abs(ticks); i++) {
    await page.mouse.wheel(0, ticks > 0 ? -100 : 100);
  }
  await page.waitForTimeout(50);
}

async function panDrive(page, canvasBox, durationMs, steps) {
  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'right' });
  const stepDelay = durationMs / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    await page.mouse.move(cx + Math.sin(t * Math.PI * 4) * 200, cy + Math.cos(t * Math.PI * 4) * 150);
    await page.waitForTimeout(stepDelay);
  }
  await page.mouse.up({ button: 'right' });
}

async function benchmarkZoomLevel(browser, targetZoom, label) {
  const { page, populated, glWarnings } = await newLoadedPage(browser);
  if (!populated.ok) {
    console.log(`[${label}] FAILED to populate benchmark scene (window.__mepSketchScene missing — is this a dev build?)`);
    await page.close();
    return;
  }
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  await setAbsoluteZoom(page, box, targetZoom);
  const [result] = await Promise.all([measureFps(page, 2000), panDrive(page, box, 2000, 40)]);
  const softwareRenderer = glWarnings.length > 0 ? ' [SOFTWARE RENDERER DETECTED — number not representative]' : '';
  console.log(`[${label}] pan fps: ${result.fps.toFixed(1)} (${result.frames} frames / ${result.ms.toFixed(0)}ms)${softwareRenderer}`);
  await page.close();
}

async function benchmarkDragSelection(browser) {
  const { page, populated } = await newLoadedPage(browser);
  if (!populated.ok) {
    console.log('[drag-selection] FAILED to populate benchmark scene');
    await page.close();
    return;
  }
  await page.getByRole('button', { name: 'Select' }).click();
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();

  let selectedCount = 0;
  let rectSize = 150;
  for (let attempt = 0; attempt < 8 && selectedCount < 200; attempt++) {
    const sx = box.x + 20;
    const sy = box.y + 20;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + rectSize, sy + rectSize, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const text = await page.locator('text=/selected/').textContent();
    selectedCount = parseInt(text, 10) || 0;
    rectSize = Math.round(rectSize * 1.6);
  }

  if (selectedCount === 0) {
    console.log('[drag-selection] could not select any elements via rubber-band — skipping');
    await page.close();
    return;
  }

  const sx = box.x + 20 + Math.min(rectSize, 4000) / 2;
  const sy = box.y + 20 + Math.min(rectSize, 4000) / 2;
  const drive = async () => {
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 0; i < 40; i++) {
      await page.mouse.move(sx + i * 2, sy + i * 1.5);
      await page.waitForTimeout(50);
    }
    await page.mouse.up();
  };
  const [result] = await Promise.all([measureFps(page, 2000), drive()]);
  console.log(`[drag ~${selectedCount} selected elements] fps: ${result.fps.toFixed(1)}`);
  await page.close();
}

const browser = await launcher.launch();
console.log(`=== ${BROWSER_NAME}: ${OBJECT_COUNT} overlay objects + real PDF backdrop (${path.basename(BACKDROP_PDF)}) ===`);
for (const [zoom, label] of [
  [0.25, '25% zoom'],
  [1, '100% zoom'],
  [4, '400% zoom'],
  [8, '800% zoom'],
]) {
  await benchmarkZoomLevel(browser, zoom, label);
}
await benchmarkDragSelection(browser);
await browser.close();
