import type { ReactElement } from 'react';
import { IconSeverityError, IconSeverityInfo, IconSeverityWarning } from '../icons.js';

export function SeverityMark({ severity }: { severity: 'error' | 'warning' | 'info' }): ReactElement {
  const label = severity === 'error' ? 'Error' : severity === 'warning' ? 'Warning' : 'Note';
  const Icon = severity === 'error' ? IconSeverityError : severity === 'warning' ? IconSeverityWarning : IconSeverityInfo;
  return (
    <span className={`mep-severity mep-severity--${severity}`} role="img" aria-label={label} title={label}>
      <Icon size={14} />
    </span>
  );
}
