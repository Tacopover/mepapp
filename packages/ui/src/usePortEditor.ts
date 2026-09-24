// Ports tool state + logic (shared-drawing-tool.md §6, Phase 2) — extracted from
// ElementEditorDialog.tsx so the schematic symbol editor can reuse the same connection-point
// mechanics the stamp editor already has (both need ports: annotations snap to them, matching
// the old MEPSketcher app's behavior). Deliberately returns plain state + handlers, not JSX —
// each consumer renders its own port-dot/rename-input overlay against its own canvas/SVG
// surface, so this hook has no rendering opinion and no dependency on useShapeDrawEditor's
// module; the two are wired together only via the options below, passed explicitly by the
// consumer (never a shared global).
import { useState, type Dispatch, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react';
import { gridSnap, type PortSpec } from '@mepapp/core';

export interface UsePortEditorOptions {
  initialPorts?: PortSpec[];
  initialGroups?: string[][];
  gridSnapEnabled: boolean;
  gridSpacingFraction: number;
  /** The same screen->fraction conversion a shape editor exposes (useShapeDrawEditor's
      fractionFromEvent) — passed in rather than re-derived. */
  fractionFromEvent: (clientX: number, clientY: number, clamp?: boolean) => { fractionX: number; fractionY: number };
}

export interface PortEditor {
  ports: PortSpec[];
  setPorts: Dispatch<SetStateAction<PortSpec[]>>;
  groups: string[][];
  linkMode: boolean;
  setLinkMode: Dispatch<SetStateAction<boolean>>;
  linkFirstPortId: string | null;
  setLinkFirstPortId: Dispatch<SetStateAction<string | null>>;
  editingPortId: string | null;
  setEditingPortId: Dispatch<SetStateAction<string | null>>;
  editPortName: string;
  setEditPortName: Dispatch<SetStateAction<string>>;
  editingPort: PortSpec | undefined;
  addPortAt: (fractionX: number, fractionY: number) => void;
  linkPorts: (a: string, b: string) => void;
  handlePortPointerDown: (event: ReactPointerEvent<HTMLDivElement>, portId: string) => void;
  handlePortDoubleClick: (event: ReactMouseEvent<HTMLDivElement>, port: PortSpec) => void;
  commitPortRename: () => void;
  removePort: (id: string) => void;
  ungroup: (index: number) => void;
  portName: (id: string) => string;
}

export function usePortEditor(options: UsePortEditorOptions): PortEditor {
  const { gridSnapEnabled, gridSpacingFraction, fractionFromEvent } = options;
  const [ports, setPorts] = useState<PortSpec[]>(options.initialPorts ?? []);
  const [groups, setGroups] = useState<string[][]>(options.initialGroups ?? []);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFirstPortId, setLinkFirstPortId] = useState<string | null>(null);
  const [editingPortId, setEditingPortId] = useState<string | null>(null);
  const [editPortName, setEditPortName] = useState('');

  function addPortAt(fractionX: number, fractionY: number) {
    const id = crypto.randomUUID();
    const x = gridSnapEnabled ? gridSnap(fractionX, gridSpacingFraction) : fractionX;
    const y = gridSnapEnabled ? gridSnap(fractionY, gridSpacingFraction) : fractionY;
    setPorts((prev) => [...prev, { id, name: `Port ${prev.length + 1}`, fractionX: x, fractionY: y }]);
  }

  function linkPorts(a: string, b: string) {
    setGroups((prev) => {
      const groupA = prev.find((g) => g.includes(a));
      const groupB = prev.find((g) => g.includes(b));
      if (groupA && groupA === groupB) return prev;
      if (groupA && groupB) return [...prev.filter((g) => g !== groupA && g !== groupB), [...new Set([...groupA, ...groupB])]];
      if (groupA) return prev.map((g) => (g === groupA ? [...g, b] : g));
      if (groupB) return prev.map((g) => (g === groupB ? [...g, a] : g));
      return [...prev, [a, b]];
    });
  }

  function handlePortPointerDown(event: ReactPointerEvent<HTMLDivElement>, portId: string) {
    event.stopPropagation();
    if (linkMode) {
      if (!linkFirstPortId) {
        setLinkFirstPortId(portId);
      } else if (linkFirstPortId === portId) {
        setLinkFirstPortId(null);
      } else {
        linkPorts(linkFirstPortId, portId);
        setLinkFirstPortId(null);
      }
      return;
    }
    const move = (ev: PointerEvent) => {
      const current = fractionFromEvent(ev.clientX, ev.clientY);
      const fractionX = gridSnapEnabled ? gridSnap(current.fractionX, gridSpacingFraction) : current.fractionX;
      const fractionY = gridSnapEnabled ? gridSnap(current.fractionY, gridSpacingFraction) : current.fractionY;
      setPorts((prev) => prev.map((p) => (p.id === portId ? { ...p, fractionX, fractionY } : p)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function handlePortDoubleClick(event: ReactMouseEvent<HTMLDivElement>, port: PortSpec) {
    event.stopPropagation();
    setEditingPortId(port.id);
    setEditPortName(port.name);
  }

  function commitPortRename() {
    if (editingPortId && editPortName.trim()) {
      const trimmed = editPortName.trim();
      setPorts((prev) => prev.map((p) => (p.id === editingPortId ? { ...p, name: trimmed } : p)));
    }
    setEditingPortId(null);
  }

  function removePort(id: string) {
    setPorts((prev) => prev.filter((p) => p.id !== id));
    setGroups((prev) => prev.map((g) => g.filter((pid) => pid !== id)).filter((g) => g.length >= 2));
    if (linkFirstPortId === id) setLinkFirstPortId(null);
  }

  function ungroup(index: number) {
    setGroups((prev) => prev.filter((_, i) => i !== index));
  }

  function portName(id: string): string {
    return ports.find((p) => p.id === id)?.name ?? id;
  }

  const editingPort = editingPortId ? ports.find((p) => p.id === editingPortId) : undefined;

  return {
    ports,
    setPorts,
    groups,
    linkMode,
    setLinkMode,
    linkFirstPortId,
    setLinkFirstPortId,
    editingPortId,
    setEditingPortId,
    editPortName,
    setEditPortName,
    editingPort,
    addPortAt,
    linkPorts,
    handlePortPointerDown,
    handlePortDoubleClick,
    commitPortRename,
    removePort,
    ungroup,
    portName,
  };
}
