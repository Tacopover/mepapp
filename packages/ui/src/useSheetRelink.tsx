import { useState } from 'react';
import { relinkSheet, type BuildingFile, type BuildingSheet, type SheetLocation } from '@mepapp/core';
import type { PdfEngine } from '@mepapp/pdf-engine';
import type { FileAccess } from '@mepapp/platform';
import { BUILDING_PDF_TYPES, pathOfTarget, readPdfInfo } from './buildingPdfInfo.js';
import { relinkWouldDuplicate, sheetsOfSamePdf } from './buildingSheets.js';

interface RelinkAsk {
  sheetId: string;
  /** Which list asked: the sheets list or the repair list. Each list shows its own question. */
  origin: string;
  location: SheetLocation;
  projectUuid: string;
  pickedName: string;
}

const RELINK_REFUSED = 'Could not relink: another sheet already uses this document and page.';

export interface SheetRelink {
  /** Picks a new file for the sheet. A relink changes every sheet of the same PDF, also the sheets on other levels. */
  relink: (sheet: BuildingSheet, origin: string) => Promise<void>;
  /** The open question (a different document was picked) for this origin and sheet, else null. */
  askFor: (sheetId: string, origin: string) => { pickedName: string } | null;
  confirm: () => Promise<void>;
  cancel: () => void;
}

/** The relink action of a sheet, shared by the sheets list and the repair list. */
export function useSheetRelink(args: {
  file: BuildingFile | null;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  fileAccess: FileAccess;
  engine: PdfEngine | undefined;
  onNotice: (text: string, error: boolean) => void;
}): SheetRelink {
  const { file, update, fileAccess, engine, onNotice } = args;
  const [ask, setAsk] = useState<RelinkAsk | null>(null);

  async function relink(sheet: BuildingSheet, origin: string) {
    if (file === null) return;
    const picked = await fileAccess.openFile(BUILDING_PDF_TYPES).catch((err: unknown) => {
      onNotice(`Could not open the file picker: ${(err as Error).message}`, true);
      return undefined;
    });
    if (picked === undefined) return;
    const path = pathOfTarget(picked.target);
    const location: SheetLocation = {
      fileName: picked.file.name,
      sizeBytes: picked.file.size,
      ...(path !== undefined ? { path } : {}),
    };
    let projectUuid: string | null = null;
    if (engine !== undefined) {
      try {
        projectUuid = (await readPdfInfo(picked.file, engine)).projectUuid;
      } catch (err) {
        onNotice(`Could not read ${picked.file.name}: ${(err as Error).message}`, true);
        return;
      }
    }
    if (
      projectUuid !== null &&
      sheetsOfSamePdf(file, sheet).some((other) => other.projectUuid !== null && other.projectUuid !== projectUuid)
    ) {
      setAsk({ sheetId: sheet.id, origin, location, projectUuid, pickedName: picked.file.name });
      return;
    }
    await applyRelink(sheet, location, projectUuid ?? undefined);
  }

  async function applyRelink(sheet: BuildingSheet, location: SheetLocation, projectUuid: string | undefined) {
    if (file === null) return;
    const ids = sheetsOfSamePdf(file, sheet).map((item) => item.id);
    if (relinkWouldDuplicate(file, ids, projectUuid)) {
      setAsk(null);
      onNotice(RELINK_REFUSED, true);
      return;
    }
    let refused = false;
    await update((f) =>
      ids.reduce((acc, id) => {
        const result = relinkSheet(acc, id, location, projectUuid);
        if (!result.ok) {
          refused = true;
          return acc;
        }
        return result.file;
      }, f),
    );
    if (refused) {
      onNotice(RELINK_REFUSED, true);
      return;
    }
    onNotice(`Relinked ${location.fileName}.`, false);
  }

  async function confirm() {
    const current = ask;
    setAsk(null);
    if (current === null || file === null) return;
    const sheet = file.sheets.find((item) => item.id === current.sheetId);
    if (sheet === undefined) return;
    await applyRelink(sheet, current.location, current.projectUuid);
  }

  return {
    relink,
    askFor: (sheetId, origin) => (ask !== null && ask.sheetId === sheetId && ask.origin === origin ? { pickedName: ask.pickedName } : null),
    confirm,
    cancel: () => setAsk(null),
  };
}

/** The question after a relink to a different document. */
export function RelinkConfirm({ relinker, sheet, askedName }: { relinker: SheetRelink; sheet: BuildingSheet; askedName: string }) {
  return (
    <div className="mep-buildings-actions">
      <p className="mep-hint" data-testid="relink-confirm">
        The file "{askedName}" is a different document than the sheets of {sheet.location.fileName}. Relink the sheets to it? They keep
        their levels.
      </p>
      <button type="button" onClick={() => void relinker.confirm()}>
        Relink to this file
      </button>
      <button type="button" onClick={() => relinker.cancel()}>
        Cancel
      </button>
    </div>
  );
}
