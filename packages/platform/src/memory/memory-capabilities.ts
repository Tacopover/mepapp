import type { StoreCapabilities } from '../store.js';

export const MEMORY_CAPABILITIES: StoreCapabilities = {
  persistent: false,
  needsUserGesture: false,
  shareable: false,
  worksOffline: true,
};
