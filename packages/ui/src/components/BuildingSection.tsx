import type { ReactNode } from 'react';

export interface BuildingSectionProps {
  title: string;
  /** A small word before the title, for example "Level". */
  kind?: string;
  /** The count or the action at the right of the title bar. */
  aside?: ReactNode;
  testId?: string;
  /** A quiet section: smaller type and smaller buttons (the Add files strip). */
  quiet?: boolean;
  children: ReactNode;
}

/** One section of the right pane of the Building dialog: a title bar (title left, count or action right) and a body. */
export function BuildingSection({ title, kind, aside, testId, quiet = false, children }: BuildingSectionProps) {
  return (
    <section className={quiet ? 'mep-bsec mep-bsec--quiet' : 'mep-bsec'} data-testid={testId}>
      <header className="mep-bsec-head">
        <div className="mep-bsec-titles">
          {kind !== undefined && <span className="mep-bsec-kind">{kind}</span>}
          <h4 title={title}>{title}</h4>
        </div>
        {aside !== undefined && <div className="mep-bsec-aside">{aside}</div>}
      </header>
      <div className="mep-bsec-body">{children}</div>
    </section>
  );
}
