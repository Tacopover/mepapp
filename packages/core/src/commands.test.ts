import { describe, expect, it } from 'vitest';
import { CommandManager, CompositeCommand, Transaction, type Command } from './commands.js';

function delta(name: string, log: string[], amount: number): Command<number> {
  return {
    description: name,
    execute: (s) => {
      log.push(`${name}:execute`);
      return s + amount;
    },
    undo: (s) => {
      log.push(`${name}:undo`);
      return s - amount;
    },
    redo: (s) => {
      log.push(`${name}:redo`);
      return s + amount;
    },
  };
}

describe('CommandManager', () => {
  it('runs execute, undo, redo through the distinct redo path (not a re-call of execute)', () => {
    const log: string[] = [];
    const manager = new CommandManager<number>(0);
    manager.execute(delta('a', log, 1));
    manager.undo();
    manager.redo();

    expect(log).toEqual(['a:execute', 'a:undo', 'a:redo']);
    expect(manager.getState()).toBe(1);
    expect(manager.undoCount).toBe(1);
    expect(manager.redoCount).toBe(0);
  });

  it('undoes in LIFO order', () => {
    const log: string[] = [];
    const manager = new CommandManager<number>(0);
    manager.execute(delta('a', log, 1));
    manager.execute(delta('b', log, 2));
    manager.execute(delta('c', log, 4));

    manager.undo();
    manager.undo();

    expect(log.slice(-2)).toEqual(['c:undo', 'b:undo']);
    expect(manager.getState()).toBe(1);
  });

  it('clears redo history when a new command executes after an undo', () => {
    const log: string[] = [];
    const manager = new CommandManager<number>(0);
    manager.execute(delta('a', log, 1));
    manager.undo();
    expect(manager.canRedo).toBe(true);

    manager.execute(delta('b', log, 2));
    expect(manager.canRedo).toBe(false);
    expect(manager.redoCount).toBe(0);
  });

  it('addExecuted takes the undo slot without calling execute', () => {
    const log: string[] = [];
    const manager = new CommandManager<number>(5);
    manager.addExecuted(delta('a', log, 1));

    expect(log).toEqual([]);
    expect(manager.canUndo).toBe(true);
    manager.undo();
    expect(log).toEqual(['a:undo']);
    expect(manager.getState()).toBe(4);
  });

  it('evicts the oldest entries once maxHistory is exceeded', () => {
    const log: string[] = [];
    const manager = new CommandManager<number>(0, { maxHistory: 3 });
    for (let i = 0; i < 5; i++) {
      manager.execute(delta(`c${i}`, log, 1));
    }

    expect(manager.undoCount).toBe(3);
    expect(manager.getState()).toBe(5);

    manager.undo();
    manager.undo();
    manager.undo();

    expect(manager.canUndo).toBe(false);
    expect(manager.getState()).toBe(2); // c0 and c1's effect (evicted) can never be undone
  });
});

describe('CompositeCommand', () => {
  it('rolls back already-applied sub-commands if execute fails partway through', () => {
    const log: string[] = [];
    const failing: Command<number> = {
      description: 'fail',
      execute: () => {
        throw new Error('boom');
      },
      undo: (s) => s,
    };
    const composite = new CompositeCommand('group', [delta('a', log, 1), failing]);
    const manager = new CommandManager<number>(0);

    expect(() => manager.execute(composite)).toThrow('boom');
    expect(manager.getState()).toBe(0); // a's effect was rolled back
    expect(manager.canUndo).toBe(false); // failed execute never reaches the undo stack
  });

  it('undo is all-or-nothing: a failure mid-undo re-applies whatever this undo pass already reverted', () => {
    const log: string[] = [];
    let xUndoShouldFail = false;
    const x: Command<number> = {
      description: 'x',
      execute: (s) => s + 1,
      undo: (s) => {
        if (xUndoShouldFail) throw new Error('x undo boom');
        return s - 1;
      },
      redo: (s) => s + 1,
    };
    const y = delta('y', log, 2);
    const composite = new CompositeCommand('group', [x, y]);
    const manager = new CommandManager<number>(0);

    manager.execute(composite); // state: 0 -> x(+1) -> y(+2) => 3
    expect(manager.getState()).toBe(3);

    xUndoShouldFail = true;
    expect(() => manager.undo()).toThrow('x undo boom');
    // y was undone then re-applied (redone) when x's undo failed, so state is back to 3.
    expect(manager.getState()).toBe(3);
  });
});

describe('Transaction', () => {
  it('collapses many live updates into exactly one undo-stack entry', () => {
    const manager = new CommandManager<number>(0);
    const tx = new Transaction(manager, 'drag');

    tx.update((s) => s + 1);
    tx.update((s) => s + 1);
    tx.update((s) => s + 1);
    const final = tx.commit();

    expect(final).toBe(3);
    expect(manager.getState()).toBe(3);
    expect(manager.undoCount).toBe(1);

    manager.undo();
    expect(manager.getState()).toBe(0);
  });
});
