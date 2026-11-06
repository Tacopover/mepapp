import { useMemo, useSyncExternalStore } from 'react';
import type { BuildingRef, BuildingStorageKind, BuildingStore, FileAccess } from '@mepapp/platform';
import { BuildingController, type BuildingState } from './buildingController.js';

export type UseBuilding = BuildingState &
  Pick<
    BuildingController,
    'create' | 'open' | 'openRecent' | 'importOldBuildings' | 'forgetRecent' | 'adopt' | 'update' | 'reload' | 'refreshSheetStatus' | 'dismissMessage' | 'allowAccess' | 'saveCopy'
  >;

const unavailableStore = (): BuildingStore => {
  throw new Error('Buildings are not available in this build.');
};

export function useBuilding(args: {
  fileAccess: FileAccess;
  makeStore?: (ref: BuildingRef, target?: unknown) => BuildingStore;
  buildingStorage?: BuildingStorageKind;
}): UseBuilding & { available: boolean } {
  const { fileAccess, makeStore, buildingStorage } = args;
  const api = useMemo(() => {
    const controller = new BuildingController({ fileAccess, makeStore: makeStore ?? unavailableStore, buildingStorage });
    return {
      subscribe: controller.subscribe.bind(controller),
      getState: controller.getState.bind(controller),
      create: controller.create.bind(controller),
      open: controller.open.bind(controller),
      openRecent: controller.openRecent.bind(controller),
      importOldBuildings: controller.importOldBuildings.bind(controller),
      forgetRecent: controller.forgetRecent.bind(controller),
      adopt: controller.adopt.bind(controller),
      update: controller.update.bind(controller),
      reload: controller.reload.bind(controller),
      refreshSheetStatus: controller.refreshSheetStatus.bind(controller),
      dismissMessage: controller.dismissMessage.bind(controller),
      allowAccess: controller.allowAccess.bind(controller),
      saveCopy: controller.saveCopy.bind(controller),
    };
  }, [fileAccess, makeStore, buildingStorage]);
  const state = useSyncExternalStore(api.subscribe, api.getState);
  return {
    ...state,
    create: api.create,
    open: api.open,
    openRecent: api.openRecent,
    importOldBuildings: api.importOldBuildings,
    forgetRecent: api.forgetRecent,
    adopt: api.adopt,
    update: api.update,
    reload: api.reload,
    refreshSheetStatus: api.refreshSheetStatus,
    dismissMessage: api.dismissMessage,
    allowAccess: api.allowAccess,
    saveCopy: api.saveCopy,
    available: makeStore !== undefined,
  };
}
