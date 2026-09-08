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

export const IconTerminal = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconEquipment = (props: IconProps) => (
  <Svg {...props}>
    <rect x="5" y="5" width="14" height="14" rx="1.5" />
    <path d="M9 5v14M15 5v14" />
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

export const IconClose = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 5l14 14M19 5L5 19" />
  </Svg>
);

// ---------- Left rail: Select & Edit flyout (Move/Copy/Rotate/Delete are
// placeholders — no owning spec yet, see toolRegistry.ts) ----------

export const IconMove = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3l3 3h-2v4h4V8l3 3-3 3v-2h-4v4h2l-3 3-3-3h2v-4H7v2l-3-3 3-3v2h4V6H9z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconCopy = (props: IconProps) => (
  <Svg {...props}>
    <rect x="8" y="8" width="12" height="12" rx="1.5" />
    <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
  </Svg>
);

export const IconRotate = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 12a8 8 0 1 1 2.6 5.9" />
    <path d="M4 17v-5h5" />
  </Svg>
);

export const IconTrash = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
    <path d="M6 7l1 13.5A1.5 1.5 0 0 0 8.5 22h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
    <path d="M10 11v7M14 11v7" />
  </Svg>
);

// ---------- Left rail chrome ----------

export const IconChevRight = (props: IconProps) => (
  <Svg {...props}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const IconPencil = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 20l1-4.2L16.2 4.6a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1L8.2 19 4 20z" />
    <path d="M14.5 6.3l3.2 3.2" />
  </Svg>
);

export const IconPlus = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconMinus = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 12h14" />
  </Svg>
);

// ---------- Left rail: Draw network flyout (Snap Angle/Create Connection
// are placeholders, owned by the concurrent drawing-tools Part B session) ----------

export const IconSnapAngle = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 20h16" />
    <path d="M4 20L16 6" />
    <path d="M9.5 20a5.5 5.5 0 0 1 1.7-4" />
  </Svg>
);

export const IconConnection = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="5.5" cy="18.5" r="2.2" />
    <circle cx="18.5" cy="5.5" r="2.2" />
    <path d="M7.3 16.7L16.7 7.3" strokeDasharray="2.5 2.5" />
  </Svg>
);

// ---------- Left rail: Annotate flyout (all placeholders — Part C, not
// started; draw-freehand/draw-line/draw-shape/draw-textbox names are
// pre-decided in drawing-tools-round-out-spec.md's D4, others aren't yet) ----------

export const IconFreehand = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 17c2-1 3-6 5-6s2 5 4 5 2-8 4-8 2 6 5 6" />
  </Svg>
);

export const IconLineArrow = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 19L19 5" />
    <path d="M11 5h8v8" />
  </Svg>
);

export const IconShape = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="9" width="10" height="10" rx="1" />
    <circle cx="16.5" cy="7.5" r="4.5" />
  </Svg>
);

export const IconTextbox = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <path d="M7 10h10M7 14h6" />
  </Svg>
);

export const IconSticky = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 4h13l3 3v13H4z" />
    <path d="M17 4v3h3" />
  </Svg>
);

export const IconHighlight = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 19h14" />
    <path d="M7 15l8-8 3 3-8 8-4 1z" />
  </Svg>
);

export const IconPolyline = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 18l5-9 5 4 6-9" />
    <circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="14" cy="13" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="20" cy="4" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
);
