import { describe, expect, it } from 'vitest';
import { resolveAngleSnap } from './tools/angleSnap';

describe('render test set-up', () => {
  it('imports a pure module', () => {
    expect(typeof resolveAngleSnap).toBe('function');
  });
});
