export type StoreStatus = 'ready' | 'needs-permission' | 'unavailable';

export interface StoreCapabilities {
  readonly persistent: boolean;
  readonly needsUserGesture: boolean;
  readonly shareable: boolean;
  readonly worksOffline: boolean;
}

export interface BaseStore {
  readonly capabilities: StoreCapabilities;
  status(): Promise<StoreStatus>;
  requestAccess(): Promise<StoreStatus>;
}
