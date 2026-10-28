import { createRequire } from 'node:module';
import fs from 'node:fs';
import zlib from 'node:zlib';
const require = createRequire('/root/MepApp/.claude/worktrees/routing-feedback/packages/pdf-engine-mupdf/package.json');
const mupdf = await import(require.resolve('mupdf'));
const dir = '/root/MepApp/.claude/worktrees/routing-feedback/fixtures/pdfs/';
const out = '/tmp/claude-0/-root-MepApp--claude-worktrees-routing-feedback/4946bbd0-c4f1-4f63-99c6-5b34c429a21c/scratchpad/p2-analysis/';
const [name, x0, y0, x1, y1, sc] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], +process.argv[6], +process.argv[7]];
const files = ['00_arch_ground_floor_w_rooms_route_manual', '00_arch_ground_floor_w_rooms_route'];
const W = Math.round((x1 - x0) * sc), H = Math.round((y1 - y0) * sc);
const gap = 12;
const TW = W * 2 + gap;
const buf = Buffer.alloc(TW * H * 3, 255);
files.forEach((f, idx) => {
  const doc = mupdf.Document.openDocument(fs.readFileSync(dir + f + '.pdf'), 'application/pdf');
  const page = doc.loadPage(0);
  const pm = page.toPixmap(mupdf.Matrix.scale(sc, sc), mupdf.ColorSpace.DeviceRGB, false, true);
  const sp = pm.getPixels();
  const ss = pm.getStride();
  const n = pm.getNumberOfComponents();
  const ox = Math.round(x0 * sc), oy = Math.round(y0 * sc);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const si = (y + oy) * ss + (x + ox) * n;
      const di = (y * TW + x + idx * (W + gap)) * 3;
      buf[di] = sp[si]; buf[di + 1] = sp[si + 1]; buf[di + 2] = sp[si + 2];
    }
  }
});
// minimal PNG encoder
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc((TW * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (TW * 3 + 1)] = 0; buf.copy(raw, y * (TW * 3 + 1) + 1, y * TW * 3, (y + 1) * TW * 3); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(TW, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(out + name + '.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(name, TW, H);
