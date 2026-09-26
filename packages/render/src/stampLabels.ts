import { Container, Graphics, Text } from 'pixi.js';
import {
  computeStampLabelPlacement,
  resolveStampLabelText,
  type PlacedStamp,
  type StampLabel,
  type StampLabelLayouts,
  type StampPropertyContext,
} from '@mepapp/core';
import type { LabelNode } from './document.js';

/** Label text is laid out at this multiple of its world font size, then scaled back down — a 9 pt Text at world scale is a 9 px texture, blurry as soon as the view zooms in. */
const TEXT_OVERSAMPLE = 4;
const PADDING_X_PT = 3;
const PADDING_Y_PT = 1;
const CORNER_RADIUS_PT = 2;
const BORDER_WIDTH_PT = 0.5;

/** '#rrggbb' or '#rrggbbaa' → PixiJS color and alpha. */
function parseColor(hex: string): { color: string; alpha: number } {
  const alpha = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  return { color: hex.slice(0, 7), alpha };
}

function createNode(): LabelNode {
  const container = new Container();
  const box = new Graphics();
  const text = new Text({ text: '', style: { fontFamily: 'Arial', fontWeight: '600' } });
  text.scale.set(1 / TEXT_OVERSAMPLE);
  container.addChild(box, text);
  return { container, box, text, styleKey: '' };
}

function redrawNode(node: LabelNode, label: StampLabel, content: string): void {
  node.text.text = content;
  node.text.style.fontSize = label.fontSize * TEXT_OVERSAMPLE;
  node.text.style.fill = label.textColor;
  const width = node.text.width + PADDING_X_PT * 2;
  const height = node.text.height + PADDING_Y_PT * 2;
  node.text.position.set(PADDING_X_PT, PADDING_Y_PT);
  node.box.clear();
  if (label.background || label.border) {
    node.box.roundRect(0, 0, width, height, CORNER_RADIUS_PT);
    if (label.background) node.box.fill(parseColor(label.background));
    if (label.border) node.box.stroke({ width: BORDER_WIDTH_PT, ...parseColor(label.border) });
  }
}

/**
 * Brings `layer` in line with the labels every stamp in `stamps` should show
 * right now: creates missing nodes, updates changed ones, moves all of them,
 * and destroys the nodes of removed stamps, removed labels, and labels whose
 * value became empty. Only the text and box of a label whose content or style
 * changed are redrawn, so a drag that moves a stamp costs a position update.
 */
export function syncStampLabels(
  layer: Container,
  nodes: Map<string, LabelNode>,
  stamps: PlacedStamp[],
  layouts: StampLabelLayouts,
  ctx: StampPropertyContext,
  visible: (stamp: PlacedStamp, label: StampLabel) => boolean = () => true,
): void {
  const alive = new Set<string>();
  for (const stamp of stamps) {
    const labels = stamp.definitionId ? layouts[stamp.definitionId] : undefined;
    if (!labels) continue;
    for (const label of labels) {
      if (!visible(stamp, label)) continue;
      const content = resolveStampLabelText(ctx, stamp, label);
      if (content === null) continue;
      const key = `${stamp.id}:${label.id}`;
      alive.add(key);
      let node = nodes.get(key);
      if (!node) {
        node = createNode();
        nodes.set(key, node);
        layer.addChild(node.container);
      }
      const styleKey = JSON.stringify([content, label.fontSize, label.textColor, label.background ?? '', label.border ?? '']);
      if (node.styleKey !== styleKey) {
        redrawNode(node, label, content);
        node.styleKey = styleKey;
      }
      const { anchor, align } = computeStampLabelPlacement(stamp, label);
      const width = node.text.width + PADDING_X_PT * 2;
      const height = node.text.height + PADDING_Y_PT * 2;
      const left = align === 'left' ? 0 : align === 'right' ? -width : -width / 2;
      node.container.position.set(anchor.x + left, anchor.y - height / 2);
    }
  }
  for (const [key, node] of nodes) {
    if (alive.has(key)) continue;
    node.container.destroy({ children: true });
    nodes.delete(key);
  }
}

/** Drops every cached node — used when a document's layer is emptied wholesale (project load). */
export function clearStampLabels(nodes: Map<string, LabelNode>): void {
  for (const node of nodes.values()) node.container.destroy({ children: true });
  nodes.clear();
}
