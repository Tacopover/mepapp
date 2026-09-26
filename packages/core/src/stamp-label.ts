// Canvas labels on placed stamps (label-feature.md §6): one label shows one
// stamp property (see stamp-properties.ts), anchored at a point on the stamp.
// A layout is defined per stamp definition and stored on the project, so
// library and custom definitions both get labels. No rendering here — only
// the data shape, the text, and where the text goes.

import { applyMatrix, composeTransform, type Vec2 } from './geometry.js';
import type { PlacedStamp } from './stamp.js';
import { resolveStampProperty, type StampPropertyContext } from './stamp-properties.js';

export interface StampLabel {
  id: string;
  /** A key from stamp-properties.ts, for example 'circuit:label' or 'custom:Power'. */
  propertyKey: string;
  prefix?: string;
  suffix?: string;
  /** Anchor as a fraction of the stamp's unrotated width and height, same convention as PortSpec. 0,0 = top-left. */
  anchorX: number;
  anchorY: number;
  /** In PDF points (world units). */
  fontSize: number;
  /** '#rrggbb' */
  textColor: string;
  /** '#rrggbbaa'; undefined = no background. */
  background?: string;
  /** '#rrggbbaa'; undefined = no border. */
  border?: string;
}

/** Label layout per stamp definition id. */
export type StampLabelLayouts = Record<string, StampLabel[]>;

/** The old app's label defaults (MepElementLabel.cs), converted from ARGB to RGBA. */
export const DEFAULT_STAMP_LABEL_STYLE: Pick<StampLabel, 'fontSize' | 'textColor' | 'background' | 'border'> = {
  fontSize: 9,
  textColor: '#282828',
  background: '#ffffdcc8',
  border: '#505050b4',
};

export type StampLabelAlign = 'left' | 'center' | 'right';

export interface StampLabelPlacement {
  /** World position of the anchor. */
  anchor: Vec2;
  /** Which side of the anchor the text sits on: 'right' = the text ends at the anchor (sits to its left). Vertically the text is always centered on the anchor. */
  align: StampLabelAlign;
}

/** Share of the stamp's larger world side inside which a rotated anchor counts as centered (the old app's 2% dead zone). */
const CENTER_DEAD_ZONE = 0.02;

/**
 * Where a label's text goes: the anchor rotates (and mirrors) with the
 * stamp, the text itself stays horizontal. After rotation, an anchor left of
 * the stamp center right-aligns the text, one right of it left-aligns it, so
 * the text grows away from the stamp — ported from the old app's
 * ElementLabelOverlay side justification.
 */
export function computeStampLabelPlacement(stamp: PlacedStamp, label: Pick<StampLabel, 'anchorX' | 'anchorY'>): StampLabelPlacement {
  const local = { x: (label.anchorX - 0.5) * stamp.nativeWidth, y: (label.anchorY - 0.5) * stamp.nativeHeight };
  const anchor = applyMatrix(composeTransform(stamp.transform), local);
  const offsetX = anchor.x - stamp.transform.position.x;
  const size = Math.max(stamp.nativeWidth * Math.abs(stamp.transform.scale.x), stamp.nativeHeight * Math.abs(stamp.transform.scale.y));
  const deadZone = size * CENTER_DEAD_ZONE;
  const align: StampLabelAlign = offsetX < -deadZone ? 'right' : offsetX > deadZone ? 'left' : 'center';
  return { anchor, align };
}

/** The label's full text, or null when the property has no value for this stamp (the label then draws nothing). */
export function resolveStampLabelText(ctx: StampPropertyContext, stamp: PlacedStamp, label: Pick<StampLabel, 'propertyKey' | 'prefix' | 'suffix'>): string | null {
  const value = resolveStampProperty(ctx, stamp, label.propertyKey);
  if (value === null) return null;
  return `${label.prefix ?? ''}${value}${label.suffix ?? ''}`;
}
