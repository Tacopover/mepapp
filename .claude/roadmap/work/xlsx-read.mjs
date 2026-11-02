// Minimal .xlsx reader for the B2 browser checks: sheet names and the cell text of every row.
import fflate from '/root/MepApp/.claude/worktrees/buildings-model/node_modules/.pnpm/fflate@0.8.3/node_modules/fflate/lib/node.cjs';

const { unzipSync, strFromU8 } = fflate;
const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = (xml) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Returns { sheetNames: string[], sheets: Record<string, string[][]> } from the bytes of an .xlsx file. */
export function readXlsx(bytes) {
  const files = unzipSync(new Uint8Array(bytes));
  const get = (name) => (files[name] ? strFromU8(files[name]) : '');
  const shared = [...get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rels = new Map([...get('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1], /Target="([^"]+)"/.exec(m[0])?.[1]]));
  const sheetNames = [];
  const sheets = {};
  for (const m of get('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = unescapeXml(/name="([^"]*)"/.exec(m[0])[1]);
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const target = (rels.get(rid) ?? '').replace(/^\//, '');
    const path = target.startsWith('xl/') ? target : `xl/${target}`;
    const xml = get(path);
    const rows = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+\d+)"/.exec(c[1])?.[1];
        const type = /t="([^"]+)"/.exec(c[1])?.[1];
        const inner = c[2] ?? '';
        let value = '';
        if (type === 's') value = shared[Number(/<v>(\d+)<\/v>/.exec(inner)?.[1])] ?? '';
        else if (type === 'inlineStr') value = textOf(inner);
        else value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
        cells[ref ? colIndex(ref) : cells.length] = value;
      }
      rows.push(Array.from(cells, (v) => v ?? ''));
    }
    sheetNames.push(name);
    sheets[name] = rows;
  }
  return { sheetNames, sheets };
}
