import { describe, expect, it } from 'vitest';
import { ExpressionError, evaluateExpression, formatValue, parseBinding, parseExpression, renderBinding } from './schematic-expression.js';

const DOT = { decimalSeparator: '.' } as const;
const COMMA = { decimalSeparator: ',' } as const;

const context = {
  circuit: { number: 3, prefix: 'A', diversityPercent: 80, properties: { 'Serial number': 'X-1' } },
  cable: { type: 'B2CA', crossSectionMm2: 2.5, lengthM: undefined },
  terminals: [{ capacity: 100 }, { capacity: 250 }, { capacity: 50 }],
  terminal: [{ capacity: 100 }, { capacity: 250 }, { capacity: 50 }],
  panel: { accessories: [{ label: 'CT-L1' }, { label: 'SPD' }] },
};

const evaluate = (source: string, ctx: unknown = context) => evaluateExpression(parseExpression(source), ctx);
const render = (source: string, format = DOT) => renderBinding(parseBinding(source), context, format);

describe('expressions', () => {
  it('reads dotted paths', () => {
    expect(evaluate('circuit.number')).toBe(3);
    expect(evaluate('cable.type')).toBe('B2CA');
  });

  it('gives undefined for a missing path, without throwing', () => {
    expect(evaluate('cable.nope.deeper')).toBeUndefined();
    expect(evaluate('nothing.at.all')).toBeUndefined();
  });

  it('does not read inherited object members', () => {
    expect(evaluate('circuit.constructor')).toBeUndefined();
    expect(evaluate('circuit.__proto__')).toBeUndefined();
  });

  it('reads a quoted segment for a property name with spaces', () => {
    expect(evaluate('circuit.properties."Serial number"')).toBe('X-1');
  });

  it('follows the precedence of + - * / and parentheses', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('(2 + 3) * 4')).toBe(20);
    expect(evaluate('10 - 4 - 3')).toBe(3);
    expect(evaluate('-circuit.number + 5')).toBe(2);
  });

  it('gives undefined when an operand is missing or a division is by zero', () => {
    expect(evaluate('cable.lengthM * 2')).toBeUndefined();
    expect(evaluate('1 / 0')).toBeUndefined();
  });

  it('maps a path over a list', () => {
    expect(evaluate('terminal.capacity')).toEqual([100, 250, 50]);
  });

  it('sums and counts lists', () => {
    expect(evaluate('sum(terminal.capacity)')).toBe(400);
    expect(evaluate('count(terminals)')).toBe(3);
    expect(evaluate('sum(terminal.capacity) * circuit.diversityPercent / 100')).toBe(320);
  });

  it('sums an empty or missing list to 0 and counts it as 0', () => {
    expect(evaluate('sum(terminal.capacity)', { terminal: [] })).toBe(0);
    expect(evaluate('count(terminals)', {})).toBe(0);
  });

  it('skips missing items when summing a list', () => {
    expect(evaluate('sum(a.b)', { a: [{ b: 1 }, {}, { b: 2 }] })).toBe(3);
  });

  it('ignores a [*] marker in a path', () => {
    expect(evaluate('panel.accessories[*].label')).toEqual(['CT-L1', 'SPD']);
  });

  it('rejects syntax errors and unknown functions', () => {
    expect(() => parseExpression('1 +')).toThrow(ExpressionError);
    expect(() => parseExpression('(1')).toThrow(ExpressionError);
    expect(() => parseExpression('a..b')).toThrow(ExpressionError);
    expect(() => parseExpression('circuit.properties."open')).toThrow(ExpressionError);
    expect(() => parseExpression('median(x)')).toThrow(ExpressionError);
    expect(() => parseExpression('toString(x)')).toThrow(ExpressionError);
    expect(() => parseExpression('1 2')).toThrow(ExpressionError);
  });
});

describe('formatting', () => {
  it('shows at most two decimals and drops trailing zeros', () => {
    expect(formatValue(2.5, DOT)).toBe('2.5');
    expect(formatValue(3, DOT)).toBe('3');
    expect(formatValue(1.005 * 100, DOT)).toBe('100.5');
    expect(formatValue(1 / 3, DOT)).toBe('0.33');
  });

  it('uses the template decimal separator', () => {
    expect(formatValue(2.5, COMMA)).toBe('2,5');
  });

  it('forces a fixed count of decimals', () => {
    expect(formatValue(2.5, DOT, 2)).toBe('2.50');
    expect(formatValue(2.5, COMMA, 0)).toBe('3');
  });

  it('shows undefined as blank and joins lists', () => {
    expect(formatValue(undefined, DOT)).toBe('');
    expect(formatValue(['a', undefined, 'b'], DOT)).toBe('a, b');
    expect(formatValue(Number.NaN, DOT)).toBe('');
  });
});

describe('bindings', () => {
  it('renders literal text with expression segments', () => {
    expect(render('{cable.type} {cable.crossSectionMm2} mm²')).toBe('B2CA 2.5 mm²');
    expect(render('{cable.type} {cable.crossSectionMm2} mm²', COMMA)).toBe('B2CA 2,5 mm²');
  });

  it('renders a missing value as blank but keeps the literal text around it', () => {
    expect(render('l={cable.lengthM} m')).toBe('l= m');
  });

  it('renders an expression with a fixed-decimals spec', () => {
    expect(render('{sum(terminal.capacity) / 3:1} VA')).toBe('133.3 VA');
  });

  it('joins a list value', () => {
    expect(render('{panel.accessories.label}')).toBe('CT-L1, SPD');
  });

  it('treats doubled braces as literal braces', () => {
    expect(render('{{x}} {circuit.number}')).toBe('{x} 3');
  });

  it('renders a binding with no segments as its text', () => {
    expect(render('plain')).toBe('plain');
    expect(render('')).toBe('');
  });

  it('shows an optional group only when one of its expressions has a value', () => {
    expect(render('{cable.type}[  l={cable.lengthM} m]')).toBe('B2CA');
    expect(render('{cable.type}[  t={cable.type} m]')).toBe('B2CA  t=B2CA m');
    expect(render('[{cable.lengthM} m][ / {circuit.number}]')).toBe(' / 3');
  });

  it('always shows an optional group that has no expression, and treats doubled brackets as literal', () => {
    expect(render('a[ - b]c')).toBe('a - bc');
    expect(render('[[{circuit.number}]]')).toBe('[3]');
  });

  it('rejects an unclosed or stray brace and a bad expression', () => {
    expect(() => parseBinding('[{circuit.number}')).toThrow(ExpressionError);
    expect(() => parseBinding('a]')).toThrow(ExpressionError);
    expect(() => parseBinding('[a[b]]')).toThrow(ExpressionError);
    expect(() => parseBinding('{circuit.number')).toThrow(ExpressionError);
    expect(() => parseBinding('a } b')).toThrow(ExpressionError);
    expect(() => parseBinding('{1 +}')).toThrow(ExpressionError);
  });
});
