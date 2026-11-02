import type { BuildingSheet } from '@mepapp/core';
import type { PathState } from '@mepapp/platform';

export type SheetStatus = 'ok' | 'pdf-missing' | 'no-access' | 'not-stamped' | 'no-summary' | 'old-summary' | 'copy-suspected';

/** state 'unknown' = the platform cannot probe the file (no path, or no statPath). */
export interface SheetProbe {
  state: PathState | 'unknown';
  sizeBytes?: number;
}

/** missing -> 'pdf-missing'; no-access -> 'no-access'; else projectUuid null -> 'not-stamped'; no summary -> 'no-summary'; probe.sizeBytes known and different from summary.sourceSizeBytes -> 'old-summary'; else 'ok'. 'copy-suspected' is never returned here (reserved). */
export function sheetStatusOf(
  sheet: BuildingSheet,
  probe: SheetProbe,
  summary: { savedAt: string; sourceSizeBytes: number } | undefined,
): SheetStatus {
  if (probe.state === 'missing') return 'pdf-missing';
  if (probe.state === 'no-access') return 'no-access';
  if (sheet.projectUuid === null) return 'not-stamped';
  if (summary === undefined) return 'no-summary';
  if (probe.sizeBytes !== undefined && probe.sizeBytes !== summary.sourceSizeBytes) return 'old-summary';
  return 'ok';
}

export function statusLabel(status: SheetStatus): string {
  switch (status) {
    case 'ok':
      return 'OK';
    case 'pdf-missing':
      return 'PDF missing';
    case 'no-access':
      return 'No access to the PDF';
    case 'not-stamped':
      return 'Not stamped yet. Open and save it in MepApp.';
    case 'no-summary':
      return 'No summary yet';
    case 'old-summary':
      return 'Summary is out of date';
    case 'copy-suspected':
      return 'May be a copy of another file';
  }
}

export function statusTone(status: SheetStatus): 'ok' | 'warn' | 'bad' {
  switch (status) {
    case 'ok':
      return 'ok';
    case 'pdf-missing':
    case 'no-access':
      return 'bad';
    case 'not-stamped':
    case 'no-summary':
    case 'old-summary':
    case 'copy-suspected':
      return 'warn';
  }
}
