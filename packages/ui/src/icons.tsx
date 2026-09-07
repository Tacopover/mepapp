// Minimal inline-SVG icon set for the toolbar/dock chrome — no icon package
// dependency, same approach the design mockup itself used (inline <symbol>
// defs), just as plain components instead.
import type { CSSProperties, ReactNode } from 'react';

export interface IconProps {
  size?: number;
  style?: CSSProperties;
}

function Svg({ size = 16, style, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none', display: 'block', ...style }}
    >
      {children}
    </svg>
  );
}

export const IconSelect = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 3v18l4.2-4 2.6 5.4 2.4-1.1-2.6-5.4L18 15.5z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconPan = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" />
  </Svg>
);

export const IconStamp = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8" />
    <rect x="9.4" y="7" width="1.8" height="4.5" fill="currentColor" stroke="none" />
    <rect x="12.8" y="7" width="1.8" height="4.5" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconSegment = (props: IconProps) => (
  <Svg {...props}>
    <line x1="4" y1="20" x2="20" y2="4" />
    <circle cx="4" cy="20" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="20" cy="4" r="1.8" />
  </Svg>
);

export const IconRuler = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="8" width="18" height="8" rx="1" />
    <path d="M6 8v3M9.5 8v3M13 8v3M16.5 8v3" />
  </Svg>
);

export const IconMeasure = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4" />
  </Svg>
);

export const IconChevDown = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const IconFile = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 2h9l5 5v15H6z" />
    <path d="M15 2v5h5" />
  </Svg>
);

export const IconDock = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <line x1="15" y1="4" x2="15" y2="20" />
  </Svg>
);

export const IconFloat = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" opacity={0.35} />
    <rect x="9" y="9" width="11" height="9" rx="1.5" />
  </Svg>
);

export const IconEyeOff = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 12c3-6.5 17-6.5 20 0-3 6.5-17 6.5-20 0z" />
    <circle cx="12" cy="12" r="3" />
    <line x1="3" y1="3" x2="21" y2="21" />
  </Svg>
);

export const IconGrip = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.5" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconUndo = (props: IconProps) => (
  <Svg {...props}>
    <path d="M9 7L4 12l5 5" />
    <path d="M4 12h11a5 5 0 0 1 0 10h-1" />
  </Svg>
);

export const IconRedo = (props: IconProps) => (
  <Svg {...props}>
    <path d="M15 7l5 5-5 5" />
    <path d="M20 12H9a5 5 0 0 0 0 10h1" />
  </Svg>
);

export const IconMenu = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Svg>
);

export const IconFlow = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 6h6a4 4 0 0 1 4 4v4a4 4 0 0 0 4 4h2" />
    <path d="M4 18h4M18 6h2" />
  </Svg>
);
