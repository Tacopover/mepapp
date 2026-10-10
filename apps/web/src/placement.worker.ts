// Web Worker entry for the auto-placement plan of the placement rule guide. The message protocol
// lives in @mepapp/core (rooms/placement-worker.ts); PlacementPlanClient is the main-thread side.
import { createPlacementWorkerHandler, type PlacementWorkerRequest } from '@mepapp/core';

const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<PlacementWorkerRequest>) => void) | null;
};

const handle = createPlacementWorkerHandler((message) => scope.postMessage(message));
scope.onmessage = (event) => handle(event.data);
