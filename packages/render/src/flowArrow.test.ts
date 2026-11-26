import { describe, expect, it } from 'vitest';
import { computeNetworks, solveFlow, type Fitting, type NetworkType, type Segment } from '@mepapp/core';
import { flowArrowEnds, segmentFlowSense } from './flowArrow.js';

describe('flowArrowEnds with the return flow sense', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 4 };

  it('runs from the first point to the second for AtoB', () => {
    expect(flowArrowEnds('AtoB', a, b, 'return')).toEqual({ from: a, to: b });
  });

  it('runs from the second point to the first for BtoA', () => {
    expect(flowArrowEnds('BtoA', a, b, 'return')).toEqual({ from: b, to: a });
  });
});

describe('flowArrowEnds with the supply flow sense', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 4 };

  it('runs from the second point to the first for AtoB, away from the source', () => {
    expect(flowArrowEnds('AtoB', a, b, 'supply')).toEqual({ from: b, to: a });
  });

  it('runs from the first point to the second for BtoA, away from the source', () => {
    expect(flowArrowEnds('BtoA', a, b, 'supply')).toEqual({ from: a, to: b });
  });
});

describe('flowArrowEnds with a null direction', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 4 };

  it('gives null for the return flow sense, so no arrowhead is drawn', () => {
    expect(flowArrowEnds(null, a, b, 'return')).toBeNull();
  });

  it('gives null for the supply flow sense, so no arrowhead is drawn', () => {
    expect(flowArrowEnds(null, a, b, 'supply')).toBeNull();
  });
});

describe('segmentFlowSense', () => {
  it('gives the flow sense of the adopted type over the library value', () => {
    const types: NetworkType[] = [{ id: 'supply-air', name: 'Supply air', flowSense: 'return' } as NetworkType];
    expect(segmentFlowSense(types, 'supply-air')).toBe('return');
  });

  it('gives return for an adopted type without a stored flow sense whose library id is exhaust-air', () => {
    const types: NetworkType[] = [{ id: 'exhaust-air', name: 'Exhaust air' } as NetworkType];
    expect(segmentFlowSense(types, 'exhaust-air')).toBe('return');
  });

  it('gives the library value for an id the document did not adopt', () => {
    expect(segmentFlowSense([], 'return-air')).toBe('return');
  });

  it('gives supply for an id that is neither adopted nor in the library', () => {
    expect(segmentFlowSense([], 'no-such-type')).toBe('supply');
  });

  it('gives supply for an adopted type with no stored flow sense and no library id', () => {
    const types: NetworkType[] = [{ id: 'my-type', name: 'My type' } as NetworkType];
    expect(segmentFlowSense(types, 'my-type')).toBe('supply');
  });
});

function segment(id: string, networkTypeId: string, endpointA: Segment['endpointA'], endpointB: Segment['endpointB']): Segment {
  return {
    id,
    pageIndex: 0,
    networkTypeId,
    shape: 'round',
    diameter: 200,
    endpointA,
    endpointB,
    geometry: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  };
}

function fitting(id: string, x: number): Fitting {
  return { id, pageIndex: 0, position: { x, y: 0 }, kind: 'tee' };
}

describe('flowArrowEnds with the real flow solve', () => {
  // Source equipment eq is east of the tee t. Flow runs from eq through t to terminal term (west).
  const segments = [
    segment('s1', 'supply-air', { kind: 'fitting', fittingId: 'a' }, { kind: 'fitting', fittingId: 't' }),
    segment('s2', 'supply-air', { kind: 'fitting', fittingId: 't' }, { kind: 'port', elementId: 'eq', portId: 'p1' }),
    segment('s3', 'supply-air', { kind: 'fitting', fittingId: 't' }, { kind: 'port', elementId: 'term', portId: 'p1' }),
  ];
  const fittings = [fitting('a', -100), fitting('t', 0)];
  const [network] = computeNetworks({ segments, fittings, portGroups: [] });
  const result = solveFlow({
    network,
    segments,
    fittings,
    portGroups: [],
    terminalCapacities: { term: 100 },
    elementCategories: { eq: 'equipment', term: 'terminal' },
  });
  const a = { x: -100, y: 0 };
  const b = { x: 0, y: 0 };

  it('gives opposite arrowheads for the two flow senses of one segment', () => {
    const direction = result.segmentDirection.s1 ?? null;
    const ret = flowArrowEnds(direction, a, b, 'return');
    const sup = flowArrowEnds(direction, a, b, 'supply');
    expect(ret).not.toBeNull();
    expect(sup).toEqual({ from: ret!.to, to: ret!.from });
  });

  it('points the return arrowhead toward the source', () => {
    const direction = result.segmentDirection.s1 ?? null;
    const ret = flowArrowEnds(direction, a, b, 'return');
    expect(ret!.to.x).toBeGreaterThan(ret!.from.x);
  });

  it('gives opposite arrowheads for a supply type and a return type on equal segments', () => {
    const types = [
      { id: 'supply-air', name: 'Supply air', flowSense: 'supply' },
      { id: 'return-air', name: 'Return air', flowSense: 'return' },
    ] as NetworkType[];
    const solveDirection = (networkTypeId: string) => {
      const layout = [
        segment('s1', networkTypeId, { kind: 'fitting', fittingId: 'a' }, { kind: 'fitting', fittingId: 't' }),
        segment('s2', networkTypeId, { kind: 'fitting', fittingId: 't' }, { kind: 'port', elementId: 'eq', portId: 'p1' }),
        segment('s3', networkTypeId, { kind: 'fitting', fittingId: 't' }, { kind: 'port', elementId: 'term', portId: 'p1' }),
      ];
      const [network] = computeNetworks({ segments: layout, fittings, portGroups: [] });
      const solved = solveFlow({
        network,
        segments: layout,
        fittings,
        portGroups: [],
        terminalCapacities: { term: 100 },
        elementCategories: { eq: 'equipment', term: 'terminal' },
      });
      return solved.segmentDirection.s1 ?? null;
    };
    const supplyDirection = solveDirection('supply-air');
    expect(solveDirection('return-air')).toBe(supplyDirection);
    const supplyEnds = flowArrowEnds(supplyDirection, a, b, segmentFlowSense(types, 'supply-air'));
    const returnEnds = flowArrowEnds(solveDirection('return-air'), a, b, segmentFlowSense(types, 'return-air'));
    expect(supplyEnds).not.toBeNull();
    expect(supplyEnds).toEqual({ from: returnEnds!.to, to: returnEnds!.from });
  });
});

describe('flowArrowEnds with no source', () => {
  it('gives a null direction for a network with no source, so supply gives null too', () => {
    const segments = [
      segment('s1', 'supply-air', { kind: 'fitting', fittingId: 't' }, { kind: 'fitting', fittingId: 'oa' }),
      segment('s2', 'supply-air', { kind: 'fitting', fittingId: 't' }, { kind: 'port', elementId: 'term', portId: 'p1' }),
    ];
    const fittings = [fitting('t', 0), fitting('oa', 100)];
    const [network] = computeNetworks({ segments, fittings, portGroups: [] });
    const result = solveFlow({
      network,
      segments,
      fittings,
      portGroups: [],
      terminalCapacities: { term: 100 },
      elementCategories: { term: 'terminal' },
      highestWhenNoSource: true,
    });
    const direction = result.segmentDirection.s1 ?? null;
    expect(direction).toBeNull();
    expect(flowArrowEnds(direction, { x: 0, y: 0 }, { x: 100, y: 0 }, 'supply')).toBeNull();
  });
});
