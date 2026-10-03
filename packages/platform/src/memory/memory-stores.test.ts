import { runLibraryStoreContract } from '../contract/library-store.contract.js';
import { runProjectStoreContract } from '../contract/project-store.contract.js';
import { runSettingsStoreContract } from '../contract/settings-store.contract.js';
import { MemoryLibraryStore } from './memory-library-store.js';
import { MemoryProjectStore } from './memory-project-store.js';
import { MemorySettingsStore } from './memory-settings-store.js';

runLibraryStoreContract('MemoryLibraryStore', () => new MemoryLibraryStore());
runProjectStoreContract('MemoryProjectStore', () => new MemoryProjectStore());
runSettingsStoreContract('MemorySettingsStore', () => new MemorySettingsStore());
