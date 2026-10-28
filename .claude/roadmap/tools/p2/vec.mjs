import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/root/MepApp/.claude/worktrees/routing-feedback/packages/pdf-engine-mupdf/package.json');
const mupdf = await import(require.resolve('mupdf'));
const dir = '/root/MepApp/.claude/worktrees/routing-feedback/fixtures/pdfs/';
const out = '/tmp/claude-0/-root-MepApp--claude-worktrees-routing-feedback/4946bbd0-c4f1-4f63-99c6-5b34c429a21c/scratchpad/p2-analysis/';
const n = process.argv[2];
const doc = mupdf.Document.openDocument(fs.readFileSync(dir + n + '.pdf'), 'application/pdf');
const page = doc.loadPage(0);
const strokes = [];
const dev = new mupdf.Device({
  strokePath(path, stroke, ctm, cs, color, alpha) {
    const segs = [];
    let cur = null;
    path.walk({
      moveTo(x, y) { cur = [x, y]; segs.push({ t: 'M', p: [x, y] }); },
      lineTo(x, y) { segs.push({ t: 'L', p: [x, y] }); },
      curveTo(a, b, c, d, e, f) { segs.push({ t: 'C', p: [e, f] }); },
      closePath() { segs.push({ t: 'Z' }); },
    });
    const m = mupdf.Matrix.concat ? null : null;
    const tp = (p) => [ctm[0] * p[0] + ctm[2] * p[1] + ctm[4], ctm[1] * p[0] + ctm[3] * p[1] + ctm[5]];
    const pts = segs.map((s) => (s.p ? { t: s.t, p: tp(s.p) } : s));
    strokes.push({ color: color.map((v) => Math.round(v * 255)), w: stroke.getLineWidth ? stroke.getLineWidth() : null, pts });
  },
});
page.run(dev, mupdf.Matrix.identity);
const counts = {};
for (const s of strokes) { const k = s.color.join(','); counts[k] = (counts[k] || 0) + 1; }
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15));
fs.writeFileSync(out + n + '.strokes.json', JSON.stringify(strokes));
