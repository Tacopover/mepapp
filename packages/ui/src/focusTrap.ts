/** The index to focus after Tab (shift=false) or Shift+Tab (shift=true). -1 = no tabbable element: keep the focus on the dialog itself. current = index of the focused element in the list, or -1 when the focus is outside the list (then Tab goes to the first, Shift+Tab to the last). Wraps at both ends. */
export function nextTabIndex(count: number, current: number, shift: boolean): number {
  if (count === 0) return -1;
  if (current < 0 || current >= count) return shift ? count - 1 : 0;
  if (shift) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}

/** The open dialogs, last = topmost. */
const openDialogs: symbol[] = [];

export function pushDialog(id: symbol): void {
  if (openDialogs.includes(id)) return;
  openDialogs.push(id);
}

export function removeDialog(id: symbol): void {
  const index = openDialogs.indexOf(id);
  if (index >= 0) openDialogs.splice(index, 1);
}

export function isTopDialog(id: symbol): boolean {
  return openDialogs.length > 0 && openDialogs[openDialogs.length - 1] === id;
}
