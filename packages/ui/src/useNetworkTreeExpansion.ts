import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Which Networks-tree rows are open. Lives above the tree because the dock unmounts the tree whenever
 * another tab is shown, and a state kept inside the tree would forget every open row on the way back.
 */
export interface NetworkTreeExpansion {
  disciplines: Set<string>;
  setDisciplines: Dispatch<SetStateAction<Set<string>>>;
  networks: Set<string>;
  setNetworks: Dispatch<SetStateAction<Set<string>>>;
  panels: Set<string>;
  setPanels: Dispatch<SetStateAction<Set<string>>>;
  circuits: Set<string>;
  setCircuits: Dispatch<SetStateAction<Set<string>>>;
}

export function useNetworkTreeExpansion(): NetworkTreeExpansion {
  const [disciplines, setDisciplines] = useState<Set<string>>(new Set());
  const [networks, setNetworks] = useState<Set<string>>(new Set());
  const [panels, setPanels] = useState<Set<string>>(new Set());
  const [circuits, setCircuits] = useState<Set<string>>(new Set());
  return { disciplines, setDisciplines, networks, setNetworks, panels, setPanels, circuits, setCircuits };
}
