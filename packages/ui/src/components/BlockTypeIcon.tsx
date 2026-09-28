import type { ReactNode } from 'react';
import type { SchematicBlockType } from '@mepapp/core';

// A small glyph for each block type, for the template editor's palette and outline. Same stroke style as icons.tsx.

const GLYPHS: Record<SchematicBlockType, ReactNode> = {
  legend: (
    <>
      <rect x={3} y={9} width={6} height={6} />
      <path d="M12 12h9" />
    </>
  ),
  titleBlock: (
    <>
      <rect x={3} y={5} width={18} height={14} />
      <path d="M3 10h18M11 10v9" />
    </>
  ),
  freeItem: <path d="M6 6h12M12 6v13" />,
  drawing: <path d="M4 17c3-8 6 4 9-3s5-6 7-4" />,
  feedCable: <path d="M12 3v13M8 12l4 4 4-4M5 20h14" />,
  mainDevice: (
    <>
      <path d="M12 3v5M12 17v4M9 8l6 9" />
      <circle cx={12} cy={8} r={1} />
    </>
  ),
  accessoryDevice: (
    <>
      <circle cx={12} cy={12} r={6} />
      <path d="M12 3v3M12 18v3" />
    </>
  ),
  busbar: <rect x={3} y={10} width={18} height={4} fill="currentColor" />,
  section: (
    <>
      <rect x={3} y={5} width={18} height={14} strokeDasharray="3 2" />
      <path d="M6 9h6" />
    </>
  ),
  frame: (
    <>
      <rect x={2.5} y={3.5} width={19} height={17} />
      <rect x={5.5} y={6.5} width={13} height={11} strokeDasharray="3 2" />
    </>
  ),
  circuitNumber: <path d="M10 4l-2 16M16 4l-2 16M5 9h15M4 15h15" />,
  protectiveDevice: (
    <>
      <rect x={7} y={7} width={10} height={10} />
      <path d="M7 17L17 7M12 3v4M12 17v4" />
    </>
  ),
  phaseLabel: (
    <text x={12} y={16} fontSize={11} fontWeight={700} textAnchor="middle" fill="currentColor" stroke="none" fontFamily="Arial, Helvetica, sans-serif">
      L1
    </text>
  ),
  conductor: <path d="M3 12h18M9 8l-2 8M13 8l-2 8M17 8l-2 8" />,
  cableText: <path d="M3 8h18M3 13h14M3 18h9" />,
  loadSymbol: (
    <>
      <path d="M3 12h9" />
      <path d="M12 7l8 5-8 5z" fill="currentColor" />
    </>
  ),
  description: <path d="M4 8h16M4 12h16M4 16h10" />,
  customAnnotation: <path d="M4 5h16v11H9l-4 4z" />,
  countCell: (
    <>
      <rect x={3} y={7} width={18} height={10} />
      <path d="M10 7v10" />
    </>
  ),
  derivedCell: (
    <>
      <rect x={3} y={7} width={18} height={10} />
      <path d="M9.5 14.5l5-5" />
      <circle cx={9.5} cy={10} r={0.8} />
      <circle cx={14.5} cy={14} r={0.8} />
    </>
  ),
  aggregateCell: <path d="M17 5H7l6 7-6 7h10" />,
  totalsTable: (
    <>
      <rect x={3} y={4} width={18} height={16} />
      <path d="M3 9h18M3 14h18M11 4v16" />
    </>
  ),
};

export function BlockTypeIcon({ type, size = 18 }: { type: SchematicBlockType; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none', display: 'block' }}>
      {GLYPHS[type]}
    </svg>
  );
}
