import { useEffect, useRef, useState } from 'react';
import type { BuildingFile, BuildingSheet, SheetLocation } from '@mepapp/core';
import type { PdfEngine } from '@mepapp/pdf-engine';
import type { OpenedFile } from '@mepapp/platform';
import { pathOfTarget, readPdfInfo } from './buildingPdfInfo.js';
import { sheetPdfKey, sheetsOfSamePdf } from './buildingSheets.js';
import {
  changedPromptText,
  changedUseNotice,
  isChangedFile,
  lostPageNumbers,
  sheetChoice,
  sheetGroupsOfName,
  sheetWithNewFile,
  twoChangedText,
  type ChangedItem,
} from './changedFile.js';
import { RELINK_REFUSED, type SheetRelink } from './useSheetRelink.js';

export interface ChangedOffer {
  /** 'row': one PDF from a row pick. 'band': one or more PDFs from Reconnect (files or folder). */
  scope: 'row' | 'band';
  /** The row that started it (scope 'row'), else null. */
  sheetId: string | null;
  items: ChangedItem[];
}

interface ReadInfo {
  pageCount: number | null;
  projectUuid: string | null;
}

type FinishAnswer = { used: boolean; pdfs: number; sheets: number; names: string[]; items: ChangedItem[] };
type FinishFn = (answer: FinishAnswer) => { text: string; error: boolean };
type AfterUseFn = (sheet: BuildingSheet, useText: string) => Promise<void>;

/** `prompted`: a prompt shows. `extraText`: the sentences about files that were left out (read error, other document, two candidates). The caller joins them into its notice. */
export interface OfferFilesResult {
  prompted: boolean;
  extraText: string;
}

export interface ChangedFiles {
  offer: ChangedOffer | null;
  changedSheetIds: ReadonlySet<string>;
  /** Number of distinct PDFs (sheetPdfKey) among changedSheetIds. */
  changedPdfCount: number;
  /**
   * A changed file came from a row action. Reads it, then: different document -> relinker.relinkWith (the old question), else sets the offer.
   * `afterUse` runs after a successful "Use new file" (the row opens the sheet); it gets the sheet with the new size. Resolves when the offer is set (or the old question is shown or an error notice was shown).
   */
  offerRow: (sheet: BuildingSheet, opened: OpenedFile, afterUse: AfterUseFn) => Promise<void>;
  /**
   * Changed files from Reconnect (files or folder). Files that are not a changed file of the building are ignored.
   * Returns true when a prompt shows. Then `finish(answer)` gives the notice after the answer, and the caller shows no notice. Returns false when nothing waits: the caller shows its own notice.
   * Read errors give the notice `Could not read {name}: {message}` through onNotice; other-document files are left out and named by `finish` text: `{names} is a different document. Use Choose file… on its row.`
   */
  offerFiles: (opened: OpenedFile[], finish: FinishFn) => Promise<OfferFilesResult>;
  confirm: () => Promise<void>;
  cancel: () => void;
}

/** True when the Sheets pane shows the prompt of the offer. False means the dialog must show it. */
export function offerShownInSheetsPane(offer: ChangedOffer, file: BuildingFile, selectedLevelId: string | null, tab: string): boolean {
  if (tab !== 'levels') return false;
  if (offer.scope !== 'row' || selectedLevelId === null) return true;
  const sheet = file.sheets.find((item) => item.id === offer.sheetId);
  return sheet === undefined || sheet.levelId === selectedLevelId;
}

function locationOf(opened: OpenedFile): SheetLocation {
  const path = pathOfTarget(opened.target);
  return {
    fileName: opened.file.name,
    sizeBytes: opened.file.size,
    ...(path !== undefined ? { path } : {}),
  };
}

function sameFile(a: File, b: File): boolean {
  return a.size === b.size && a.lastModified === b.lastModified;
}

export function useChangedFile(args: {
  file: BuildingFile | null;
  engine: PdfEngine | undefined;
  relinker: SheetRelink;
  remember: ((opened: OpenedFile[]) => void) | undefined;
  onNotice: (text: string, error: boolean) => void;
}): ChangedFiles {
  const { file, engine, relinker, remember, onNotice } = args;
  const [offer, setOfferState] = useState<ChangedOffer | null>(null);
  const [changedSheetIds, setChangedSheetIds] = useState<ReadonlySet<string>>(new Set());
  const offerRef = useRef<ChangedOffer | null>(null);
  const afterUseRef = useRef<AfterUseFn | null>(null);
  const finishRef = useRef<FinishFn | null>(null);
  const fileRef = useRef(file);
  fileRef.current = file;

  function setOffer(next: ChangedOffer | null, afterUse: AfterUseFn | null, finish: FinishFn | null) {
    offerRef.current = next;
    afterUseRef.current = afterUse;
    finishRef.current = finish;
    setOfferState(next);
  }

  async function read(opened: OpenedFile, errors?: string[]): Promise<ReadInfo | undefined> {
    if (engine === undefined) return { pageCount: null, projectUuid: null };
    try {
      return await readPdfInfo(opened.file, engine);
    } catch (err) {
      const text = `Could not read ${opened.file.name}: ${(err as Error).message}`;
      if (errors !== undefined) errors.push(text);
      else onNotice(text, true);
      return undefined;
    }
  }

  function buildItem(f: BuildingFile, sheets: BuildingSheet[], opened: OpenedFile, info: ReadInfo): ChangedItem {
    const same = sheetsOfSamePdf(f, sheets[0]!);
    const pageCount = info.pageCount;
    return {
      fileName: opened.file.name,
      opened,
      sheetIds: same.map((sheet) => sheet.id),
      projectUuid: info.projectUuid,
      pageCount,
      lostPages: pageCount === null ? [] : lostPageNumbers(same, pageCount),
    };
  }

  async function offerRow(sheet: BuildingSheet, opened: OpenedFile, afterUse: AfterUseFn) {
    if (file === null) return;
    if (!isChangedFile(file, opened.file.name, opened.file.size) || sheet.location.fileName !== opened.file.name) return;
    const info = await read(opened);
    if (info === undefined) return;
    if (relinker.isOtherDocument(sheet, info.projectUuid)) {
      await relinker.relinkWith(sheet, 'sheets', opened);
      return;
    }
    const item = buildItem(file, [sheet], opened, info);
    setOffer({ scope: 'row', sheetId: sheet.id, items: [item] }, afterUse, null);
  }

  async function offerFiles(openedFiles: OpenedFile[], finish: FinishFn): Promise<OfferFilesResult> {
    if (file === null) return { prompted: false, extraText: '' };
    const byName = new Map<string, OpenedFile[]>();
    for (const opened of openedFiles) {
      if (!isChangedFile(file, opened.file.name, opened.file.size)) continue;
      const list = byName.get(opened.file.name) ?? [];
      list.push(opened);
      byName.set(opened.file.name, list);
    }
    const twoNames: string[] = [];
    const otherNames: string[] = [];
    const readErrors: string[] = [];
    const items: ChangedItem[] = [];
    for (const [name, list] of byName) {
      if (list.some((other) => !sameFile(other.file, list[0]!.file))) {
        twoNames.push(name);
        continue;
      }
      const groups = sheetGroupsOfName(file, name);
      if (groups.length !== 1) {
        twoNames.push(name);
        continue;
      }
      const opened = list[0]!;
      const info = await read(opened, readErrors);
      if (info === undefined) continue;
      if (relinker.isOtherDocument(groups[0]![0]!, info.projectUuid)) {
        otherNames.push(name);
        continue;
      }
      items.push(buildItem(file, groups[0]!, opened, info));
    }
    const extras: string[] = [...readErrors];
    if (otherNames.length > 0) {
      extras.push(
        `${otherNames.join(', ')} ${otherNames.length === 1 ? 'is' : 'are'} a different document. Use Choose file… on its row.`,
      );
    }
    if (twoNames.length > 0) extras.push(twoChangedText(twoNames, 'picked'));
    const extraText = extras.join(' ');
    if (items.length === 0) return { prompted: false, extraText };
    const wrapped: FinishFn = (answer) => {
      const result = finish(answer);
      return extraText === '' ? result : { text: `${result.text} ${extraText}`, error: result.error };
    };
    setOffer({ scope: 'band', sheetId: null, items }, null, wrapped);
    return { prompted: true, extraText };
  }

  function dropIds(ids: readonly string[]) {
    setChangedSheetIds((current) => {
      if (!ids.some((id) => current.has(id))) return current;
      const next = new Set(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  async function confirm() {
    const current = offerRef.current;
    const afterUse = afterUseRef.current;
    const finish = finishRef.current;
    setOffer(null, null, null);
    if (current === null) return;
    const used: ChangedItem[] = [];
    let refused = false;
    for (const item of current.items) {
      const latest = fileRef.current;
      const sheet = latest === null ? undefined : sheetChoice(latest, item.sheetIds, current.sheetId);
      if (sheet === undefined) break;
      const done = await relinker.applyNewFile(sheet, locationOf(item.opened), item.projectUuid ?? undefined);
      if (!done) {
        refused = true;
        break;
      }
      used.push(item);
    }
    const rest = current.items.slice(used.length);
    if (rest.length > 0) {
      const ids = rest.flatMap((item) => item.sheetIds);
      setChangedSheetIds((existing) => new Set([...existing, ...ids]));
    }
    if (used.length > 0) {
      remember?.(used.map((item) => item.opened));
      dropIds(used.flatMap((item) => item.sheetIds));
    }
    if (current.scope === 'row') {
      if (used.length === 0) return;
      const item = used[0]!;
      const latest = fileRef.current;
      const sheet = latest === null ? undefined : sheetChoice(latest, item.sheetIds, current.sheetId);
      if (sheet !== undefined && afterUse !== null) await afterUse(sheetWithNewFile(sheet, item), changedUseNotice(item));
      return;
    }
    if (finish === null) return;
    const result =
      used.length === 0
        ? null
        : finish({
            used: true,
            pdfs: used.length,
            sheets: used.reduce((total, item) => total + item.sheetIds.length, 0),
            names: used.map((item) => item.fileName),
            items: used,
          });
    if (refused) onNotice(result === null ? RELINK_REFUSED : `${result.text} ${RELINK_REFUSED}`, true);
    else if (result !== null) onNotice(result.text, result.error);
  }

  function cancel() {
    const current = offerRef.current;
    const finish = finishRef.current;
    setOffer(null, null, null);
    if (current === null) return;
    const ids = current.items.flatMap((item) => item.sheetIds);
    setChangedSheetIds((existing) => new Set([...existing, ...ids]));
    if (current.scope === 'band' && finish !== null) {
      const sheets = ids.length;
      const result = finish({ used: false, pdfs: current.items.length, sheets, names: current.items.map((item) => item.fileName), items: current.items });
      onNotice(result.text, result.error);
    }
  }

  const changedPdfCount =
    file === null ? 0 : new Set(file.sheets.filter((sheet) => changedSheetIds.has(sheet.id)).map((sheet) => sheetPdfKey(sheet))).size;

  return { offer, changedSheetIds, changedPdfCount, offerRow, offerFiles, confirm, cancel };
}

/** The question after a changed file was found. */
export function ChangedFileConfirm({ offer, onYes, onNo }: { offer: ChangedOffer; onYes: () => void; onNo: () => void }) {
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    yesRef.current?.focus();
  }, []);
  return (
    <div
      className="mep-buildings-actions"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onNo();
      }}
    >
      <p className="mep-hint" role="status" data-testid="changed-confirm">
        {changedPromptText(offer.items)}
      </p>
      <button ref={yesRef} type="button" data-testid="changed-confirm-yes" onClick={onYes}>
        {offer.items.length === 1 ? 'Use new file' : 'Use new files'}
      </button>
      <button type="button" data-testid="changed-confirm-cancel" onClick={onNo}>
        Cancel
      </button>
    </div>
  );
}
