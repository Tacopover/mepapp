import { describe, expect, it } from 'vitest';
import {
  computeCircuitCapacity,
  computePanelCapacity,
  CIRCUIT_LINE_PALETTE,
  findCircuitForTerminal,
  getCircuitConnectionLines,
  getCircuitLabel,
  getCircuitLineColor,
  getEffectiveCable,
  getEffectiveCircuitTypeId,
  getEffectiveDevice,
  getEffectiveDiversityPercent,
  getEffectivePhase,
  getEffectivePrefix,
  getNextCircuitNumber,
  getPanelCircuitIds,
  planTerminalAssignment,
  renumberCircuitWithSwap,
  resolveCircuitLineTargets,
  getSpareInsertion,
  isValidCircuitNumber,
  resolveCurrentCircuitId,
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

describe('panel-default resolvers (templates plan §7 round 4)', () => {
  const panel: Panel = {
    id: 'p1',
    equipmentStampId: 'eq1',
    name: 'Panel 1',
    sortDirection: 'ascending',
    accessories: [],
    sectionIds: [],
    circuitDefaults: {
      prefix: 'B',
      circuitTypeId: 'lighting',
      phase: 'L1',
      device: { kind: 'breaker', curve: 'B', ratingA: 16 },
      cable: { type: 'B2CA', coreCount: 3, crossSectionMm2: 2.5 },
      diversityPercent: 80,
    },
  };

  it('reads the panel default when the circuit leaves a field unset', () => {
    const c = circuit('c1', 1, { panelId: 'p1', prefix: undefined, circuitTypeId: undefined, phase: undefined, device: undefined, diversityPercent: undefined });
    expect(getEffectivePrefix(c, panel)).toBe('B');
    expect(getEffectiveCircuitTypeId(c, panel)).toBe('lighting');
    expect(getEffectivePhase(c, panel)).toBe('L1');
    expect(getEffectiveDevice(c, panel)).toEqual({ kind: 'breaker', curve: 'B', ratingA: 16 });
    expect(getEffectiveDiversityPercent(c, panel)).toBe(80);
  });

  it('prefers the circuit\'s own override over the panel default', () => {
    const c = circuit('c1', 1, {
      panelId: 'p1',
      prefix: 'A',
      circuitTypeId: 'sockets',
      phase: 'L2',
      device: { kind: 'breaker', curve: 'C', ratingA: 10 },
      diversityPercent: 100,
    });
    expect(getEffectivePrefix(c, panel)).toBe('A');
    expect(getEffectiveCircuitTypeId(c, panel)).toBe('sockets');
    expect(getEffectivePhase(c, panel)).toBe('L2');
    expect(getEffectiveDevice(c, panel)).toEqual({ kind: 'breaker', curve: 'C', ratingA: 10 });
    expect(getEffectiveDiversityPercent(c, panel)).toBe(100);
  });

  it('falls back to \'\' and 100 with no panel at all', () => {
    const c = circuit('c1', 1, { prefix: undefined, diversityPercent: undefined });
    expect(getEffectivePrefix(c, undefined)).toBe('');
    expect(getEffectiveDiversityPercent(c, undefined)).toBe(100);
  });

  it('resolves cable fields individually, never inheriting lengthM', () => {
    const c = circuit('c1', 1, { panelId: 'p1', cable: { crossSectionMm2: 4, lengthM: 12 } });
    expect(getEffectiveCable(c, panel)).toEqual({ type: 'B2CA', coreCount: 3, crossSectionMm2: 4, lengthM: 12 });
  });

  it('returns undefined for cable when neither the circuit nor the panel default sets any field', () => {
    const noDefaultsPanel: Panel = { ...panel, circuitDefaults: undefined };
    const c = circuit('c1', 1, { panelId: 'p1' });
    expect(getEffectiveCable(c, noDefaultsPanel)).toBeUndefined();
  });
});

describe('findCircuitForTerminal', () => {
  it('returns the circuit holding the terminal, or undefined', () => {
    const circuits = [circuit('c1', 1, { terminalIds: ['t1'] }), circuit('c2', 2, { terminalIds: ['t2', 't3'] })];
    expect(findCircuitForTerminal(circuits, 't3')?.id).toBe('c2');
    expect(findCircuitForTerminal(circuits, 't9')).toBeUndefined();
  });
});

describe('getCircuitLabel', () => {
  it('joins the resolved prefix and the number', () => {
    expect(getCircuitLabel(circuit('c1', 3, { prefix: 'L1.' }))).toBe('L1.3');
  });

  it('falls back to the panel default prefix when the circuit sets none', () => {
    const panel = { circuitDefaults: { prefix: 'B' } } as Panel;
    expect(getCircuitLabel(circuit('c1', 4, { prefix: undefined }), panel)).toBe('B4');
  });

  it('is just the number when no prefix resolves anywhere', () => {
    expect(getCircuitLabel(circuit('c1', 5, { prefix: undefined }))).toBe('5');
  });
});

describe('planTerminalAssignment', () => {
  const circuits = [
    circuit('c1', 1, { terminalIds: ['t1'] }),
    circuit('c2', 2),
    circuit('spare', 3, { isSpare: true }),
  ];

  it('adds a terminal that belongs to no circuit', () => {
    expect(planTerminalAssignment(circuits, 't9', 'c2')).toEqual({ kind: 'add' });
  });

  it('moves a terminal out of another circuit, naming the one it leaves', () => {
    expect(planTerminalAssignment(circuits, 't1', 'c2')).toEqual({ kind: 'move', fromCircuitId: 'c1' });
  });

  it('reports a terminal already in the target circuit', () => {
    expect(planTerminalAssignment(circuits, 't1', 'c1')).toEqual({ kind: 'already-member' });
  });

  it('rejects a spare target', () => {
    expect(planTerminalAssignment(circuits, 't9', 'spare')).toEqual({ kind: 'rejected', reason: 'target-is-spare' });
  });

  it('rejects a missing target', () => {
    expect(planTerminalAssignment(circuits, 't9', 'nope')).toEqual({ kind: 'rejected', reason: 'target-not-found' });
  });
});

describe('getCircuitLineColor', () => {
  it('is stable for an id and cycles through the palette by the number in the id', () => {
    expect(getCircuitLineColor('circuit-3')).toBe(CIRCUIT_LINE_PALETTE[3]);
    expect(getCircuitLineColor('circuit-3')).toBe(getCircuitLineColor('circuit-3'));
    expect(getCircuitLineColor(`circuit-${CIRCUIT_LINE_PALETTE.length + 2}`)).toBe(CIRCUIT_LINE_PALETTE[2]);
  });

  it('gives neighbouring circuit ids different colors', () => {
    expect(getCircuitLineColor('circuit-1')).not.toBe(getCircuitLineColor('circuit-2'));
  });

  it('falls back to a valid palette color for an id with no number', () => {
    expect(CIRCUIT_LINE_PALETTE).toContain(getCircuitLineColor('abc'));
  });
});

describe('getCircuitConnectionLines', () => {
  const positions: Record<string, { x: number; y: number }> = { t1: { x: 0, y: 0 }, t2: { x: 10, y: 0 }, t3: { x: 20, y: 5 } };
  const positionOf = (id: string) => positions[id];

  it('draws panel → each terminal when the panel position is known', () => {
    const lines = getCircuitConnectionLines(circuit('c1', 1, { terminalIds: ['t1', 't2'] }), { x: 100, y: 100 }, positionOf);
    expect(lines).toEqual([
      { from: { x: 100, y: 100 }, to: { x: 0, y: 0 } },
      { from: { x: 100, y: 100 }, to: { x: 10, y: 0 } },
    ]);
  });

  it('draws a star from the first terminal when there is no panel position', () => {
    const lines = getCircuitConnectionLines(circuit('c1', 1, { terminalIds: ['t1', 't2', 't3'] }), undefined, positionOf);
    expect(lines).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      { from: { x: 0, y: 0 }, to: { x: 20, y: 5 } },
    ]);
  });

  it('draws nothing for a panel-less circuit with fewer than two placed terminals', () => {
    expect(getCircuitConnectionLines(circuit('c1', 1, { terminalIds: ['t1'] }), undefined, positionOf)).toEqual([]);
  });

  it('skips terminals that are not on this document', () => {
    const lines = getCircuitConnectionLines(circuit('c1', 1, { terminalIds: ['gone', 't2'] }), { x: 1, y: 1 }, positionOf);
    expect(lines).toHaveLength(1);
  });
});

describe('resolveCircuitLineTargets', () => {
  const panel = { id: 'p1', equipmentStampId: 'eq1' } as Panel;
  const circuits = [
    circuit('c1', 1, { panelId: 'p1', terminalIds: ['t1'] }),
    circuit('c2', 2, { panelId: 'p1', terminalIds: ['t2'] }),
    circuit('c3', 3, { terminalIds: ['t3'] }),
  ];
  const ids = (list: Circuit[]) => list.map((c) => c.id);

  it('is empty with no focus and no relevant selection', () => {
    expect(resolveCircuitLineTargets(circuits, [panel], { selectedStampIds: ['nothing'] })).toEqual([]);
  });

  it('shows the focused circuit', () => {
    expect(ids(resolveCircuitLineTargets(circuits, [panel], { focusCircuitId: 'c3', selectedStampIds: [] }))).toEqual(['c3']);
  });

  it('shows every circuit of a focused panel', () => {
    expect(ids(resolveCircuitLineTargets(circuits, [panel], { focusPanelId: 'p1', selectedStampIds: [] }))).toEqual(['c1', 'c2']);
  });

  it('shows the circuit of a selected terminal', () => {
    expect(ids(resolveCircuitLineTargets(circuits, [panel], { selectedStampIds: ['t3'] }))).toEqual(['c3']);
  });

  it("shows a panel's circuits when its equipment stamp is selected, without duplicates", () => {
    expect(ids(resolveCircuitLineTargets(circuits, [panel], { focusCircuitId: 'c1', selectedStampIds: ['eq1', 't1'] }))).toEqual(['c1', 'c2']);
  });
});

describe('resolveCurrentCircuitId', () => {
  const circuits: Circuit[] = [
    { id: 'c1', number: 1, terminalIds: ['t1', 't2'], diversityPercent: 100 } as Circuit,
    { id: 'c2', number: 2, terminalIds: ['t3'], diversityPercent: 100 } as Circuit,
  ];

  it('prefers the tool target, then the tree selection, then the terminals', () => {
    expect(resolveCurrentCircuitId(circuits, { toolTargetId: 'c2', selectedCircuitId: 'c1', selectedStampIds: ['t1'] })).toBe('c2');
    expect(resolveCurrentCircuitId(circuits, { selectedCircuitId: 'c1', selectedStampIds: ['t3'] })).toBe('c1');
    expect(resolveCurrentCircuitId(circuits, { selectedStampIds: ['t1', 't2'] })).toBe('c1');
  });

  it('ignores an id that no longer exists', () => {
    expect(resolveCurrentCircuitId(circuits, { toolTargetId: 'gone', selectedCircuitId: 'gone', selectedStampIds: ['t3'] })).toBe('c2');
  });

  it('returns null when nothing applies or the terminals disagree', () => {
    expect(resolveCurrentCircuitId(circuits, { selectedStampIds: [] })).toBeNull();
    expect(resolveCurrentCircuitId(circuits, { selectedStampIds: ['free-terminal'] })).toBeNull();
    expect(resolveCurrentCircuitId(circuits, { selectedStampIds: ['t1', 't3'] })).toBeNull();
    expect(resolveCurrentCircuitId(circuits, { selectedStampIds: ['t1', 'free-terminal'] })).toBeNull();
  });
});

describe('getSpareInsertion', () => {
  const circuits: Circuit[] = [
    { id: 'a', number: 1, panelId: 'p1', terminalIds: [], diversityPercent: 100 } as Circuit,
    { id: 'b', number: 2, panelId: 'p1', terminalIds: [], diversityPercent: 100 } as Circuit,
    { id: 'c', number: 4, panelId: 'p1', terminalIds: [], diversityPercent: 100 } as Circuit,
    { id: 'd', number: 1, terminalIds: [], diversityPercent: 100 } as Circuit,
  ];

  it('inserts before a circuit and counts what moves up, only inside that circuit\'s panel', () => {
    expect(getSpareInsertion(circuits, { circuitId: 'b' })).toEqual({ scope: { panelId: 'p1' }, targetNumber: 2, shiftedCount: 2 });
    expect(getSpareInsertion(circuits, { circuitId: 'd' })).toEqual({ scope: { panelId: undefined }, targetNumber: 1, shiftedCount: 1 });
  });

  it('appends after the last circuit of a panel, or at 1 in an empty scope', () => {
    expect(getSpareInsertion(circuits, { panelId: 'p1' })).toEqual({ scope: { panelId: 'p1' }, targetNumber: 5, shiftedCount: 0 });
    expect(getSpareInsertion(circuits, { panelId: 'empty' })).toEqual({ scope: { panelId: 'empty' }, targetNumber: 1, shiftedCount: 0 });
  });

  it('returns null for a missing circuit', () => {
    expect(getSpareInsertion(circuits, { circuitId: 'nope' })).toBeNull();
  });
});

describe('isValidCircuitNumber', () => {
  it('accepts whole numbers from 1 and rejects the rest', () => {
    expect(isValidCircuitNumber(1)).toBe(true);
    expect(isValidCircuitNumber(12)).toBe(true);
    expect(isValidCircuitNumber(0)).toBe(false);
    expect(isValidCircuitNumber(-2)).toBe(false);
    expect(isValidCircuitNumber(2.5)).toBe(false);
    expect(isValidCircuitNumber(Number.NaN)).toBe(false);
  });
});
