// Undo/redo: command pattern with two-stack history, same family as the old
// app (ICommand.cs, CommandManager.cs, CompositeCommand.cs) with two
// deliberate fixes: CompositeCommand's undo here is all-or-nothing, unlike
// the old app's undo, which logged a failure and kept going even though its
// own Execute/Redo were all-or-nothing (CompositeCommand.cs:38-127) — an
// inconsistency, not a behavior worth reproducing. And Transaction below
// replaces the old app's per-tool hand-rolled "apply live, register one
// command at gesture-end" convention (MepDragHandler.cs:640-706,
// CommandManager.AddExecutedCommand) with a reusable primitive.
//
// Commands operate on an immutable state value S: execute/undo/redo each
// take the current state and return the next state, rather than mutating
// shared service state in place the way the old app's ICommand did.

export interface Command<S> {
  readonly description: string;
  execute(state: S): S;
  undo(state: S): S;
  /**
   * Defaults to re-running execute. Override only when redo must differ from
   * a plain replay — e.g. it needs to re-resolve fresh object references
   * rather than reapply a stale snapshot, the same reason the old app's
   * CreateElementCommand overrides RedoInternal instead of reusing Execute
   * (proven load-bearing by UndoRedoUndo_LeavesNoDuplicateOnTheNodes in
   * CreateElementCommandTests.cs).
   */
  redo?(state: S): S;
}

function runRedo<S>(command: Command<S>, state: S): S {
  return command.redo ? command.redo(state) : command.execute(state);
}

export interface CommandManagerOptions {
  maxHistory?: number;
}

/**
 * Two-stack undo/redo history over immutable state. Executing a new command
 * clears the redo stack, same as the old app (CommandManager.cs:264).
 */
export class CommandManager<S> {
  private state: S;
  private undoStack: Command<S>[] = [];
  private redoStack: Command<S>[] = [];
  private readonly maxHistory: number;

  constructor(initialState: S, options: CommandManagerOptions = {}) {
    this.state = initialState;
    this.maxHistory = options.maxHistory ?? 50;
  }

  getState(): S {
    return this.state;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }

  execute(command: Command<S>): S {
    this.state = command.execute(this.state);
    this.pushUndo(command);
    this.redoStack = [];
    return this.state;
  }

  /**
   * Registers a command as already applied, without calling execute — for a
   * mutation that already happened live (e.g. every mouse-move of a drag),
   * the same role as the old app's CommandManager.AddExecutedCommand. Prefer
   * Transaction below for the common case of one gesture, many live steps.
   */
  addExecuted(command: Command<S>): void {
    this.pushUndo(command);
    this.redoStack = [];
  }

  /** Escape hatch for Transaction: applies live state without touching either history stack. */
  setLiveState(state: S): void {
    this.state = state;
  }

  undo(): S {
    const command = this.undoStack.pop();
    if (!command) {
      return this.state;
    }
    this.state = command.undo(this.state);
    this.redoStack.push(command);
    return this.state;
  }

  redo(): S {
    const command = this.redoStack.pop();
    if (!command) {
      return this.state;
    }
    this.state = runRedo(command, this.state);
    this.undoStack.push(command);
    return this.state;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  private pushUndo(command: Command<S>): void {
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }
}

/**
 * Groups sub-commands into one undo-stack entry. Execute and redo apply
 * forward and are all-or-nothing: on failure, everything that already
 * succeeded is rolled back before the error is rethrown, matching the old
 * app (CompositeCommand.cs:38-98). Undo applies in reverse and is also
 * all-or-nothing here — the old app's undo was best-effort instead, an
 * inconsistency this rebuild deliberately does not carry over.
 */
export class CompositeCommand<S> implements Command<S> {
  constructor(
    readonly description: string,
    private readonly subCommands: Command<S>[],
  ) {}

  execute(state: S): S {
    return this.runForward(state, (command, s) => command.execute(s));
  }

  redo(state: S): S {
    return this.runForward(state, (command, s) => runRedo(command, s));
  }

  undo(state: S): S {
    let current = state;
    const undone: Command<S>[] = [];
    try {
      for (const command of [...this.subCommands].reverse()) {
        current = command.undo(current);
        undone.push(command);
      }
      return current;
    } catch (error) {
      for (const command of undone.reverse()) {
        current = runRedo(command, current);
      }
      throw error;
    }
  }

  private runForward(state: S, apply: (command: Command<S>, state: S) => S): S {
    let current = state;
    const applied: Command<S>[] = [];
    try {
      for (const command of this.subCommands) {
        current = apply(command, current);
        applied.push(command);
      }
      return current;
    } catch (error) {
      for (const command of applied.reverse()) {
        current = command.undo(current);
      }
      throw error;
    }
  }
}

/**
 * Batches a sequence of live state updates (e.g. every mouse-move of a
 * drag) into a single undo-stack entry. Replaces the old app's per-tool
 * hand-rolled version of this same pattern (MepDragHandler.cs:640-706) with
 * a reusable primitive any tool can use directly.
 */
export class Transaction<S> {
  private readonly before: S;
  private current: S;

  constructor(
    private readonly manager: CommandManager<S>,
    private readonly description: string,
  ) {
    this.before = manager.getState();
    this.current = this.before;
  }

  /** Applies a live mutation immediately, outside the undo history. Call on every intermediate step of the gesture. */
  update(mutate: (state: S) => S): S {
    this.current = mutate(this.current);
    this.manager.setLiveState(this.current);
    return this.current;
  }

  /** Closes the transaction, registering exactly one undo-stack entry for the whole gesture. */
  commit(): S {
    const before = this.before;
    const after = this.current;
    this.manager.addExecuted({
      description: this.description,
      execute: () => after,
      undo: () => before,
    });
    return after;
  }
}
