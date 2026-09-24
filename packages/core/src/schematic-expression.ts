// Binding expressions for schematic template blocks (electrical-schematic-
// templates.md §8). A binding is text with {expression} segments, for example
// "{cable.type} {cable.coreCount}G{cable.crossSectionMm2} mm²". An expression
// is a dotted path, a number, + - * / and sum()/count(). Pure and headless.

export type ExprValue = number | string | boolean | undefined | ExprValue[];

export interface NumberFormat {
  decimalSeparator: ',' | '.';
}

export class ExpressionError extends Error {}

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'path'; segments: string[] }
  | { kind: 'neg'; operand: Node }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] };

const isIdentStart = (ch: string) => /[A-Za-z_]/.test(ch);
const isIdentChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);
const isDigit = (ch: string) => /[0-9]/.test(ch);

class Parser {
  private pos = 0;

  constructor(private readonly src: string) {}

  parse(): Node {
    const node = this.parseSum();
    this.skipWs();
    if (this.pos < this.src.length) throw new ExpressionError(`Unexpected "${this.src[this.pos]}" in "${this.src}"`);
    return node;
  }

  private skipWs(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
  }

  private peek(): string {
    this.skipWs();
    return this.src[this.pos] ?? '';
  }

  private parseSum(): Node {
    let left = this.parseProduct();
    for (let op = this.peek(); op === '+' || op === '-'; op = this.peek()) {
      this.pos++;
      left = { kind: 'bin', op, left, right: this.parseProduct() };
    }
    return left;
  }

  private parseProduct(): Node {
    let left = this.parseUnary();
    for (let op = this.peek(); op === '*' || op === '/'; op = this.peek()) {
      this.pos++;
      left = { kind: 'bin', op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.peek() === '-') {
      this.pos++;
      return { kind: 'neg', operand: this.parseUnary() };
    }
    return this.parseAtom();
  }

  private parseAtom(): Node {
    const ch = this.peek();
    if (ch === '') throw new ExpressionError(`Unexpected end of "${this.src}"`);
    if (ch === '(') {
      this.pos++;
      const inner = this.parseSum();
      if (this.peek() !== ')') throw new ExpressionError(`Missing ")" in "${this.src}"`);
      this.pos++;
      return inner;
    }
    if (isDigit(ch) || ch === '.') return this.parseNumber();
    if (isIdentStart(ch)) return this.parsePathOrCall();
    throw new ExpressionError(`Unexpected "${ch}" in "${this.src}"`);
  }

  private parseNumber(): Node {
    const start = this.pos;
    while (this.pos < this.src.length && (isDigit(this.src[this.pos]) || this.src[this.pos] === '.')) this.pos++;
    const value = Number(this.src.slice(start, this.pos));
    if (!Number.isFinite(value)) throw new ExpressionError(`Bad number "${this.src.slice(start, this.pos)}" in "${this.src}"`);
    return { kind: 'num', value };
  }

  private readIdent(): string {
    const start = this.pos;
    while (this.pos < this.src.length && isIdentChar(this.src[this.pos])) this.pos++;
    return this.src.slice(start, this.pos);
  }

  private parsePathOrCall(): Node {
    const segments = [this.readIdent()];
    for (;;) {
      if (this.src.startsWith('[*]', this.pos)) this.pos += 3;
      if (this.src[this.pos] !== '.') break;
      this.pos++;
      if (this.src[this.pos] === '"') {
        const end = this.src.indexOf('"', this.pos + 1);
        if (end < 0) throw new ExpressionError(`Unclosed quote in "${this.src}"`);
        segments.push(this.src.slice(this.pos + 1, end));
        this.pos = end + 1;
      } else if (isIdentStart(this.src[this.pos] ?? '')) {
        segments.push(this.readIdent());
      } else {
        throw new ExpressionError(`Expected a name after "." in "${this.src}"`);
      }
    }
    if (segments.length === 1 && this.peek() === '(') {
      this.pos++;
      const args: Node[] = [];
      if (this.peek() !== ')') {
        args.push(this.parseSum());
        while (this.peek() === ',') {
          this.pos++;
          args.push(this.parseSum());
        }
      }
      if (this.peek() !== ')') throw new ExpressionError(`Missing ")" in "${this.src}"`);
      this.pos++;
      if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, segments[0])) throw new ExpressionError(`Unknown function "${segments[0]}"`);
      return { kind: 'call', name: segments[0], args };
    }
    return { kind: 'path', segments };
  }
}

function flatten(value: ExprValue): ExprValue[] {
  if (Array.isArray(value)) return value.flatMap(flatten);
  return value === undefined ? [] : [value];
}

const FUNCTIONS: Record<string, (args: ExprValue[]) => ExprValue> = {
  sum: ([list]) => flatten(list).reduce<number>((total, v) => (typeof v === 'number' && Number.isFinite(v) ? total + v : total), 0),
  count: ([list]) => flatten(list).length,
};

/** A present object counts as `true`, so count(terminals) counts terminals even though a terminal is not itself a number or string. */
function toExprValue(value: unknown): ExprValue {
  if (Array.isArray(value)) return value.map(toExprValue);
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (value !== null && typeof value === 'object') return true;
  return undefined;
}

function walk(value: unknown, segments: string[]): ExprValue {
  if (segments.length === 0) return toExprValue(value);
  if (Array.isArray(value)) return value.map((item) => walk(item, segments));
  if (value === null || typeof value !== 'object') return undefined;
  const [head, ...rest] = segments;
  if (!Object.prototype.hasOwnProperty.call(value, head)) return undefined;
  return walk((value as Record<string, unknown>)[head], rest);
}

function evalNode(node: Node, context: unknown): ExprValue {
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'path':
      return walk(context, node.segments);
    case 'neg': {
      const v = evalNode(node.operand, context);
      return typeof v === 'number' ? -v : undefined;
    }
    case 'bin': {
      const l = evalNode(node.left, context);
      const r = evalNode(node.right, context);
      if (typeof l !== 'number' || typeof r !== 'number') return undefined;
      if (node.op === '+') return l + r;
      if (node.op === '-') return l - r;
      if (node.op === '*') return l * r;
      return r === 0 ? undefined : l / r;
    }
    case 'call':
      return FUNCTIONS[node.name](node.args.map((a) => evalNode(a, context)));
  }
}

export interface ParsedExpression {
  node: Node;
}

/** Throws ExpressionError on a syntax error or an unknown function. */
export function parseExpression(source: string): ParsedExpression {
  return { node: new Parser(source).parse() };
}

export function evaluateExpression(expression: ParsedExpression, context: unknown): ExprValue {
  return evalNode(expression.node, context);
}

/** Numbers show at most two decimals, trailing zeros dropped; `decimals` forces a fixed count. Lists join with ", "; undefined is blank. */
export function formatValue(value: ExprValue, format: NumberFormat, decimals?: number): string {
  if (value === undefined) return '';
  if (Array.isArray(value)) {
    return value
      .map((v) => formatValue(v, format, decimals))
      .filter((s) => s !== '')
      .join(', ');
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const fixed = decimals !== undefined ? value.toFixed(decimals) : String(Math.round(value * 100) / 100);
    return format.decimalSeparator === ',' ? fixed.replace('.', ',') : fixed;
  }
  return String(value);
}

interface BindingPart {
  literal?: string;
  expression?: ParsedExpression;
  decimals?: number;
}

export interface ParsedBinding {
  parts: BindingPart[];
}

/** "{expr}" or "{expr:2}" segments (":2" = two fixed decimals) between literal text; "{{" and "}}" are literal braces. Throws ExpressionError. */
export function parseBinding(source: string): ParsedBinding {
  const parts: BindingPart[] = [];
  let literal = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if ((ch === '{' || ch === '}') && source[i + 1] === ch) {
      literal += ch;
      i += 2;
    } else if (ch === '{') {
      const end = source.indexOf('}', i + 1);
      if (end < 0) throw new ExpressionError(`Missing "}" in "${source}"`);
      let body = source.slice(i + 1, end);
      let decimals: number | undefined;
      const spec = /:(\d+)\s*$/.exec(body);
      if (spec) {
        decimals = Number(spec[1]);
        body = body.slice(0, spec.index);
      }
      if (literal) parts.push({ literal });
      literal = '';
      parts.push({ expression: parseExpression(body), decimals });
      i = end + 1;
    } else if (ch === '}') {
      throw new ExpressionError(`Unexpected "}" in "${source}"`);
    } else {
      literal += ch;
      i++;
    }
  }
  if (literal) parts.push({ literal });
  return { parts };
}

export function renderBinding(binding: ParsedBinding, context: unknown, format: NumberFormat): string {
  return binding.parts
    .map((part) => (part.expression ? formatValue(evaluateExpression(part.expression, context), format, part.decimals) : (part.literal ?? '')))
    .join('');
}
