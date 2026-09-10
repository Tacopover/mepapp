import { useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Discipline, PortSpec, StampCategory, StampDefinition } from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { loadStampBitmap } from '../stampBitmap.js';

/** Same 300 DPI convention as stampBitmap.ts/scene.ts's STAMP_SOURCE_DPI — stamp art's pixel size at 300 DPI is expected to match its nominal size in PDF points. */
const STAMP_SOURCE_DPI = 300;

const DISCIPLINE_OPTIONS: Discipline[] = [
  'heatingAndCooling',
  'ventilation',
  'plumbing',
  'fireProtection',
  'electricalPathways',
  'electricalCircuits',
];

const DISCIPLINE_LABEL: Record<Discipline, string> = {
  heatingAndCooling: 'Heating & Cooling',
  ventilation: 'Ventilation',
  plumbing: 'Plumbing',
  fireProtection: 'Fire Protection',
  electricalPathways: 'Electrical Pathways',
  electricalCircuits: 'Electrical Circuits',
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export interface ElementEditorDialogProps {
  /** The definition being edited ("Edit ports…" from a placed custom instance's Properties panel), or undefined for "Create custom element". Editing changes the definition going forward — it does not retroactively touch instances already placed from it, same as a library definition's own fields were never live-linked to its placed instances. */
  definition?: StampDefinition;
  onSave: (definition: StampDefinition) => void;
  onClose: () => void;
}

/**
 * Element Editor dialog, Ports mode (ports-custom-element-editor-spec.md
 * §5.2) — authors a custom StampDefinition: name/discipline/category, a
 * raster artwork import, and click-to-place ports with drag-to-reposition,
 * double-click-to-rename, and a link-mode toggle for grouping ports that are
 * internally wired together (converted to a real instance-level PortGroup at
 * placement, see SketchScene.placeStamp). Shapes-mode vector authoring
 * (§5.3) is a separate, not-yet-built phase.
 */
export function ElementEditorDialog({ definition, onSave, onClose }: ElementEditorDialogProps) {
  const [name, setName] = useState(definition?.label ?? '');
  const [discipline, setDiscipline] = useState<Discipline>(definition?.discipline ?? 'ventilation');
  const [category, setCategory] = useState<StampCategory>(definition?.category === 'equipment' ? 'equipment' : 'terminal');
  const [artworkDataUrl, setArtworkDataUrl] = useState<string | null>(definition?.iconRef ?? null);
  const [nativeWidth, setNativeWidth] = useState(definition?.nativeWidth ?? 0);
  const [nativeHeight, setNativeHeight] = useState(definition?.nativeHeight ?? 0);
  const [ports, setPorts] = useState<PortSpec[]>(definition?.ports ?? []);
  const [groups, setGroups] = useState<string[][]>(definition?.definitionPortGroups ?? []);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFirstPortId, setLinkFirstPortId] = useState<string | null>(null);
  const [editingPortId, setEditingPortId] = useState<string | null>(null);
  const [editPortName, setEditPortName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  async function handleArtworkFile(file: File) {
    const [dataUrl, bitmap] = await Promise.all([readAsDataUrl(file), loadStampBitmap(file)]);
    setArtworkDataUrl(dataUrl);
    setNativeWidth((bitmap.width * 72) / STAMP_SOURCE_DPI);
    setNativeHeight((bitmap.height * 72) / STAMP_SOURCE_DPI);
  }

  function fractionFromEvent(clientX: number, clientY: number): { fractionX: number; fractionY: number } {
    const rect = previewRef.current!.getBoundingClientRect();
    return { fractionX: clamp01((clientX - rect.left) / rect.width), fractionY: clamp01((clientY - rect.top) / rect.height) };
  }

  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    if (!artworkDataUrl) return;
    const { fractionX, fractionY } = fractionFromEvent(event.clientX, event.clientY);
    const id = crypto.randomUUID();
    setPorts((prev) => [...prev, { id, name: `Port ${prev.length + 1}`, fractionX, fractionY }]);
  }

  function linkPorts(a: string, b: string) {
    setGroups((prev) => {
      const groupA = prev.find((g) => g.includes(a));
      const groupB = prev.find((g) => g.includes(b));
      if (groupA && groupA === groupB) return prev; // already linked
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
      const { fractionX, fractionY } = fractionFromEvent(ev.clientX, ev.clientY);
      setPorts((prev) => prev.map((p) => (p.id === portId ? { ...p, fractionX, fractionY } : p)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function handlePortDoubleClick(event: MouseEvent<HTMLDivElement>, port: PortSpec) {
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

  function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!artworkDataUrl || !nativeWidth || !nativeHeight) {
      setError('Artwork is required.');
      return;
    }
    onSave({
      id: definition?.id ?? crypto.randomUUID(),
      label: name.trim(),
      discipline,
      category,
      nativeWidth,
      nativeHeight,
      ports,
      iconRef: artworkDataUrl,
      source: 'custom',
      definitionPortGroups: groups.length > 0 ? groups : undefined,
    });
  }

  const editingPort = editingPortId ? ports.find((p) => p.id === editingPortId) : undefined;

  return (
    <Dialog
      title={definition ? 'Edit Element' : 'Create Custom Element'}
      onClose={onClose}
      actions={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleSave}>{definition ? 'Save' : 'Create'}</button>
        </>
      }
    >
      <div className="mep-section">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline)}>
          {DISCIPLINE_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {DISCIPLINE_LABEL[d]}
            </option>
          ))}
        </select>
        <div className="mep-seg2" style={{ width: '100%', marginBottom: 12 }}>
          {(['terminal', 'equipment'] as StampCategory[]).map((c) => (
            <button key={c} type="button" className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>
              {c === 'terminal' ? 'Terminal' : 'Equipment'}
            </button>
          ))}
        </div>
      </div>

      <div className="mep-section">
        <h4>Artwork</h4>
        <label className="mep-stamp-tile mep-file-btn" style={{ width: '100%' }}>
          {artworkDataUrl ? 'Replace image…' : 'Import image…'}
          <input
            type="file"
            accept="image/png,image/svg+xml"
            onChange={(e) => e.target.files?.[0] && void handleArtworkFile(e.target.files[0])}
          />
        </label>

        <p className="mep-hint">Click the preview to add a port. Drag a port to move it. Double-click a port to rename it.</p>
        <div className="mep-element-editor-preview" ref={previewRef} onClick={handlePreviewClick}>
          {artworkDataUrl && <img src={artworkDataUrl} alt="" />}
          {ports.map((port) => (
            <div
              key={port.id}
              className={`mep-element-editor-port${linkMode && linkFirstPortId === port.id ? ' selected' : ''}`}
              style={{ left: `${port.fractionX * 100}%`, top: `${port.fractionY * 100}%` }}
              onPointerDown={(e) => handlePortPointerDown(e, port.id)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => handlePortDoubleClick(e, port)}
              title={port.name}
            >
              <span className="mep-element-editor-port-label">{port.name}</span>
            </div>
          ))}
          {editingPort && (
            <input
              autoFocus
              className="mep-element-editor-port-rename"
              style={{ left: `${editingPort.fractionX * 100}%`, top: `${editingPort.fractionY * 100}%` }}
              value={editPortName}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditPortName(e.target.value)}
              onBlur={commitPortRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitPortRename();
                if (e.key === 'Escape') setEditingPortId(null);
              }}
            />
          )}
        </div>
      </div>

      {ports.length > 0 && (
        <div className="mep-section">
          <h4>Ports</h4>
          {ports.map((port) => (
            <div className="mep-port-list-row" key={port.id}>
              <input value={port.name} onChange={(e) => setPorts((prev) => prev.map((p) => (p.id === port.id ? { ...p, name: e.target.value } : p)))} />
              <button type="button" className="mep-property-row-remove" onClick={() => removePort(port.id)} title="Remove port">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {ports.length >= 2 && (
        <div className="mep-section">
          <h4>Linked Ports</h4>
          <p className="mep-hint">
            Linked ports collapse into one connectivity node once placed — e.g. a unit's supply and return, so a
            segment between them never bridges the two networks.
          </p>
          <button type="button" className={linkMode ? 'on' : ''} onClick={() => { setLinkMode(!linkMode); setLinkFirstPortId(null); }}>
            {linkMode ? 'Done linking' : 'Link ports…'}
          </button>
          {linkMode && <p className="mep-hint">Click two ports above to link them.</p>}
          {groups.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {groups.map((group, i) => (
                <span className="mep-port-group-chip" key={i}>
                  {group.map(portName).join(' + ')}
                  <button type="button" className="mep-property-row-remove" onClick={() => ungroup(i)} title="Ungroup">
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="mep-field-error">{error}</p>}
    </Dialog>
  );
}
