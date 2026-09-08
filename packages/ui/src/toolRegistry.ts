// Single source of truth for the left rail's rows and every tool's
// icon/label — shared by Rail.tsx (which groups tools by row) and
// QuickAccessStrip.tsx (which needs icon/label for whatever's in the MRU
// list, regardless of which row it came from). See
// .claude/plans/ui-atlas-layout-mapping.md §3 for the design this encodes.
import type { ReactElement } from 'react';
import type { SketchTool } from '@mepapp/render';
import {
  IconSelect,
  IconMove,
  IconCopy,
  IconRotate,
  IconTrash,
  IconPan,
  IconTerminal,
  IconEquipment,
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
    id: 'select-edit',
    members: [
      { id: 'select', label: 'Select', Icon: IconSelect, tool: 'select' },
      { id: 'move', label: 'Move', Icon: IconMove, tool: null },
      { id: 'copy', label: 'Copy', Icon: IconCopy, tool: null },
      { id: 'rotate', label: 'Rotate', Icon: IconRotate, tool: null },
      { id: 'delete', label: 'Delete', Icon: IconTrash, tool: null },
    ],
  },
  {
    id: 'pan',
    singleton: true,
    members: [{ id: 'pan', label: 'Pan', Icon: IconPan, tool: 'pan' }],
  },
  {
    id: 'place',
    members: [
      { id: 'place-terminal', label: 'Terminal', Icon: IconTerminal, tool: 'place-terminal' },
      { id: 'place-equipment', label: 'Equipment', Icon: IconEquipment, tool: 'place-equipment' },
    ],
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
      { id: 'draw-freehand', label: 'Freehand', Icon: IconFreehand, tool: null },
      { id: 'draw-line', label: 'Line/Arrow', Icon: IconLineArrow, tool: null },
      { id: 'draw-shape', label: 'Rectangle/Circle', Icon: IconShape, tool: null },
      { id: 'draw-textbox', label: 'Textbox', Icon: IconTextbox, tool: null },
      { id: 'sticky-note', label: 'Sticky Note', Icon: IconSticky, tool: null },
      { id: 'text-highlight', label: 'Text Highlight', Icon: IconHighlight, tool: null },
      { id: 'polyline', label: 'Polyline', Icon: IconPolyline, tool: null },
    ],
  },
  {
    id: 'measure',
    members: [
      { id: 'calibrate', label: 'Calibrate', Icon: IconRuler, tool: 'calibrate' },
      { id: 'measure', label: 'Measure', Icon: IconMeasure, tool: 'measure' },
    ],
  },
];

/** Flat SketchTool -> icon/label lookup, for the quick-access strip (its MRU list holds real SketchTool ids only — placeholders never activate, so they never appear there). */
export const TOOL_META: Partial<Record<SketchTool, { label: string; Icon: (props: IconProps) => ReactElement }>> = Object.fromEntries(
  RAIL_ROWS.flatMap((row) => row.members)
    .filter((m): m is ToolEntry & { tool: SketchTool } => m.tool !== null)
    .map((m) => [m.tool, { label: m.label, Icon: m.Icon }]),
);
