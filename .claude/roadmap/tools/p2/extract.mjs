import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/root/MepApp/.claude/worktrees/routing-feedback/packages/pdf-engine-mupdf/package.json');
const mupdf = await import(require.resolve('mupdf'));
const dir = '/root/MepApp/.claude/worktrees/routing-feedback/fixtures/pdfs/';
const out = '/tmp/claude-0/-root-MepApp--claude-worktrees-routing-feedback/4946bbd0-c4f1-4f63-99c6-5b34c429a21c/scratchpad/p2-analysis/';
for (const n of ['00_arch_ground_floor_w_rooms', '00_arch_ground_floor_w_rooms_route', '00_arch_ground_floor_w_rooms_route_manual']) {
  const doc = mupdf.Document.openDocument(fs.readFileSync(dir + n + '.pdf'), 'application/pdf');
  const pdf = doc.asPDF();
  const names = pdf.getTrailer().get('Root').get('Names').get('EmbeddedFiles').get('Names');
  const spec = names.get(1);
  const ef = spec.get('EF').get('F');
  const buf = ef.readStream();
  fs.writeFileSync(out + n + '.json', buf.asString());
  console.log(n, buf.getLength());
}
