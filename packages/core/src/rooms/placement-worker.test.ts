import { describe, expect, it } from 'vitest';
import {
  createPlacementWorkerHandler,
  manualRoom,
  planAutoPlacement,
  PlacementPlanCancelled,
  PlacementPlanClient,
  runPlacementPlan,
  type PlacementPlanInput,
  type PlacementRule,
  type PlacementWorkerLike,
  type PlacementWorkerRequest,
  type PlacementWorkerResponse,
} from './index.js';

const CAL = { pageUnitsPerRealUnit: 0.04 };
const rule: PlacementRule = {
  id: 'r', name: 'R', discipline: 'ventilation', roomTypeIds: [], stampDefinitionId: 'grille', preset: 'fixed', amount: { fixed: 30, unit: 'dm³/s' },
  capacityPerElement: 10, coverage: {}, layout: { strategy: 'grid', wallOffsetM: 0.5, rotation: 'room' }, writeCapacity: true,
};
const room = { ...manualRoom(0, [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }, { x: 0, y: 200 }]), id: 'room-1', name: 'A' };
const values = { areaM2: 50, perimeterM: 30, lengthM: 10, widthM: 5, axisDeg: 0, ceilingHeight: { mm: 2700, level: 'global' as const }, volumeM3: 135, people: null };
const input: PlacementPlanInput = { rules: [rule], rooms: [room], values: [[room.id, values]], calibrations: [[0, CAL]], sizes: [['grille', { width: 10, height: 10 }]] };

// In-process stand-in for a Worker, as in worker.test.ts. With `hold`, requests wait until release().
class FakeWorker implements PlacementWorkerLike {
  onmessage: ((event: { data: PlacementWorkerResponse }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  terminated = false;
  requests: PlacementWorkerRequest[] = [];
  constructor(private readonly hold = false) {}
  private handler = createPlacementWorkerHandler((m) => setTimeout(() => !this.terminated && this.onmessage?.({ data: m }), 0));
  postMessage(message: PlacementWorkerRequest): void {
    this.requests.push(message);
    if (!this.hold) setTimeout(() => this.handler(message), 0);
  }
  release(): void {
    for (const m of this.requests) this.handler(m);
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('runPlacementPlan', () => {
  it('gives the same plan as planAutoPlacement', () => {
    const direct = planAutoPlacement([rule], [room], () => values, () => CAL, () => ({ width: 10, height: 10 }));
    expect(runPlacementPlan(input)).toEqual(direct);
  });

  it('uses the existing stamps of a re-run', () => {
    const stamp = { id: 's1', category: 'terminal' as const, transform: { position: { x: 50, y: 50 }, rotationDegrees: 0, scale: { x: 1, y: 1 } }, nativeWidth: 10, nativeHeight: 10, ports: [], definitionId: 'grille', autoPlaced: { ruleId: 'r', roomId: 'room-1' } };
    const plan = runPlacementPlan({ ...input, existing: { stamps: [stamp], roomIds: ['room-1'] } });
    expect(plan.rows[0]!.existing.replace).toEqual(['s1']);
  });
});

describe('PlacementPlanClient', () => {
  it('runs a job in the worker', async () => {
    const workers: FakeWorker[] = [];
    const client = new PlacementPlanClient(() => (workers.push(new FakeWorker()), workers[workers.length - 1]!));
    const plan = await client.plan(input).promise;
    expect(plan.rows[0]!.stamps).toHaveLength(3);
    expect(workers).toHaveLength(1);
  });

  it('cancels the running job for a new one, and stops its worker', async () => {
    const workers: FakeWorker[] = [];
    const client = new PlacementPlanClient(() => (workers.push(new FakeWorker(workers.length === 0)), workers[workers.length - 1]!));
    const first = client.plan(input);
    const second = client.plan({ ...input, rules: [{ ...rule, amount: { fixed: 50, unit: 'dm³/s' } }] });
    await expect(first.promise).rejects.toBeInstanceOf(PlacementPlanCancelled);
    expect(workers[0]!.terminated).toBe(true);
    expect((await second.promise).rows[0]!.stamps).toHaveLength(5);
  });

  it('runs the job on the main thread without a worker factory', async () => {
    const client = new PlacementPlanClient(null);
    const cancelled = client.plan(input);
    cancelled.cancel();
    await expect(cancelled.promise).rejects.toBeInstanceOf(PlacementPlanCancelled);
    expect((await client.plan(input).promise).rows[0]!.stamps).toHaveLength(3);
  });

  it('reports an error of the worker', async () => {
    const client = new PlacementPlanClient(() => new FakeWorker());
    await expect(client.plan({ ...input, values: [] }).promise).rejects.toThrow('No room values for room-1');
  });
});
