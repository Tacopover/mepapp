import { describe, expect, it } from 'vitest';
import {
  computeCircuitCapacity,
  computePanelCapacity,
  getNextCircuitNumber,
  getPanelCircuitIds,
  renumberCircuitWithSwap,
  shiftCircuitNumbersUpFrom,
  type Circuit,
  type Panel,
} from './circuit.js';

function circuit(id: string, number: number, overrides: Partial<Circuit> = {}): Circuit {
  return {
    id,
    prefix: 'A',
    number,
    terminalIds: [],
    isSpare: false,
    diversityPercent: 100,
    ...overrides,
  };
}

describe('getNextCircuitNumber', () => {
  it('returns 1 for an empty scope', () => {
    expect(getNextCircuitNumber([], {})).toBe(1);
  });

  it('fills the lowest gap rather than appending after the highest number', () => {
    const circuits = [circuit('c1', 1), circuit('c2', 3)];
    expect(getNextCircuitNumber(circuits, {})).toBe(2);
  });

  it('appends after the highest number once there is no gap', () => {
    const circuits = [circuit('c1', 1), circuit('c2', 2)];
    expect(getNextCircuitNumber(circuits, {})).toBe(3);
  });

  it('scopes numbering per panel, ignoring circuits in a different scope', () => {
    const circuits = [circuit('c1', 1, { panelId: 'p1' })];
    expect(getNextCircuitNumber(circuits, { panelId: 'p2' })).toBe(1);
    expect(getNextCircuitNumber(circuits, {})).toBe(1);
    expect(getNextCircuitNumber(circuits, { panelId: 'p1' })).toBe(2);
  });

  it('does not exempt a spare from occupying its slot', () => {
    const circuits = [circuit('c1', 1, { isSpare: true })];
    expect(getNextCircuitNumber(circuits, {})).toBe(2);
  });
});

describe('shiftCircuitNumbersUpFrom', () => {
  it('shifts every circuit in scope at or after fromNumber up by one', () => {
    const circuits = [circuit('c1', 1), circuit('c2', 2), circuit('c3', 3)];
    const shifted = shiftCircuitNumbersUpFrom(circuits, {}, 2);
    expect(shifted.find((c) => c.id === 'c1')!.number).toBe(1);
    expect(shifted.find((c) => c.id === 'c2')!.number).toBe(3);
    expect(shifted.find((c) => c.id === 'c3')!.number).toBe(4);
  });

  it('leaves circuits in a different scope untouched', () => {
    const circuits = [circuit('c1', 2, { panelId: 'p1' }), circuit('c2', 2, { panelId: 'p2' })];
    const shifted = shiftCircuitNumbersUpFrom(circuits, { panelId: 'p1' }, 2);
    expect(shifted.find((c) => c.id === 'c1')!.number).toBe(3);
    expect(shifted.find((c) => c.id === 'c2')!.number).toBe(2);
  });
});

describe('renumberCircuitWithSwap', () => {
  it('swaps numbers with whatever circuit occupies the target slot', () => {
    const circuits = [circuit('c1', 1), circuit('c2', 5)];
    const result = renumberCircuitWithSwap(circuits, 'c1', 5);
    expect(result.find((c) => c.id === 'c1')!.number).toBe(5);
    expect(result.find((c) => c.id === 'c2')!.number).toBe(1);
  });

  it('moves to a free slot without touching any other circuit', () => {
    const circuits = [circuit('c1', 1), circuit('c2', 2)];
    const result = renumberCircuitWithSwap(circuits, 'c1', 9);
    expect(result.find((c) => c.id === 'c1')!.number).toBe(9);
    expect(result.find((c) => c.id === 'c2')!.number).toBe(2);
  });

  it('only swaps within the moving circuit\'s own panel scope', () => {
    const circuits = [circuit('c1', 1, { panelId: 'p1' }), circuit('c2', 5, { panelId: 'p2' })];
    const result = renumberCircuitWithSwap(circuits, 'c1', 5);
    expect(result.find((c) => c.id === 'c1')!.number).toBe(5);
    expect(result.find((c) => c.id === 'c2')!.number).toBe(5);
  });

  it('is a no-op for an unknown circuit id or an unchanged number', () => {
    const circuits = [circuit('c1', 1), circuit('c2', 2)];
    expect(renumberCircuitWithSwap(circuits, 'missing', 9)).toBe(circuits);
    expect(renumberCircuitWithSwap(circuits, 'c1', 1)).toBe(circuits);
  });
});

describe('getPanelCircuitIds', () => {
  it('derives member circuit ids from Circuit.panelId rather than a stored list', () => {
    const panel: Panel = {
      id: 'p1',
      equipmentStampId: 'eq1',
      name: 'Panel 1',
      sortDirection: 'ascending',
      accessories: [],
      sectionIds: [],
    };
    const circuits = [
      circuit('c1', 1, { panelId: 'p1' }),
      circuit('c2', 2, { panelId: 'p1' }),
      circuit('c3', 1), // unassigned pool
    ];
    expect(getPanelCircuitIds(panel, circuits).sort()).toEqual(['c1', 'c2']);
  });
});

describe('computeCircuitCapacity', () => {
  it('sums capacity over member terminals, defaulting an unlisted terminal to 0', () => {
    const c = circuit('c1', 1, { terminalIds: ['t1', 't2', 't3'] });
    expect(computeCircuitCapacity(c, { t1: 100, t2: 50 })).toBe(150);
  });

  it('is 0 for a circuit with no terminals', () => {
    expect(computeCircuitCapacity(circuit('c1', 1), {})).toBe(0);
  });
});

describe('computePanelCapacity', () => {
  it('cascades the sum of its circuits\' capacities up to the panel total', () => {
    const panel: Panel = {
      id: 'p1',
      equipmentStampId: 'eq1',
      name: 'Panel 1',
      sortDirection: 'ascending',
      accessories: [],
      sectionIds: [],
    };
    const circuits = [
      circuit('c1', 1, { panelId: 'p1', terminalIds: ['t1'] }),
      circuit('c2', 2, { panelId: 'p1', terminalIds: ['t2'] }),
      circuit('c3', 1, { terminalIds: ['t3'] }), // unassigned pool, not this panel
    ];
    expect(computePanelCapacity(panel, circuits, { t1: 100, t2: 200, t3: 999 })).toBe(300);
  });
});
