import type { PortEditor } from '../usePortEditor.js';

/**
 * The port dots and the rename box, laid over a `ShapeDrawSurface` as its children
 * (shared-drawing-tool.md §6). `usePortEditor` holds the state and returns no JSX, so each editor
 * draws its own overlay. The stamp editor and the symbol editor draw it the same way, through this.
 */
export function PortMarkers({ portsEditor, viewScale }: { portsEditor: PortEditor; viewScale: number }) {
  return (
    <>
      {portsEditor.ports.map((port) => (
        <div
          key={port.id}
          className={`mep-element-editor-port${portsEditor.linkMode && portsEditor.linkFirstPortId === port.id ? ' selected' : ''}`}
          style={{ left: `${port.fractionX * 100}%`, top: `${port.fractionY * 100}%` }}
          onPointerDown={(e) => portsEditor.handlePortPointerDown(e, port.id)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => portsEditor.handlePortDoubleClick(e, port)}
          title={port.name}
        >
          <span className="mep-element-editor-port-label">{port.name}</span>
        </div>
      ))}
      {portsEditor.editingPort && (
        <input
          autoFocus
          className="mep-element-editor-port-rename"
          style={{
            left: `${portsEditor.editingPort.fractionX * 100}%`,
            top: `${portsEditor.editingPort.fractionY * 100}%`,
            transform: `scale(${1 / viewScale}) translate(-50%, -140%)`,
          }}
          value={portsEditor.editPortName}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => portsEditor.setEditPortName(e.target.value)}
          onBlur={portsEditor.commitPortRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') portsEditor.commitPortRename();
            if (e.key === 'Escape') portsEditor.setEditingPortId(null);
          }}
        />
      )}
    </>
  );
}

/** The port list (rename, remove) and the "Linked Ports" section. `hint` says where the Port tool is in the caller's own layout. */
export function PortsSidebar({ portsEditor, hint }: { portsEditor: PortEditor; hint: string }) {
  return (
    <>
      <p className="mep-hint">{hint}</p>
      {portsEditor.ports.length > 0 && (
        <div className="mep-section">
          <h4>Ports</h4>
          {portsEditor.ports.map((port) => (
            <div className="mep-port-list-row" key={port.id}>
              <input value={port.name} onChange={(e) => portsEditor.setPorts((prev) => prev.map((p) => (p.id === port.id ? { ...p, name: e.target.value } : p)))} />
              <button type="button" className="mep-property-row-remove" onClick={() => portsEditor.removePort(port.id)} title="Remove port">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {portsEditor.ports.length >= 2 && (
        <div className="mep-section">
          <h4>Linked Ports</h4>
          <p className="mep-hint">
            Linked ports collapse into one connectivity node once placed — e.g. a unit's supply and return,
            so a segment between them never bridges the two networks.
          </p>
          <button
            type="button"
            className={portsEditor.linkMode ? 'on' : ''}
            onClick={() => {
              portsEditor.setLinkMode(!portsEditor.linkMode);
              portsEditor.setLinkFirstPortId(null);
            }}
          >
            {portsEditor.linkMode ? 'Done linking' : 'Link ports…'}
          </button>
          {portsEditor.linkMode && <p className="mep-hint">Click two ports above to link them.</p>}
          {portsEditor.groups.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {portsEditor.groups.map((group, i) => (
                <span className="mep-port-group-chip" key={i}>
                  {group.map(portsEditor.portName).join(' + ')}
                  <button type="button" className="mep-property-row-remove" onClick={() => portsEditor.ungroup(i)} title="Ungroup">
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
