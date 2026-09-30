import { describe, expect, it } from 'vitest';
import { RoomDetectionCancelled, RoomDetectionClient, SEGMENT_STRIDE, createRoomWorkerHandler, type RoomWorkerLike, type RoomWorkerRequest, type RoomWorkerResponse } from './index.js';

const MM = 25;
const T = 8;

// One closed room of 240 x 160 pt (24 m2) with double-line walls.
function roomInput(): { segments: Float64Array; segmentCount: number; bounds: [number, number, number, number]; mmPerPt: number } {
  const x = 100;
  const y = 100;
  const list = [
    [x, y, x + 240, y],
    [x - T, y - T, x + 240 + T, y - T],
    [x, y + 160, x + 240, y + 160],
    [x - T, y + 160 + T, x + 240 + T, y + 160 + T],
    [x, y, x, y + 160],
    [x - T, y - T, x - T, y + 160 + T],
    [x + 240, y, x + 240, y + 160],
    [x + 240 + T, y - T, x + 240 + T, y + 160 + T],
  ];
  const segments = new Float64Array(list.length * SEGMENT_STRIDE);
  list.forEach((s, i) => segments.set([s[0]!, s[1]!, s[2]!, s[3]!, 0.5, 0, 0, i + 1], i * SEGMENT_STRIDE));
  return { segments, segmentCount: list.length, bounds: [0, 0, 500, 400], mmPerPt: MM };
}

// In-process stand-in for a Worker: the handler runs in a later task, replies arrive asynchronously.
class FakeWorker implements RoomWorkerLike {
  onmessage: ((event: { data: RoomWorkerResponse }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  terminated = false;
  requests: RoomWorkerRequest[] = [];
  constructor(private readonly hold = false) {}
  private handler = createRoomWorkerHandler((m) => setTimeout(() => !this.terminated && this.onmessage?.({ data: m }), 0));
  postMessage(message: RoomWorkerRequest): void {
    this.requests.push(message);
    if (!this.hold) setTimeout(() => this.handler(message), 0);
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('createRoomWorkerHandler', () => {
  it('posts progress and one result for a request', () => {
    const out: RoomWorkerResponse[] = [];
    const input = roomInput();
    createRoomWorkerHandler((m) => out.push(m))({ type: 'detect', id: 7, ...input });
    expect(out.every((m) => m.id === 7)).toBe(true);
    expect(out.filter((m) => m.type === 'progress').length).toBeGreaterThan(2);
    const last = out[out.length - 1]!;
    expect(last.type).toBe('result');
    if (last.type === 'result') expect(last.result.rooms).toHaveLength(1);
  });

  it('answers a request with targets with one labelled room per label', () => {
    const out: RoomWorkerResponse[] = [];
    const input = roomInput();
    createRoomWorkerHandler((m) => out.push(m))({ type: 'detect', id: 3, ...input, targets: [{ anchor: { x: 200, y: 180 }, printedM2: 24 }] });
    const last = out[out.length - 1]!;
    expect(last.type).toBe('labelled');
    if (last.type === 'labelled') {
      expect(last.result.rooms).toHaveLength(1);
      expect(last.result.rooms[0]!.target).toBe(0);
    }
    expect(out.some((m) => m.type === 'progress' && m.phase === 'labels')).toBe(true);
  });

  it('client detectLabelled resolves with the labelled result', async () => {
    const client = new RoomDetectionClient(() => new FakeWorker());
    const input = roomInput();
    const result = await client.detectLabelled({ ...input, targets: [{ anchor: { x: 200, y: 180 }, printedM2: null }] }).promise;
    expect(result.rooms).toHaveLength(1);
    client.dispose();
  });

  it('posts an error message when detection throws', () => {
    const out: RoomWorkerResponse[] = [];
    const input = roomInput();
    createRoomWorkerHandler((m) => out.push(m))({ type: 'detect', id: 1, ...input, segments: null as unknown as Float64Array });
    expect(out[out.length - 1]!.type).toBe('error');
  });
});

describe('RoomDetectionClient', () => {
  it('resolves with the rooms and forwards progress', async () => {
    const worker = new FakeWorker();
    const client = new RoomDetectionClient(() => worker);
    const seen: number[] = [];
    const res = await client.detect(roomInput(), { onProgress: (f) => seen.push(f) }).promise;
    expect(res.rooms).toHaveLength(1);
    expect(seen.length).toBeGreaterThan(2);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('reuses one worker for consecutive jobs', async () => {
    let created = 0;
    const client = new RoomDetectionClient(() => {
      created++;
      return new FakeWorker();
    });
    await client.detect(roomInput()).promise;
    await client.detect(roomInput()).promise;
    expect(created).toBe(1);
  });

  it('cancel rejects the job, terminates the worker and the next job gets a new worker', async () => {
    const workers: FakeWorker[] = [];
    const client = new RoomDetectionClient(() => {
      const w = new FakeWorker(workers.length === 0);
      workers.push(w);
      return w;
    });
    const job = client.detect(roomInput());
    job.cancel();
    await expect(job.promise).rejects.toBeInstanceOf(RoomDetectionCancelled);
    expect(workers[0]!.terminated).toBe(true);
    const res = await client.detect(roomInput()).promise;
    expect(workers).toHaveLength(2);
    expect(res.rooms).toHaveLength(1);
  });

  it('a new job cancels the running job', async () => {
    const workers: FakeWorker[] = [];
    const client = new RoomDetectionClient(() => {
      const w = new FakeWorker(workers.length === 0);
      workers.push(w);
      return w;
    });
    const first = client.detect(roomInput());
    const second = client.detect(roomInput());
    await expect(first.promise).rejects.toBeInstanceOf(RoomDetectionCancelled);
    expect((await second.promise).rooms).toHaveLength(1);
  });

  it('rejects when the worker reports an error and recovers with a new worker', async () => {
    let created = 0;
    const client = new RoomDetectionClient(() => {
      const w = new FakeWorker(created++ === 0);
      return w;
    });
    const job = client.detect(roomInput());
    // The first worker never answers: its error event rejects the job.
    (client as unknown as { worker: FakeWorker }).worker.onerror?.({ message: 'boom' });
    await expect(job.promise).rejects.toThrow('boom');
    expect((await client.detect(roomInput()).promise).rooms).toHaveLength(1);
    expect(created).toBe(2);
  });

  it('transfers the segment buffer only when asked', () => {
    const worker = new FakeWorker(true);
    const posted: (Transferable[] | undefined)[] = [];
    const orig = worker.postMessage.bind(worker);
    worker.postMessage = (m, t) => {
      posted.push(t);
      orig(m);
    };
    const client = new RoomDetectionClient(() => worker);
    const input = roomInput();
    client.detect(input).promise.catch(() => undefined);
    client.detect(input, { transfer: true }).promise.catch(() => undefined);
    expect(posted[0]).toEqual([]);
    expect(posted[1]).toEqual([input.segments.buffer]);
    client.dispose();
  });
});
