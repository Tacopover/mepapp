import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * The Networks tree's own UI state: which rows are open, and the circuit bulk-edit mode with its
 * checked circuits. Lives above the tree because the dock unmounts the tree whenever another tab is
 * shown, and a state kept inside the tree would forget it on the way back.
 */
export interface NetworkTreeState {
  disciplines: Set<string>;
  setDisciplines: Dispatch<SetStateAction<Set<string>>>;
  networks: Set<string>;
  setNetworks: Dispatch<SetStateAction<Set<string>>>;
  panels: Set<string>;
  setPanels: Dispatch<SetStateAction<Set<string>>>;
  circuits: Set<string>;
  setCircuits: Dispatch<SetStateAction<Set<string>>>;
  /** Bulk-edit mode: circuit rows get checkboxes and a bar to set prefix and type on all checked circuits. */
  bulkMode: boolean;
  setBulkMode: Dispatch<SetStateAction<boolean>>;
  checkedCircuits: Set<string>;
  setCheckedCircuits: Dispatch<SetStateAction<Set<string>>>;
}

export function useNetworkTreeState(): NetworkTreeState {
  const [disciplines, setDisciplines] = useState<Set<string>>(new Set());
  const [networks, setNetworks] = useState<Set<string>>(new Set());
  const [panels, setPanels] = useState<Set<string>>(new Set());
  const [circuits, setCircuits] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [checkedCircuits, setCheckedCircuits] = useState<Set<string>>(new Set());
  return { bulkMode, setBulkMode, checkedCircuits, setCheckedCircuits, disciplines, setDisciplines, networks, setNetworks, panels, setPanels, circuits, setCircuits };
}
