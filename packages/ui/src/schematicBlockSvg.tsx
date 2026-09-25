import type { ReactNode } from 'react';
import type { ResolvedBlock, SymbolShape } from '@mepapp/core';
import { SymbolShapesSvg } from './symbolShapeSvg.js';

// SVG drawing of one generated schematic block (electrical-schematic-templates.md Phase 4). The
// SVG's user units are sheet millimetres, so sizes here are mm. A schematic is a printed drawing,
// so it uses fixed ink and paper colors and ignores the app theme.

const INK = '#111111';
const PAPER = '#ffffff';
const SECTION_INK = '#a35f00';
const CELL_INK = '#8a939d';
const LINE_MM = 0.3;
const TEXT_MM = 2.6;
/** A drawn line never gets thinner than this on the sheet. SymbolShapesSvg's own minimum is 1 unit, which is 1 mm here. */
const DRAWING_MIN_STROKE_MM = 0.05;

export interface SchematicBlockSvgProps {
  block: ResolvedBlock;
  /** The vector art of the block's load stamp, when its definition has any (custom stamps do; library stamps are raster art and draw a generic load mark). */
  loadShapes?: SymbolShape[];
  /** The art of the library symbol a block points at (`block.symbolId`). undefined when the symbol no longer exists. A drawing then draws a dashed box with a question mark; a device or load block draws its built-in mark. */
  symbolShapes?: SymbolShape[];
  /** Draw a faint dashed outline for a drawing block that has no shapes yet. The editor sets it; the read-only viewer does not. */
  showEmptyDrawings?: boolean;
}

function dashArray(dash: 'solid' | 'dashed' | 'dotted' | undefined, widthMm: number): string | undefined {
  if (dash === 'dashed') return `${widthMm * 8} ${widthMm * 4}`;
  if (dash === 'dotted') return `${widthMm} ${widthMm * 2}`;
  return undefined;
}

function colorOf(color: number | undefined, fallback: string): string {
  return color === undefined ? fallback : `#${color.toString(16).padStart(6, '0')}`;
}

/** One line of text; `size` is the mm font size and `x`/`y` its anchor (baseline). */
function Text({ x, y, size, anchor = 'middle', bold, italic, fill, children }: { x: number; y: number; size: number; anchor?: 'start' | 'middle' | 'end'; bold?: boolean; italic?: boolean; fill: string; children: ReactNode }) {
  return (
    <text x={x} y={y} fontSize={size} textAnchor={anchor} fontWeight={bold ? 700 : 400} fontStyle={italic ? 'italic' : undefined} fill={fill} fontFamily="Arial, Helvetica, sans-serif">
      {children}
    </text>
  );
}

export function SchematicBlockSvg({ block, loadShapes, symbolShapes, showEmptyDrawings }: SchematicBlockSvgProps) {
  const { x, y, width: w, height: h, rotation, style } = block;
  const strokeWidth = style?.strokeWidthMm ?? LINE_MM;
  const stroke = colorOf(style?.color, INK);
  const dash = dashArray(style?.dash, strokeWidth);
  const fontSize = style?.fontSizeMm ?? TEXT_MM;
  const bold = style?.bold;
  const italic = style?.italic;
  const text = block.text ?? '';
  const symbolArt = block.symbolId !== undefined && symbolShapes && symbolShapes.length > 0 ? symbolShapes : undefined;
  const line = { stroke, strokeWidth, strokeDasharray: dash, fill: 'none' } as const;
  const textAnchor = style?.align === 'right' ? 'end' : style?.align === 'center' ? 'middle' : 'start';
  const textX = textAnchor === 'end' ? w : textAnchor === 'middle' ? w / 2 : 0.5;
  const lineText = (value: string, lineY: number, size = fontSize) => (
    <Text x={textX} y={lineY} size={size} anchor={textAnchor} bold={bold} italic={italic} fill={stroke}>
      {value}
    </Text>
  );

  let art: ReactNode;
  switch (block.type) {
    case 'frame':
      art = <rect x={0} y={0} width={w} height={h} rx={1} {...line} strokeDasharray={dash ?? `${strokeWidth * 8} ${strokeWidth * 4}`} />;
      break;
    case 'titleBlock':
      art = (
        <>
          <rect x={0} y={0} width={w} height={h} fill={PAPER} stroke={stroke} strokeWidth={strokeWidth} />
          {text.split('\n').map((part, i) => (
            <Text key={i} x={2} y={5 + i * (fontSize + 1)} size={fontSize} anchor="start" bold={i === 0} fill={stroke}>
              {part}
            </Text>
          ))}
        </>
      );
      break;
    case 'legend':
      art = (
        <>
          <rect x={0} y={h / 2 - 1.5} width={3} height={3} {...line} />
          <Text x={4.5} y={h / 2 + fontSize / 3} size={fontSize} anchor="start" fill={stroke}>
            {text}
          </Text>
        </>
      );
      break;
    case 'busbar':
      art = <rect x={0} y={0} width={w} height={h} fill={stroke} />;
      break;
    case 'section':
      art = (
        <>
          <rect x={0} y={0} width={w} height={h} rx={1} fill="none" stroke={colorOf(style?.color, SECTION_INK)} strokeWidth={strokeWidth} strokeDasharray={dash ?? `${strokeWidth * 5} ${strokeWidth * 3}`} />
          <Text x={1.5} y={fontSize + 0.5} size={fontSize} anchor="start" bold fill={colorOf(style?.color, SECTION_INK)}>
            {text}
          </Text>
        </>
      );
      break;
    case 'mainDevice':
    case 'protectiveDevice': {
      const symbolH = Math.max(h - fontSize - 1, h * 0.5);
      art = (
        <>
          {symbolArt ? (
            <SymbolShapesSvg shapes={symbolArt} widthPx={w} heightPx={symbolH} minStrokePx={DRAWING_MIN_STROKE_MM} />
          ) : (
            <>
              <line x1={w / 2} y1={0} x2={w / 2} y2={symbolH * 0.3} {...line} />
              <rect x={w * 0.2} y={symbolH * 0.3} width={w * 0.6} height={symbolH * 0.5} {...line} />
              <line x1={w * 0.2} y1={symbolH * 0.8} x2={w * 0.8} y2={symbolH * 0.3} {...line} />
              <line x1={w / 2} y1={symbolH * 0.8} x2={w / 2} y2={symbolH} {...line} />
            </>
          )}
          <Text x={w / 2} y={h - 0.4} size={fontSize * 0.85} bold fill={stroke}>
            {text}
          </Text>
        </>
      );
      break;
    }
    case 'accessoryDevice':
      art = (
        <>
          {symbolArt ? (
            <SymbolShapesSvg shapes={symbolArt} widthPx={w} heightPx={Math.max(h - fontSize * 0.8 - 1, h * 0.5)} minStrokePx={DRAWING_MIN_STROKE_MM} />
          ) : (
            <circle cx={w / 2} cy={h * 0.38} r={Math.min(w, h) * 0.3} {...line} />
          )}
          <Text x={w / 2} y={h - 0.4} size={fontSize * 0.8} fill={stroke}>
            {text}
          </Text>
        </>
      );
      break;
    case 'circuitNumber':
      art = (
        <Text x={w / 2} y={h / 2 + fontSize / 3} size={fontSize * 1.25} bold fill={stroke}>
          {text}
        </Text>
      );
      break;
    case 'phaseLabel':
      art = (
        <Text x={w / 2} y={h / 2 + fontSize / 3} size={fontSize} bold fill={stroke}>
          {text}
        </Text>
      );
      break;
    case 'conductor':
      art = (
        <>
          <line x1={0} y1={h / 2} x2={w} y2={h / 2} {...line} />
          <Text x={0.5} y={h / 2 - 0.8} size={fontSize * 0.85} anchor="start" bold fill={stroke}>
            {text}
          </Text>
        </>
      );
      break;
    case 'feedCable':
    case 'cableText': {
      const [first, ...rest] = text.split('  ');
      art = (
        <>
          {lineText(first, h * 0.45)}
          {rest.length > 0 && lineText(rest.join('  '), h * 0.85, fontSize * 0.9)}
        </>
      );
      break;
    }
    case 'loadSymbol':
      art = symbolArt ? (
        <SymbolShapesSvg shapes={symbolArt} widthPx={w} heightPx={h} minStrokePx={DRAWING_MIN_STROKE_MM} />
      ) : loadShapes && loadShapes.length > 0 ? (
        <SymbolShapesSvg shapes={loadShapes} widthPx={w} heightPx={h} />
      ) : (
        <>
          <line x1={0} y1={h / 2} x2={w * 0.55} y2={h / 2} {...line} />
          <path d={`M${w * 0.55},${h * 0.2} L${w},${h / 2} L${w * 0.55},${h * 0.8} Z`} fill={stroke} />
        </>
      );
      break;
    case 'countCell':
    case 'derivedCell':
    case 'aggregateCell':
      art = (
        <>
          <rect x={0} y={0} width={w} height={h} fill="none" stroke={CELL_INK} strokeWidth={strokeWidth} />
          <Text x={w / 2} y={h / 2 + fontSize / 3} size={fontSize * 0.9} bold={bold} italic={italic} fill={stroke}>
            {text}
          </Text>
        </>
      );
      break;
    case 'totalsTable': {
      const table = block.table;
      const rows = table?.rows ?? [];
      const valueColumns = Math.max(1, ...rows.map((r) => r.values.length));
      const labelW = w * (valueColumns === 1 ? 0.55 : 0.3);
      const valueW = (w - labelW) / valueColumns;
      const rowH = rows.length > 0 ? h / rows.length : h;
      const size = Math.min(fontSize * 0.9, rowH * 0.7);
      art = (
        <>
          <rect x={0} y={0} width={w} height={h} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
          {rows.map((row, i) => (
            <g key={i}>
              {i > 0 && <line x1={0} y1={i * rowH} x2={w} y2={i * rowH} stroke={CELL_INK} strokeWidth={strokeWidth * 0.7} />}
              <Text x={1} y={i * rowH + rowH / 2 + size / 3} size={size} anchor="start" bold fill={stroke}>
                {row.label}
              </Text>
              {row.values.map((value, col) => (
                <Text key={col} x={labelW + col * valueW + valueW - 1} y={i * rowH + rowH / 2 + size / 3} size={size} anchor="end" fill={stroke}>
                  {value}
                </Text>
              ))}
            </g>
          ))}
        </>
      );
      break;
    }
    case 'drawing':
      art =
        block.symbolId !== undefined ? (
          symbolShapes && symbolShapes.length > 0 ? (
            <SymbolShapesSvg shapes={symbolShapes} widthPx={w} heightPx={h} minStrokePx={DRAWING_MIN_STROKE_MM} />
          ) : (
            <>
              <rect x={0} y={0} width={w} height={h} fill="none" stroke={CELL_INK} strokeWidth={LINE_MM} strokeDasharray={`${LINE_MM * 6} ${LINE_MM * 4}`} />
              <Text x={w / 2} y={h / 2 + fontSize / 3} size={fontSize} fill={CELL_INK}>
                ?
              </Text>
            </>
          )
        ) : block.shapes && block.shapes.length > 0 ? (
          <SymbolShapesSvg shapes={block.shapes} widthPx={w} heightPx={h} minStrokePx={DRAWING_MIN_STROKE_MM} />
        ) : showEmptyDrawings ? (
          <rect x={0} y={0} width={w} height={h} fill="none" stroke={CELL_INK} strokeWidth={LINE_MM} strokeDasharray={`${LINE_MM * 6} ${LINE_MM * 4}`} />
        ) : null;
      break;
    case 'description':
    case 'customAnnotation':
    case 'freeItem':
      art = lineText(text, h / 2 + fontSize / 3);
      break;
  }

  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation} ${w / 2} ${h / 2})`} data-block-id={block.id} data-block-type={block.type}>
      {art}
    </g>
  );
}
