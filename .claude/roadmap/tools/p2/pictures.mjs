// Pictures of route plans on a floor plan (P2-T17a).
// Usage: node pictures.mjs <scene.json> <plan.pdf> <outPrefix> <single|pair> [labelA labelB] [pxPerPt]
// scene.json: { name, mmPerPt, rooms[{id,outer,label,served,area}], sides[{label,paths|polylines|hand,metrics,warnings,terminals,start}] } (all points in mm).
// single: one picture per side. pair: one picture with the sides labelA (left) and labelB (right) at the same crop and scale.
// The PDF background is rendered by mupdf (as sbs.mjs). The overlay is SVG, rasterised by chromium (playwright of the repo).
import { createRequire } from 'node:module';
import fs from 'node:fs';
const REPO = '/root/MepApp/.claude/worktrees/routing-feedback';
const require = createRequire(`${REPO}/packages/pdf-engine-mupdf/package.json`);
const mupdf = await import(require.resolve('mupdf'));
const { chromium } = await import(`${REPO}/node_modules/playwright/index.mjs`);
const zlib = await import('node:zlib');

const [scenePath, pdfPath, outPrefix, mode, labA, labB, pxArg] = process.argv.slice(2);
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
const k = scene.mmPerPt;
const pt = (p) => ({ x: p.x / k, y: p.y / k });

// crop: bounding box of the rooms plus a margin (pt)
let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
for (const r of scene.rooms) for (const p of r.outer) { const q = pt(p); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
const M = 25;
x0 = Math.floor(x0 - M); y0 = Math.floor(y0 - M); x1 = Math.ceil(x1 + M); y1 = Math.ceil(y1 + M);
const cw = x1 - x0, ch = y1 - y0;

const COLORS = { trunk: '#1565c0', bridge: '#7b1fa2', branch: '#d32f2f', spine: '#2e9d3a', link: '#8a8a8a', main: '#1565c0', room: '#d32f2f' };
const sc = pxArg ? +pxArg : (mode === 'pair' ? 0.8 : 1.2);

function crcPng(buf, W, H) {
  const T = new Int32Array(256).map((_, n) => { let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) buf.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function background() {
  const doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), 'application/pdf');
  const pm = doc.loadPage(0).toPixmap(mupdf.Matrix.scale(sc, sc), mupdf.ColorSpace.DeviceRGB, false, true);
  const sp = pm.getPixels(), ss = pm.getStride(), n = pm.getNumberOfComponents();
  const W = Math.round(cw * sc), H = Math.round(ch * sc);
  const buf = Buffer.alloc(W * H * 3, 255);
  const ox = Math.round(x0 * sc), oy = Math.round(y0 * sc);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = (y + oy) * ss + (x + ox) * n, di = (y * W + x) * 3;
    buf[di] = sp[si]; buf[di + 1] = sp[si + 1]; buf[di + 2] = sp[si + 2];
  }
  return 'data:image/png;base64,' + crcPng(buf, W, H).toString('base64');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function legendRows(side) {
  const hand = side.hand !== undefined;
  const rows = hand ? [['main run', COLORS.main], ['room segments', COLORS.room]] : [['trunk (main run)', COLORS.trunk], ['branch', COLORS.branch], ['spine', COLORS.spine], ['link', COLORS.link], ['bridge', COLORS.bridge]];
  return rows;
}

function panel(side, bg) {
  const X = (p) => ((p.x / k - x0) * sc).toFixed(1), Y = (p) => ((p.y / k - y0) * sc).toFixed(1);
  const W = Math.round(cw * sc), H = Math.round(ch * sc);
  const m = side.metrics;
  const chained = new Set(m.chainedIds), warn = Object.fromEntries(side.warnings);
  const off = new Set(warn['room-off-graph'] ?? []);
  const lw = sc >= 1 ? 3.2 : 2.6;
  const out = [];
  out.push(`<image href="${bg}" x="0" y="0" width="${W}" height="${H}" opacity="0.4"/>`);
  for (const r of scene.rooms) {
    const pts = r.outer.map((p) => `${X(p)},${Y(p)}`).join(' ');
    let fill = 'none', stroke = 'none', sw = 0, dash = '';
    if (r.served) { fill = 'rgba(255,235,120,0.28)'; stroke = '#bfa100'; sw = 1; }
    if (chained.has(r.id)) { stroke = '#ff7a00'; sw = 4; fill = 'rgba(255,140,0,0.22)'; }
    if (off.has(r.id)) { stroke = '#d500f9'; sw = 4; dash = ' stroke-dasharray="10 6"'; }
    out.push(`<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`);
  }
  const lines = [];
  if (side.hand) { for (const l of side.hand.main) lines.push(['main', l]); for (const l of side.hand.room) lines.push(['room', l]); }
  else if (side.paths) for (const p of side.paths) lines.push([p.origin, p.path]);
  else for (const l of side.polylines) lines.push(['trunk', l]);
  const order = ['link', 'spine', 'bridge', 'branch', 'room', 'trunk', 'main'];
  lines.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  for (const [tag, l] of lines) out.push(`<polyline points="${l.map((p) => `${X(p)},${Y(p)}`).join(' ')}" fill="none" stroke="${COLORS[tag]}" stroke-width="${tag === 'trunk' || tag === 'main' ? lw + 1 : lw}" stroke-linejoin="round" stroke-linecap="round" opacity="0.92"/>`);
  for (const t of side.terminals) out.push(`<circle cx="${X(t.point)}" cy="${Y(t.point)}" r="${sc >= 1 ? 5 : 4}" fill="#111" stroke="#fff" stroke-width="1.5"/>`);
  for (const r of scene.rooms) {
    if (!r.served && !r.area) continue;
    const id = r.id.replace('room-', '');
    const fs_ = sc >= 1 ? 17 : 14;
    out.push(`<text x="${X(r.label)}" y="${(+Y(r.label) - 8).toFixed(1)}" font-size="${fs_}" font-family="DejaVu Sans, sans-serif" font-weight="bold" text-anchor="middle" fill="${r.served ? '#000' : '#555'}" stroke="#fff" stroke-width="3.5" paint-order="stroke">${esc(r.served ? id : '(' + id + ')')}</text>`);
  }
  const s = side.start;
  out.push(`<rect x="${+X(s) - 11}" y="${+Y(s) - 11}" width="22" height="22" fill="#00c853" stroke="#000" stroke-width="2.5"/><text x="${+X(s) + 16}" y="${+Y(s) + 6}" font-size="18" font-weight="bold" font-family="DejaVu Sans, sans-serif" fill="#006b2d" stroke="#fff" stroke-width="3.5" paint-order="stroke">START</text>`);
  const head = `${scene.name} - ${side.label}`;
  const stats = `length ${m.lengthM.toFixed(1)} m | bends ${m.bends} (rooms ${m.bendsServed}, corridors ${m.bendsCorr}) | chained ${m.chained} | multi-entry ${m.multiEntry}`;
  const fh = sc >= 1 ? 26 : 20;
  const bar = `<rect x="0" y="0" width="${W}" height="${fh * 2.6}" fill="rgba(255,255,255,0.92)"/><text x="10" y="${fh * 1.1}" font-size="${fh}" font-weight="bold" font-family="DejaVu Sans, sans-serif">${esc(head)}</text><text x="10" y="${fh * 2.2}" font-size="${fh * 0.78}" font-family="DejaVu Sans, sans-serif">${esc(stats)}</text>`;
  // legend, bottom left
  const rows = legendRows(side);
  const extra = [['chained room (metric)', '#ff7a00'], ['room off the graph', '#d500f9']];
  const all = [...rows.map(([t, c]) => [t, c, 'line']), ...(side.hand ? [] : extra.map(([t, c]) => [t, c, 'box'])), ['terminal', '#111', 'dot']];
  const lh = 24, lx = Math.round(W * 0.3), ly = fh * 2.6 + 24;
  let leg = `<rect x="${lx - 6}" y="${ly - 8}" width="270" height="${all.length * lh + 14}" fill="rgba(255,255,255,0.9)" stroke="#999"/>`;
  all.forEach(([t, c, kind], i) => {
    const yy = ly + i * lh + 10;
    leg += kind === 'line' ? `<line x1="${lx}" y1="${yy}" x2="${lx + 34}" y2="${yy}" stroke="${c}" stroke-width="5"/>` : kind === 'box' ? `<rect x="${lx}" y="${yy - 7}" width="34" height="14" fill="none" stroke="${c}" stroke-width="3"/>` : `<circle cx="${lx + 17}" cy="${yy}" r="5" fill="${c}" stroke="#fff"/>`;
    leg += `<text x="${lx + 44}" y="${yy + 5}" font-size="15" font-family="DejaVu Sans, sans-serif">${esc(t)}</text>`;
  });
  // scale bar 10 m
  const barPx = (10000 / k) * sc;
  leg += `<g transform="translate(${W - barPx - 30},${H - 40})"><rect x="-8" y="-24" width="${barPx + 16}" height="48" fill="rgba(255,255,255,0.9)"/><line x1="0" y1="0" x2="${barPx}" y2="0" stroke="#000" stroke-width="4"/><text x="0" y="-8" font-size="15" font-family="DejaVu Sans, sans-serif">10 m</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">${out.join('')}${bar}${leg}</svg>`;
}

const bg = background();
const W = Math.round(cw * sc), H = Math.round(ch * sc);
const jobs = [];
if (mode === 'single') for (const side of scene.sides) jobs.push([side.label.replace(/\s+/g, '_'), [side]]);
else {
  const a = scene.sides.find((s) => s.label === labA), b = scene.sides.find((s) => s.label === labB);
  jobs.push([`${labA}-vs-${labB}`.replace(/\s+/g, '_'), [a, b]]);
}
const browser = await chromium.launch();
for (const [name, sides] of jobs) {
  const width = W * sides.length + 12 * (sides.length - 1);
  const html = `<html><body style="margin:0;background:#fff;display:flex;gap:12px;width:${width}px">${sides.map((s) => panel(s, bg)).join('')}</body></html>`;
  const page = await browser.newPage({ viewport: { width, height: H } });
  await page.setContent(html);
  const file = `${outPrefix}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  console.log(file, width, H);
}
await browser.close();
