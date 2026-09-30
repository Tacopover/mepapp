// Message protocol and client for running detect-all in a Web Worker. Headless:
// the worker itself is created by the app (Vite `new Worker(new URL(...))`) and
// passed in as a factory, so this file has no DOM or bundler dependency.
//
// The detection is one synchronous computation, so a running job cannot read a
// cancel message. The client cancels by terminating the worker and creating a new
// one for the next job. Progress messages reach the caller while the job runs.

import { detectAllRoomsOnPage } from './detect.js';
import type { DetectAllPhase, DetectAllResult, RoomDetectionParams } from './types.js';

export interface RoomWorkerRequest {
  type: 'detect';
  id: number;
  segments: Float64Array; // 8 numbers per segment, see SEGMENT_STRIDE
  segmentCount: number;
  bounds: [number, number, number, number];
  mmPerPt: number;
  params?: Partial<RoomDetectionParams>;
  minRoomM2?: number;
  maxPixels?: number;
}

export type RoomWorkerResponse =
  | { type: 'progress'; id: number; fraction: number; phase: DetectAllPhase }
  | { type: 'result'; id: number; result: DetectAllResult }
  | { type: 'error'; id: number; message: string };

/** Worker side: returns the function that handles one incoming request. */
export function createRoomWorkerHandler(post: (message: RoomWorkerResponse) => void): (request: RoomWorkerRequest) => void {
  return (req) => {
    if (req.type !== 'detect') return;
    try {
      const result = detectAllRoomsOnPage(
        { segments: req.segments, segmentCount: req.segmentCount, bounds: req.bounds },
        req.mmPerPt,
        req.params,
        {
          minRoomM2: req.minRoomM2,
          maxPixels: req.maxPixels,
          onProgress: (fraction, phase) => post({ type: 'progress', id: req.id, fraction, phase }),
        },
      );
      post({ type: 'result', id: req.id, result });
    } catch (e) {
      post({ type: 'error', id: req.id, message: e instanceof Error ? e.message : String(e) });
    }
  };
}

/** The part of a Web Worker that the client uses. */
export interface RoomWorkerLike {
  postMessage(message: RoomWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { data: RoomWorkerResponse }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

export class RoomDetectionCancelled extends Error {
  constructor() {
    super('Room detection cancelled');
    this.name = 'RoomDetectionCancelled';
  }
}

export interface RoomDetectionJobInput {
  segments: Float64Array;
  segmentCount: number;
  bounds: [number, number, number, number];
  mmPerPt: number;
  params?: Partial<RoomDetectionParams>;
  minRoomM2?: number;
  maxPixels?: number;
}

export interface RoomDetectionJobOptions {
  onProgress?: (fraction: number, phase: DetectAllPhase) => void;
  // Hand the segment buffer to the worker instead of copying it. The caller loses the array. Default: copy.
  transfer?: boolean;
}

export interface RoomDetectionJob {
  promise: Promise<DetectAllResult>;
  cancel(): void;
}

/** Main-thread side. One job runs at a time: a new job cancels the running one. */
export class RoomDetectionClient {
  private worker: RoomWorkerLike | null = null;
  private nextId = 1;
  private current: { id: number; reject: (e: Error) => void } | null = null;

  constructor(private readonly createWorker: () => RoomWorkerLike) {}

  detect(input: RoomDetectionJobInput, options: RoomDetectionJobOptions = {}): RoomDetectionJob {
    this.cancelCurrent();
    const id = this.nextId++;
    const worker = this.worker ?? (this.worker = this.createWorker());
    const promise = new Promise<DetectAllResult>((resolve, reject) => {
      this.current = { id, reject };
      worker.onmessage = (event) => {
        const m = event.data;
        if (m.id !== id) return;
        if (m.type === 'progress') options.onProgress?.(m.fraction, m.phase);
        else {
          this.current = null;
          if (m.type === 'result') resolve(m.result);
          else reject(new Error(m.message));
        }
      };
      worker.onerror = (event) => {
        this.current = null;
        this.dropWorker();
        reject(new Error(event.message ?? 'Room detection worker failed'));
      };
      const request: RoomWorkerRequest = { type: 'detect', id, ...input };
      worker.postMessage(request, options.transfer ? [input.segments.buffer] : []);
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
    const { reject } = this.current;
    this.current = null;
    this.dropWorker();
    reject(new RoomDetectionCancelled());
  }

  private dropWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
