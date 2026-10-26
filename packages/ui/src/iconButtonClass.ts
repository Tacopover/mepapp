export function iconButtonClass(pressed?: boolean, extra?: string): string {
  return 'mep-icon-button' +(pressed ? ' on' : '') + (extra ? ' ' + extra : '');
}

export function iconToggleClass(checked: boolean, disabled?: boolean): string {
  return 'mep-icon-toggle' + (checked ? ' on' : '') + (disabled ? ' disabled' : '');
}
