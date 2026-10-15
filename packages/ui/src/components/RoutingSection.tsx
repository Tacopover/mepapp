import type { RefObject } from 'react';
import type { SketchScene, StampInfo } from '@mepapp/render';
import { SYNTHETIC_CENTER_PORT_ID, type NetworkType, type PortSpec } from '@mepapp/core';

const MIXED = '__mixed';

/** The ports that routing lists for a stamp: its own ports, or the center of a stamp without ports (core's getStampPorts). */
const portsOf = (stamp: StampInfo): Pick<PortSpec, 'id' | 'name'>[] => (stamp.ports.length > 0 ? stamp.ports : [{ id: SYNTHETIC_CENTER_PORT_ID, name: 'Center' }]);

/** True when the stamps of a multi-selection have the same ports, so one row per port fits all of them. */
export function samePorts(stamps: readonly StampInfo[]): boolean {
  const key = (s: StampInfo) => portsOf(s).map((p) => p.id).join('\n');
  return stamps.length > 0 && stamps.every((s) => key(s) === key(stamps[0]!));
}

export interface RoutingSectionProps {
  sceneRef: RefObject<SketchScene | null>;
  /** One stamp, or a multi-selection of stamps with the same ports (samePorts). */
  stamps: StampInfo[];
  /** The library types and the types of the drawing, as the Network Type select of a segment lists them. */
  networkTypes: NetworkType[];
}

/**
 * The routing target of each port of the selected stamps (auto-routing.md §6): the network type that routing
 * must connect to the port later. A port with a segment shows the network type of the segment instead, because
 * the segment defines the network type of the port.
 */
export function RoutingSection({ sceneRef, stamps, networkTypes }: RoutingSectionProps) {
  const first = stamps[0];
  if (!first) return null;
  const ports = portsOf(first);
  const typeOf = (id: string) => networkTypes.find((t) => t.id === id);
  const autoPlaced = stamps.filter((s) => s.autoPlaced && !s.autoPlaced.moved).length;
  return (
    <div className="mep-section" data-testid="routing-section">
      <h4>Routing</h4>
      <p className="mep-hint">Routing connects a port without a segment to a network of its routing target. A segment that you connect defines the network type of the port.</p>
      {ports.map((port) => {
        const id = `routing-${port.id}`;
        const label = ports.length === 1 ? 'Routing target' : port.name || port.id;
        const open = stamps.filter((s) => s.portSegmentTypes?.[port.id] === undefined);
        const connected = stamps.length - open.length;
        if (open.length === 0) {
          const types = [...new Set(stamps.map((s) => s.portSegmentTypes![port.id]!))];
          return (
            <div className="mep-field-row" key={port.id} data-port={port.id}>
              <label htmlFor={id}>{label}</label>
              <input id={id} className="mep-routing-segment" type="text" value={types.length === 1 ? `${typeOf(types[0]!)?.name ?? 'Unknown type'} (segment)` : 'Varies (segments)'} disabled title="A segment is connected: the segment defines the network type of the port." />
            </div>
          );
        }
        const values = [...new Set(open.map((s) => s.routingTargets?.[port.id] ?? ''))];
        const value = values.length === 1 ? values[0]! : MIXED;
        const shown = value && value !== MIXED ? typeOf(value) : undefined;
        return (
          <div key={port.id} data-port={port.id}>
            <div className="mep-field-row">
              <label htmlFor={id}>{label}</label>
              <span className="mep-routing-field">
                <span
                  className={`mep-routing-swatch${shown ? '' : ' none'}`}
                  style={shown ? { borderTopColor: shown.color, borderTopStyle: shown.linePattern === 'solid' ? 'solid' : shown.linePattern === 'dotted' ? 'dotted' : 'dashed' } : undefined}
                  aria-hidden="true"
                />
                <select id={id} value={value} onChange={(e) => sceneRef.current?.setRoutingTarget(open.map((s) => s.id), port.id, e.target.value || null)}>
                  {value === MIXED && (
                    <option value={MIXED} disabled>
                      Mixed
                    </option>
                  )}
                  <option value="">None</option>
                  {value && value !== MIXED && !shown && <option value={value}>Unknown type</option>}
                  {networkTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            {connected > 0 && (
              <p className="mep-hint" data-testid="routing-connected">
                {connected} of {stamps.length} stamps have a segment on this port. The select changes only the other {open.length}.
              </p>
            )}
          </div>
        );
      })}
      {autoPlaced > 0 && (
        <p className="mep-hint" data-testid="routing-auto-placed">
          {stamps.length === 1 ? 'Auto-place placed this stamp.' : `Auto-place placed ${autoPlaced} of these stamps.`} After a change here, a new run of Auto-place keeps {autoPlaced === 1 ? 'the stamp' : 'them'}.
        </p>
      )}
    </div>
  );
}
