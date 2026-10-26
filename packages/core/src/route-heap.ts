export class StateHeap {
  private costs: number[] = [];
  private states: number[] = [];

  get size(): number {
    return this.states.length;
  }

  private less(a: number, b: number): boolean {
    if (this.costs[a] !== this.costs[b]) return this.costs[a]! < this.costs[b]!;
    return this.states[a]! < this.states[b]!;
  }

  private swap(a: number, b: number): void {
    const c = this.costs[a]!;
    this.costs[a] = this.costs[b]!;
    this.costs[b] = c;
    const s = this.states[a]!;
    this.states[a] = this.states[b]!;
    this.states[b] = s;
  }

  push(cost: number, state: number): void {
    this.costs.push(cost);
    this.states.push(state);
    let i = this.states.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { cost: number; state: number } {
    const top = { cost: this.costs[0]!, state: this.states[0]! };
    const lastCost = this.costs.pop()!;
    const lastState = this.states.pop()!;
    if (this.states.length > 0) {
      this.costs[0] = lastCost;
      this.states[0] = lastState;
      let i = 0;
      const n = this.states.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < n && this.less(l, m)) m = l;
        if (r < n && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}
