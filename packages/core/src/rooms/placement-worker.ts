// Message protocol and client for running planAutoPlacement in a Web Worker (room-placement-followup.md
// Phase D). Headless, as rooms/worker.ts: the app creates the worker (Vite `new Worker(new URL(...))`)
// and passes it in as a factory. The worker gets plain data only: the room values, calibrations and
// stamp sizes are computed on the main thread and sent with each job.
//
// A plan is one synchronous computation, so a running job cannot read a cancel message. The client
// cancels by terminating the worker and creating a new one for the next job. Without a worker factory
// (tests, or a platform without workers) the client runs the job on the main thread after a timeout.

import type { Calibration } from '../calibration.js';
import type { PlacedStamp } from '../stamp.js';
import { planAutoPlacement } from './placement-layout.js';
import type { PlacementRule } from './placement-rule.js';
import type { Room } from './room.js';
import type { RoomValues } from './room-values.js';

export interface PlacementPlanInput {
  rules: PlacementRule[];
  rooms: Room[];
  /** The values of each room, by room id. */
  values: [string, RoomValues][];
  /** The calibration of each page, by page index. */
  calibrations: [number, Calibration | null][];
  /** The placed size of each stamp definition in page points, by definition id; null = not found. */
  sizes: [string, { width: number; height: number } | null][];
  /** A re-run: the stamps of the drawing and the ids of every room of the drawing. */
  existing?: { stamps: PlacedStamp[]; roomIds: string[] };
}

export type PlacementPlan = ReturnType<typeof planAutoPlacement>;

/** planAutoPlacement with the plain data of a job. */
export function runPlacementPlan(input: PlacementPlanInput): PlacementPlan {
  const values = new Map(input.values);
  const calibrations = new Map(input.calibrations);
  const sizes = new Map(input.sizes);
  return planAutoPlacement(
    input.rules,
    input.rooms,
    (room) => {
      const v = values.get(room.id);
      if (!v) throw new Error(`No room values for ${room.id}`);
      return v;
    },
    (page) => calibrations.get(page) ?? null,
    (id) => sizes.get(id) ?? null,
    input.existing ? { stamps: input.existing.stamps, roomIds: new Set(input.existing.roomIds) } : undefined,
  );
}

export interface PlacementWorkerRequest {
  type: 'plan';
  id: number;
  input: PlacementPlanInput;
}

export type PlacementWorkerResponse = { type: 'result'; id: number; plan: PlacementPlan } | { type: 'error'; id: number; message: string };

/** Worker side: returns the function that handles one incoming request. */
export function createPlacementWorkerHandler(post: (message: PlacementWorkerResponse) => void): (request: PlacementWorkerRequest) => void {
  return (req) => {
    if (req.type !== 'plan') return;
    try {
      post({ type: 'result', id: req.id, plan: runPlacementPlan(req.input) });
    } catch (e) {
      post({ type: 'error', id: req.id, message: e instanceof Error ? e.message : String(e) });
    }
  };
}

/** The part of a Web Worker that the client uses. */
export interface PlacementWorkerLike {
  postMessage(message: PlacementWorkerRequest): void;
  terminate(): void;
  onmessage: ((event: { data: PlacementWorkerResponse }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

export class PlacementPlanCancelled extends Error {
  constructor() {
    super('Placement plan cancelled');
    this.name = 'PlacementPlanCancelled';
  }
}

export interface PlacementPlanJob {
  promise: Promise<PlacementPlan>;
  cancel(): void;
}

/** Main-thread side. One job runs at a time: a new job cancels the running one. */
export class PlacementPlanClient {
  private worker: PlacementWorkerLike | null = null;
  private nextId = 1;
  private current: { id: number; reject: (e: Error) => void; timer?: ReturnType<typeof setTimeout> } | null = null;

  constructor(private readonly createWorker: (() => PlacementWorkerLike) | null) {}

  plan(input: PlacementPlanInput): PlacementPlanJob {
    this.cancelCurrent();
    const id = this.nextId++;
    const promise = new Promise<PlacementPlan>((resolve, reject) => {
      if (!this.createWorker) {
        const timer = setTimeout(() => {
          this.current = null;
          try {
            resolve(runPlacementPlan(input));
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        }, 0);
        this.current = { id, reject, timer };
        return;
      }
      const worker = this.worker ?? (this.worker = this.createWorker());
      this.current = { id, reject };
      worker.onmessage = (event) => {
        const m = event.data;
        if (m.id !== id) return;
        this.current = null;
        if (m.type === 'result') resolve(m.plan);
        else reject(new Error(m.message));
      };
      worker.onerror = (event) => {
        this.current = null;
        this.dropWorker();
        reject(new Error(event.message ?? 'Placement worker failed'));
      };
      worker.postMessage({ type: 'plan', id, input });
    });
    return { promise, cancel: () => this.cancelJob(id) };
  }

  /** Stops the running job and releases the worker. */
  dispose(): void {
    this.cancelCurrent();
    this.dropWorker();
  }

  private cancelJob(id: number): void {
    if (this.current?.id === id) this.cancelCurrent();
  }

  private cancelCurrent(): void {
    if (!this.current) return;
    const { reject, timer } = this.current;
    this.current = null;
    if (timer !== undefined) clearTimeout(timer);
    else this.dropWorker();
    reject(new PlacementPlanCancelled());
  }

  private dropWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
