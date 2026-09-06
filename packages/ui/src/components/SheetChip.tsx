import { IconFile } from '../icons.js';

export interface SheetChipProps {
  sheetName: string | null;
}

/**
 * A single, real "current sheet" indicator — not a multi-sheet switcher.
 * Multi-page PDF loading is still a real @mepapp/pdf-engine gap (see the
 * implementation plan's open questions): onLoadPdfPage loads one page from
 * one File, so there is no SheetSummary[] to switch between yet. Showing
 * the one real loaded sheet is preferred over a fabricated sheet list.
 */
export function SheetChip({ sheetName }: SheetChipProps) {
  return (
    <div className="mep-sheet-chip">
      <IconFile size={13} />
      {sheetName ?? 'No sheet loaded'}
    </div>
  );
}
