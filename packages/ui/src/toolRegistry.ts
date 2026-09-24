// Single source of truth for the left rail's rows and every tool's
// icon/label — shared by Rail.tsx, which groups tools by row. See
// .claude/plans/ui-atlas-layout-mapping.md §3 for the design this encodes.
import type { ReactElement } from 'react';
import type { SketchTool } from '@mepapp/render';
import {
  IconBolt,
  IconPan,
  IconStamp,
  IconSegment,
  IconSnapAngle,
  IconConnection,
  IconFreehand,
  IconLineArrow,
  IconShape,
  IconTextbox,
  IconSticky,
  IconHighlight,
  IconPolyline,
  IconRuler,
  IconMeasure,
  type IconProps,
} from './icons.js';

export interface ToolEntry {
  /** Stable id, unique across every row — a real SketchTool's own id when `tool` is set, otherwise a UI-only placeholder id. */
  id: string;
  label: string;
  Icon: (props: IconProps) => ReactElement;
  /** The SketchTool this activates, or null for a reserved-but-not-yet-built slot (renders disabled, "Coming soon"). */
  tool: SketchTool | null;
}

export interface RailRow {
  id: string;
  /** First entry is the row's initial default before the user has picked anything in this session. */
  members: ToolEntry[];
  /** Pan: exactly one member, no chevron/flyout. */
  singleton?: boolean;
}

export const RAIL_ROWS: RailRow[] = [
  {
    id: 'pan',
    singleton: true,
    members: [{ id: 'pan', label: 'Pan', Icon: IconPan, tool: 'pan' }],
  },
  {
    // Terminal vs. Equipment is chosen in the MEP dock tab's stamp grid (CategorySwitcher),
    // not here — see Rail.tsx's isStampRow handling for why this stays a singleton.
    id: 'place',
    singleton: true,
    members: [{ id: 'stamp', label: 'Stamp', Icon: IconStamp, tool: 'place-terminal' }],
  },
  {
    id: 'draw-network',
    members: [
      { id: 'draw-segment', label: 'Segment', Icon: IconSegment, tool: 'draw-segment' },
      { id: 'snap-angle', label: 'Snap angle', Icon: IconSnapAngle, tool: null },
      { id: 'create-connection', label: 'Create connection', Icon: IconConnection, tool: null },
    ],
  },
  {
    id: 'annotate',
    members: [
      { id: 'draw-freehand', label: 'Freehand', Icon: IconFreehand, tool: 'draw-freehand' },
      { id: 'draw-line', label: 'Line/Arrow', Icon: IconLineArrow, tool: 'draw-line' },
      { id: 'draw-shape', label: 'Rectangle/Circle', Icon: IconShape, tool: 'draw-shape' },
      { id: 'draw-textbox', label: 'Textbox', Icon: IconTextbox, tool: 'draw-textbox' },
      { id: 'sticky-note', label: 'Sticky Note', Icon: IconSticky, tool: 'draw-sticky-note' },
      { id: 'text-highlight', label: 'Text Highlight', Icon: IconHighlight, tool: 'draw-highlight' },
      { id: 'polyline', label: 'Polyline', Icon: IconPolyline, tool: 'draw-polyline' },
    ],
  },
  {
    id: 'measure',
    members: [
      { id: 'calibrate', label: 'Calibrate', Icon: IconRuler, tool: 'calibrate' },
      { id: 'measure', label: 'Measure', Icon: IconMeasure, tool: 'measure' },
    ],
  },
  {
    // Circuits mode (electrical-circuits-model.md Phase E4). Rail.tsx lights this row for every tool in the circuits family, not just 'circuits'.
    id: 'circuits',
    singleton: true,
    members: [{ id: 'circuits', label: 'Circuits', Icon: IconBolt, tool: 'circuits' }],
  },
];
