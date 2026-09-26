import { describe, expect, it } from 'vitest';
import type { PlacedStamp } from './stamp.js';
import { computeStampLabelPlacement, DEFAULT_STAMP_LABEL_VISIBILITY, isStampLabelVisible, resolveStampLabelText } from './stamp-label.js';
import { buildStampPropertyContext } from './stamp-properties.js';

function stamp(rotationDegrees: number, scale = { x: 1, y: 1 }): PlacedStamp {
  return {
    id: 't1',
    category: 'terminal',
    transform: { position: { x: 100, y: 200 }, rotationDegrees, scale },
    nativeWidth: 20,
    nativeHeight: 10,
    ports: [],
    definitionId: 'fire-hose-reel',
  };
}

function near(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

describe('label placement', () => {
  it('puts an unrotated anchor at its fraction of the stamp box', () => {
    const right = computeStampLabelPlacement(stamp(0), { anchorX: 1, anchorY: 0.5 });
    near(right.anchor, { x: 110, y: 200 });
    expect(right.align).toBe('left');
    const below = computeStampLabelPlacement(stamp(0), { anchorX: 0.5, anchorY: 1 });
    near(below.anchor, { x: 100, y: 205 });
    expect(below.align).toBe('center');
  });

  it('rotates the anchor with the stamp and flips the text side', () => {
    const turned = computeStampLabelPlacement(stamp(180), { anchorX: 1, anchorY: 0.5 });
    near(turned.anchor, { x: 90, y: 200 });
    expect(turned.align).toBe('right');
    const quarter = computeStampLabelPlacement(stamp(90), { anchorX: 1, anchorY: 0.5 });
    near(quarter.anchor, { x: 100, y: 210 });
    expect(quarter.align).toBe('center');
  });

  it('applies scale and mirroring', () => {
    const mirrored = computeStampLabelPlacement(stamp(0, { x: -2, y: 2 }), { anchorX: 1, anchorY: 0.5 });
    near(mirrored.anchor, { x: 80, y: 200 });
    expect(mirrored.align).toBe('right');
  });
});

describe('label text', () => {
  const ctx = buildStampPropertyContext({
    customStampDefinitions: [],
    terminalCapacities: { t1: 150 },
    circuits: [],
    panels: [],
    circuitTypes: [],
    customPropertyDefs: { terminal: [], equipment: [], circuit: [] },
    labelLanguage: 'en',
  });

  it('wraps the value in the prefix and suffix', () => {
    expect(resolveStampLabelText(ctx, stamp(0), { propertyKey: 'stamp:capacity', prefix: 'Q=', suffix: ' W' })).toBe('Q=150 W');
  });

  it('returns null when the property has no value, so no empty prefix or suffix draws', () => {
    expect(resolveStampLabelText(ctx, stamp(0), { propertyKey: 'circuit:label', prefix: 'C ' })).toBeNull();
  });
});

describe('label visibility', () => {
  it('shows everything by default and nothing when turned off', () => {
    expect(isStampLabelVisible(DEFAULT_STAMP_LABEL_VISIBILITY, stamp(0), { propertyKey: 'circuit:label' })).toBe(true);
    expect(isStampLabelVisible({ ...DEFAULT_STAMP_LABEL_VISIBILITY, enabled: false }, stamp(0), { propertyKey: 'stamp:name' })).toBe(false);
  });

  it('hides by stamp definition and by label kind', () => {
    const byDefinition = { ...DEFAULT_STAMP_LABEL_VISIBILITY, hiddenDefinitionIds: ['fire-hose-reel'] };
    expect(isStampLabelVisible(byDefinition, stamp(0), { propertyKey: 'stamp:name' })).toBe(false);
    const byKind = { ...DEFAULT_STAMP_LABEL_VISIBILITY, hiddenGroups: ['circuit' as const] };
    expect(isStampLabelVisible(byKind, stamp(0), { propertyKey: 'circuit:custom:Group' })).toBe(false);
    expect(isStampLabelVisible(byKind, stamp(0), { propertyKey: 'custom:Room' })).toBe(true);
  });
});
