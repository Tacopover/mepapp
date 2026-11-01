import { runBuildingStoreContract } from '../contract/building-store.contract.js';
import { runLibraryStoreContract } from '../contract/library-store.contract.js';
import { runProjectStoreContract } from '../contract/project-store.contract.js';
import { runSettingsStoreContract } from '../contract/settings-store.contract.js';
import { MemoryBuildingStore } from './memory-building-store.js';
import { MemoryLibraryStore } from './memory-library-store.js';
import { MemoryProjectStore } from './memory-project-store.js';
import { MemorySettingsStore } from './memory-settings-store.js';

runLibraryStoreContract('MemoryLibraryStore', () => new MemoryLibraryStore());
runProjectStoreContract('MemoryProjectStore', () => new MemoryProjectStore());
runBuildingStoreContract('MemoryBuildingStore', () => new MemoryBuildingStore());
runSettingsStoreContract('MemorySettingsStore', () => new MemorySettingsStore());
