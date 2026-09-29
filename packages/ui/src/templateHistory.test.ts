import { describe, expect, it } from 'vitest';
import { MAX_HISTORY, commit, createHistory, endGesture, redo, undo } from './templateHistory.js';

describe('template history', () => {
  it('starts empty', () => {
    const h = createHistory('a');
    expect(h).toMatchObject({ past: [], present: 'a', future: [] });
  });

  it('pushes each commit without a key as its own step', () => {
    let h = createHistory('a');
    h = commit(h, 'b');
    h = commit(h, 'c');
    expect(h.past).toEqual(['a', 'b']);
    expect(h.present).toBe('c');
  });

  it('ignores a commit of the same value', () => {
    const h = createHistory('a');
    expect(commit(h, 'a')).toBe(h);
  });

  it('coalesces commits with the same key into one step', () => {
    let h = createHistory('a');
    h = commit(h, 'b', 'move');
    h = commit(h, 'c', 'move');
    h = commit(h, 'd', 'move');
    expect(h.past).toEqual(['a']);
    expect(h.present).toBe('d');
    expect(undo(h).present).toBe('a');
  });

  it('starts a new step when the key changes or the gesture ends', () => {
    let h = createHistory('a');
    h = commit(h, 'b', 'move');
    h = commit(h, 'c', 'rotate');
    expect(h.past).toEqual(['a', 'b']);
    h = endGesture(h);
    h = commit(h, 'd', 'rotate');
    expect(h.past).toEqual(['a', 'b', 'c']);
  });

  it('undoes and redoes', () => {
    let h = createHistory('a');
    h = commit(h, 'b');
    h = commit(h, 'c');
    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(undo(h)).toBe(h);
    h = redo(h);
    h = redo(h);
    expect(h.present).toBe('c');
    expect(redo(h)).toBe(h);
  });

  it('clears the redo steps on a new commit, including a coalesced one', () => {
    let h = commit(commit(createHistory('a'), 'b'), 'c');
    h = undo(h);
    expect(h.future).toEqual(['c']);
    expect(commit(h, 'x').future).toEqual([]);
    let g = commit(createHistory('a'), 'b', 'k');
    g = { ...g, future: ['z'] };
    expect(commit(g, 'c', 'k').future).toEqual([]);
  });

  it('closes the gesture on undo, so the next commit is a new step', () => {
    let h = commit(createHistory('a'), 'b', 'k');
    h = undo(h);
    h = commit(h, 'c', 'k');
    expect(h.past).toEqual(['a']);
    expect(h.present).toBe('c');
  });

  it('keeps at most MAX_HISTORY past steps', () => {
    let h = createHistory(0);
    for (let i = 1; i <= MAX_HISTORY + 20; i++) h = commit(h, i);
    expect(h.past).toHaveLength(MAX_HISTORY);
    expect(h.past[0]).toBe(20);
    expect(h.present).toBe(MAX_HISTORY + 20);
  });
});
