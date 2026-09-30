// Web Worker entry for detect-all room detection. The message protocol lives in
// @mepapp/core (rooms/worker.ts); RoomDetectionClient is the main-thread side.
import { createRoomWorkerHandler, type RoomWorkerRequest } from '@mepapp/core';

const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<RoomWorkerRequest>) => void) | null;
};

const handle = createRoomWorkerHandler((message) => scope.postMessage(message));
scope.onmessage = (event) => handle(event.data);
