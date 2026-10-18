import { describe, expect, it } from 'vitest';
import { isLayoutPath, legClass } from './route-layout.js';

describe('legClass', () => {
  it('classes a horizontal leg as axis', () => {
    expect(legClass({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe('axis');
  });

  it('classes a vertical leg as axis', () => {
    expect(legClass({ x: 0, y: 0 }, { x: 0, y: 50 })).toBe('axis');
  });

  it('classes a 45 degree leg as diagonal', () => {
    expect(legClass({ x: 0, y: 0 }, { x: 70, y: 70 })).toBe('diagonal');
  });

  it('classes a -45 degree leg as diagonal', () => {
    expect(legClass({ x: 0, y: 0 }, { x: -70, y: 70 })).toBe('diagonal');
  });

  it('classes a shallow leg as free', () => {
    expect(legClass({ x: 0, y: 0 }, { x: 100, y: 1 })).toBe('free');
  });

  it('classes a zero-length leg as axis', () => {
    expect(legClass({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe('axis');
  });
});

describe('isLayoutPath', () => {
  it('accepts a path of axis and diagonal legs', () => {
    expect(
      isLayoutPath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 200, y: 100 },
      ]),
    ).toBe(true);
  });

  it('rejects a path with a free leg', () => {
    expect(
      isLayoutPath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 200, y: 1 },
      ]),
    ).toBe(false);
  });

  it('accepts a path with one point', () => {
    expect(isLayoutPath([{ x: 0, y: 0 }])).toBe(true);
  });
});
