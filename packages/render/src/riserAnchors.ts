import type { Segment, Vec2 } from '@mepapp/core';

/** One free riser anchor on the shown page. The UI builds it. */
export interface RiserAnchor { riserId: string; label: string; networkTypeId: string; networkTypeName: string; anchorPt: Vec2 }

export type AnchorEndDecision =
  | { kind: 'join'; anchor: RiserAnchor }
  | { kind: 'blocked'; anchor: RiserAnchor; text: string };

/** Anchors whose network type has at least one of the given segments (the caller passes the segments of the shown page). Keeps the order. */
export function visibleRiserAnchors(anchors: readonly RiserAnchor[], segments: readonly Segment[]): RiserAnchor[] {
  const typeIds = new Set(segments.map((s) => s.networkTypeId));
  return anchors.filter((a) => typeIds.has(a.networkTypeId));
}

/** The nearest anchor within `radius` (inclusive, pt) of `point`, or null. */
export function anchorAtPoint(point: Vec2, anchors: readonly RiserAnchor[], radius: number): RiserAnchor | null {
  let best: RiserAnchor | null = null;
  let bestDistance = Infinity;
  for (const anchor of anchors) {
    const distance = Math.hypot(anchor.anchorPt.x - point.x, anchor.anchorPt.y - point.y);
    if (distance <= radius && distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best;
}

/** 'join' when segmentTypeId equals the anchor's networkTypeId, else 'blocked' with text from anchorRefusalText. */
export function decideAnchorEnd(anchor: RiserAnchor, segmentTypeId: string, segmentTypeName: string): AnchorEndDecision {
  if (segmentTypeId === anchor.networkTypeId) return { kind: 'join', anchor };
  return { kind: 'blocked', anchor, text: anchorRefusalText(anchor, segmentTypeName) };
}

/** Exactly: `${anchor.label} takes only ${anchor.networkTypeName}. This segment is ${segmentTypeName}.` */
export function anchorRefusalText(anchor: RiserAnchor, segmentTypeName: string): string {
  return `${anchor.label} takes only ${anchor.networkTypeName}. This segment is ${segmentTypeName}.`;
}
