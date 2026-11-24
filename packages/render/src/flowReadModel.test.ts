import { describe, expect, it } from 'vitest';
import type { FlowResult, Network } from '@mepapp/core';
import { notOpenEndIdsFor, sameKeys, solvedNoSourceOf } from './flowReadModel.js';

function result(overrides: Partial<FlowResult>): FlowResult {
  return {
    segmentCapacity: {},
    fittingCapacity: {},
    resolved: true,
    totalCapacity: null,
    segmentDirection: {},
    ...overrides,
  };
}

describe('solvedNoSourceOf', () => {
  const highest = result({ segmentCapacity: { s1: 100 }, fittingCapacity: { f1: 100 }, noSource: 'highest' });
  const plain = result({ segmentCapacity: { s2: 10 }, fittingCapacity: {} });

  it('gives undefined when nothing was solved', () => {
    expect(solvedNoSourceOf(null, 'segment', 's1')).toBeUndefined();
  });

  it('gives the noSource of the network that holds the segment', () => {
    expect(solvedNoSourceOf([highest, plain], 'segment', 's1')).toBe('highest');
  });

  it('gives the noSource of the network that holds the fitting', () => {
    expect(solvedNoSourceOf([highest, plain], 'fitting', 'f1')).toBe('highest');
  });

  it('gives undefined when the network has no noSource', () => {
    expect(solvedNoSourceOf([highest, plain], 'segment', 's2')).toBeUndefined();
  });

  it('gives undefined for an unknown id', () => {
    expect(solvedNoSourceOf([highest, plain], 'segment', 'zz')).toBeUndefined();
  });

  it('gives undefined for a segment id asked as a fitting', () => {
    expect(solvedNoSourceOf([highest, plain], 'fitting', 's1')).toBeUndefined();
  });
});

describe('notOpenEndIdsFor', () => {
  const network: Network = { id: 'n', networkTypeId: 'x', segmentIds: [], fittingIds: ['f1', 'f2', 'f3'] };

  it('gives the marked fittings of the network that have no input', () => {
    const marks = new Map<string, unknown>([
      ['f1', {}],
      ['f2', {}],
      ['zz', {}],
    ]);
    const inputs = new Map<string, unknown>([['f2', {}]]);
    expect(notOpenEndIdsFor(network, marks, inputs)).toEqual(new Set(['f1']));
  });

  it('gives undefined when no fitting is marked', () => {
    expect(notOpenEndIdsFor(network, new Map(), new Map())).toBeUndefined();
  });

  it('gives undefined when every marked fitting has an input', () => {
    const marks = new Map<string, unknown>([['f1', {}]]);
    const inputs = new Map<string, unknown>([['f1', {}]]);
    expect(notOpenEndIdsFor(network, marks, inputs)).toBeUndefined();
  });

  it('ignores a mark outside the network', () => {
    const marks = new Map<string, unknown>([['zz', {}]]);
    expect(notOpenEndIdsFor(network, marks, new Map())).toBeUndefined();
  });
});

describe('sameKeys', () => {
  it('is true for equal keys in another order', () => {
    expect(sameKeys(new Map([['a', 1], ['b', 2]]), new Map([['b', 9], ['a', 8]]))).toBe(true);
  });

  it('is false for a different size', () => {
    expect(sameKeys(new Map([['a', 1]]), new Map([['a', 1], ['b', 2]]))).toBe(false);
  });

  it('is false for the same size and a different key', () => {
    expect(sameKeys(new Map([['a', 1]]), new Map([['b', 1]]))).toBe(false);
  });

  it('is true for two empty maps', () => {
    expect(sameKeys(new Map(), new Map())).toBe(true);
  });
});
