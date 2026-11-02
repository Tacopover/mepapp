import { describe, expect, it } from 'vitest';
import type { PdfEngine } from '@mepapp/pdf-engine';
import { BUILDING_PDF_TYPES, joinFolderPath, pathOfTarget, readPdfInfo } from './buildingPdfInfo.js';

const projectText = (projectUuid: string): string => JSON.stringify({ projectUuid });

interface StubOptions {
  pages?: number;
  embedded?: string | null;
  embeddedThrows?: boolean;
  openRejects?: Error;
}

function stubEngine(options: StubOptions) {
  const state = { closed: 0 };
  const engine = {
    async openDocument() {
      if (options.openRejects) throw options.openRejects;
      return {
        getPageCount: () => options.pages ?? 3,
        getPageInfo: () => ({ widthPt: 595, heightPt: 842, rotationDegrees: 0 }),
        getEmbeddedFile: async (name: string) => {
          expect(name).toBe('mepapp-project.json');
          if (options.embeddedThrows) throw new Error('broken embedded file');
          const text = options.embedded ?? null;
          return text === null ? null : new TextEncoder().encode(text);
        },
        close: () => {
          state.closed += 1;
        },
      };
    },
  };
  return { engine: engine as unknown as PdfEngine, state };
}

const pdfFile = () => new File(['%PDF-1.7'], 'A101.pdf', { type: 'application/pdf' });

describe('BUILDING_PDF_TYPES', () => {
  it('accepts PDF files only', () => {
    expect(BUILDING_PDF_TYPES).toEqual([{ description: 'PDF', mimeType: 'application/pdf', extensions: ['pdf'] }]);
  });
});

describe('readPdfInfo', () => {
  it('reads the page count and the project id and closes the handle', async () => {
    const { engine, state } = stubEngine({ pages: 4, embedded: projectText('11111111-2222-3333-4444-555555555555') });
    const info = await readPdfInfo(pdfFile(), engine);
    expect(info).toEqual({ pageCount: 4, projectUuid: '11111111-2222-3333-4444-555555555555' });
    expect(state.closed).toBe(1);
  });

  it('returns a null project id when the file has no embedded project', async () => {
    const { engine, state } = stubEngine({ pages: 2, embedded: null });
    expect(await readPdfInfo(pdfFile(), engine)).toEqual({ pageCount: 2, projectUuid: null });
    expect(state.closed).toBe(1);
  });

  it('returns a null project id for a bad id', async () => {
    const { engine } = stubEngine({ embedded: projectText('NOT-A-UUID') });
    expect(await readPdfInfo(pdfFile(), engine)).toEqual({ pageCount: 3, projectUuid: null });
  });

  it('returns a null project id for invalid JSON', async () => {
    const { engine } = stubEngine({ embedded: '{not json' });
    expect(await readPdfInfo(pdfFile(), engine)).toEqual({ pageCount: 3, projectUuid: null });
  });

  it('closes the handle and passes the error on when the embedded file read throws', async () => {
    const { engine, state } = stubEngine({ embeddedThrows: true });
    await expect(readPdfInfo(pdfFile(), engine)).rejects.toThrow('broken embedded file');
    expect(state.closed).toBe(1);
  });

  it('passes the engine error on when the document does not open', async () => {
    const { engine } = stubEngine({ openRejects: new Error('not a PDF') });
    await expect(readPdfInfo(pdfFile(), engine)).rejects.toThrow('not a PDF');
  });
});

describe('pathOfTarget', () => {
  it('returns the path of a desktop target', () => {
    expect(pathOfTarget({ name: 'a.pdf', path: 'C:\\x\\a.pdf' } as { name: string })).toBe('C:\\x\\a.pdf');
  });

  it('returns undefined for a web target without a path', () => {
    expect(pathOfTarget({ name: 'a.pdf' })).toBeUndefined();
  });

  it('returns undefined when there is no target', () => {
    expect(pathOfTarget(undefined)).toBeUndefined();
  });
});

describe('joinFolderPath', () => {
  it('joins with a backslash for a Windows folder', () => {
    expect(joinFolderPath('C:\\plans', 'a.pdf')).toBe('C:\\plans\\a.pdf');
  });

  it('joins with a slash for a POSIX folder', () => {
    expect(joinFolderPath('/home/a', 'a.pdf')).toBe('/home/a/a.pdf');
  });

  it('does not double the slash when the folder already ends with one', () => {
    expect(joinFolderPath('/home/a/', 'a.pdf')).toBe('/home/a/a.pdf');
  });

  it('does not double the backslash when the Windows folder already ends with one', () => {
    expect(joinFolderPath('C:\\plans\\', 'a.pdf')).toBe('C:\\plans\\a.pdf');
  });
});
