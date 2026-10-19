import { describe, expect, it } from 'vitest';
import { packRooms, type PackLimits, type PackUnit } from './circuit-pack.js';

function unit(roomId: string, distance: number, terminalIds: string[], loads?: number[]): PackUnit {
  return { roomId, distance, terminalIds, loads: loads ?? terminalIds.map(() => 0) };
}

const noLoad: PackLimits = { maxTerminals: 4, maxLoad: null, diversityPercent: 100 };

describe('packRooms', () => {
  it('packs whole rooms next-fit when spanning is allowed', () => {
    const rooms = [unit('A', 5, ['a1', 'a2']), unit('B', 8, ['b1', 'b2']), unit('C', 12, ['c1', 'c2', 'c3'])];
    expect(packRooms(rooms, noLoad, { spanRooms: true })).toEqual([
      { terminalIds: ['a1', 'a2', 'b1', 'b2'], roomIds: ['A', 'B'], reason: 'pack' },
      { terminalIds: ['c1', 'c2', 'c3'], roomIds: ['C'], reason: 'pack' },
    ]);
  });

  it('starts a new circuit per room when spanning is not allowed', () => {
    const rooms = [unit('A', 5, ['a1', 'a2']), unit('B', 8, ['b1', 'b2']), unit('C', 12, ['c1', 'c2', 'c3'])];
    expect(packRooms(rooms, noLoad, { spanRooms: false })).toEqual([
      { terminalIds: ['a1', 'a2'], roomIds: ['A'], reason: 'pack' },
      { terminalIds: ['b1', 'b2'], roomIds: ['B'], reason: 'pack' },
      { terminalIds: ['c1', 'c2', 'c3'], roomIds: ['C'], reason: 'pack' },
    ]);
  });

  it('splits one room that is above the terminal limit in the given order', () => {
    const sockets = Array.from({ length: 10 }, (_, i) => `s${i + 1}`);
    const result = packRooms([unit('R', 3, sockets)], noLoad, { spanRooms: true });
    expect(result).toEqual([
      { terminalIds: ['s1', 's2', 's3', 's4'], roomIds: ['R'], reason: 'room-split' },
      { terminalIds: ['s5', 's6', 's7', 's8'], roomIds: ['R'], reason: 'room-split' },
      { terminalIds: ['s9', 's10'], roomIds: ['R'], reason: 'room-split' },
    ]);
  });

  it('is next-fit, not first-fit', () => {
    const rooms = [unit('R1', 1, ['1a', '1b', '1c']), unit('R2', 2, ['2a', '2b', '2c']), unit('R3', 3, ['3a'])];
    expect(packRooms(rooms, noLoad, { spanRooms: true })).toEqual([
      { terminalIds: ['1a', '1b', '1c'], roomIds: ['R1'], reason: 'pack' },
      { terminalIds: ['2a', '2b', '2c', '3a'], roomIds: ['R2', 'R3'], reason: 'pack' },
    ]);
  });

  it('applies the diversity factor to the load limit and closes the last piece of a split room', () => {
    const loads = Array.from({ length: 8 }, () => 300);
    const limits: PackLimits = { maxTerminals: null, maxLoad: 1000, diversityPercent: 50 };
    const terminalIds = loads.map((_, i) => `t${i + 1}`);
    const result = packRooms([unit('R', 1, terminalIds, loads)], limits, { spanRooms: true });
    expect(result.map((circuit) => circuit.terminalIds.length)).toEqual([6, 2]);
    expect(result.every((circuit) => circuit.reason === 'room-split')).toBe(true);
    const next = packRooms(
      [unit('R', 1, terminalIds, loads), unit('Q', 2, ['q1'], [0])],
      limits,
      { spanRooms: true },
    );
    expect(next[next.length - 1]).toEqual({ terminalIds: ['q1'], roomIds: ['Q'], reason: 'pack' });
  });

  it('puts a terminal above the load limit alone in its own circuit', () => {
    const limits: PackLimits = { maxTerminals: null, maxLoad: 100, diversityPercent: 100 };
    const result = packRooms([unit('R', 1, ['x', 'y'], [500, 50])], limits, { spanRooms: true });
    expect(result).toEqual([
      { terminalIds: ['x'], roomIds: ['R'], reason: 'room-split' },
      { terminalIds: ['y'], roomIds: ['R'], reason: 'room-split' },
    ]);
  });

  it('packs everything into one circuit when both limits are null', () => {
    const rooms = [unit('A', 1, ['a1', 'a2']), unit('B', 2, ['b1']), unit('C', 3, ['c1', 'c2', 'c3'])];
    const limits: PackLimits = { maxTerminals: null, maxLoad: null, diversityPercent: 100 };
    expect(packRooms(rooms, limits, { spanRooms: true })).toEqual([
      { terminalIds: ['a1', 'a2', 'b1', 'c1', 'c2', 'c3'], roomIds: ['A', 'B', 'C'], reason: 'pack' },
    ]);
  });

  it('sorts units by distance, breaking ties on roomId', () => {
    const rooms = [unit('C', 12, ['c1']), unit('B', 8, ['b1']), unit('A', 8, ['a1'])];
    const limits: PackLimits = { maxTerminals: null, maxLoad: null, diversityPercent: 100 };
    expect(packRooms(rooms, limits, { spanRooms: true })).toEqual([
      { terminalIds: ['a1', 'b1', 'c1'], roomIds: ['A', 'B', 'C'], reason: 'pack' },
    ]);
  });

  it('gives the same output for the same input', () => {
    const rooms = [unit('A', 5, ['a1', 'a2']), unit('B', 8, ['b1', 'b2']), unit('C', 12, ['c1', 'c2', 'c3'])];
    expect(packRooms(rooms, noLoad, { spanRooms: true })).toEqual(packRooms(rooms, noLoad, { spanRooms: true }));
  });

  it('does not mutate the input', () => {
    const rooms = [unit('C', 12, ['c1']), unit('A', 5, ['a1', 'a2'])];
    const snapshot = JSON.parse(JSON.stringify(rooms));
    packRooms(rooms, noLoad, { spanRooms: true });
    expect(rooms).toEqual(snapshot);
  });

  it('skips a room with no terminals and returns [] for empty input', () => {
    expect(packRooms([], noLoad, { spanRooms: true })).toEqual([]);
    expect(packRooms([unit('E', 1, [])], noLoad, { spanRooms: true })).toEqual([]);
  });

  it('keeps every terminal exactly once', () => {
    const rooms = [unit('A', 1, ['a1', 'a2', 'a3']), unit('B', 2, ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'])];
    const flat = packRooms(rooms, noLoad, { spanRooms: true }).flatMap((circuit) => circuit.terminalIds);
    expect([...flat].sort()).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
  });
});
