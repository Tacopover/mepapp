import { getNetworkTypeFromLibrary, routingTargetDefaultOf, ruleRoutingTargets, SYNTHETIC_CENTER_PORT_ID, type NetworkType, type PortSpec, type RoomNeed, type StampDefinition } from '@mepapp/core';
import { networkTypeCopiesOf, type Draft } from './placementRuleDraft.js';

/** The ports that a stamp of the definition gets the routing targets for: its own ports, or the center (core's getStampPorts). */
export const routingPortsOf = (definition: StampDefinition | undefined): Pick<PortSpec, 'id' | 'name'>[] =>
  definition && definition.ports.length > 0 ? definition.ports : [{ id: SYNTHETIC_CENTER_PORT_ID, name: 'Center' }];

/** The network types that the guide offers: each library type (as the drawing has it), then the types that only the drawing has, then the copies of the rule. */
export function offeredNetworkTypes(library: readonly NetworkType[], drawingTypes: readonly NetworkType[], copies: readonly NetworkType[]): NetworkType[] {
  const list = [...library.map((lib) => drawingTypes.find((t) => t.id === lib.id) ?? lib), ...drawingTypes.filter((t) => !library.some((lib) => lib.id === t.id))];
  return [...list, ...copies.filter((c) => !list.some((t) => t.id === c.id))];
}

/** True when the routing target of the draft names a network type that MepApp cannot find. */
export function routingTargetMissing(d: Pick<Draft, 'routingTarget' | 'portRoutingTargets'>, offered: readonly NetworkType[]): boolean {
  return [d.routingTarget, ...Object.values(d.portRoutingTargets ?? {})].some((id) => !!id && !offered.some((t) => t.id === id));
}

interface RuleRoutingSectionProps {
  draft: Draft;
  /** The stamp of the rule; undefined before the user chooses one. */
  definition: StampDefinition | undefined;
  /** The need of a need rule. */
  need: RoomNeed | undefined;
  /** offeredNetworkTypes of the drawing and the rule. */
  offered: NetworkType[];
  /** The network types of the drawing, for the copies of the rule. */
  drawingTypes: readonly NetworkType[];
  onChange: (patch: Partial<Draft>) => void;
}

const lineStyle = (type: NetworkType | undefined) =>
  type ? { borderTopColor: type.color, borderTopStyle: type.linePattern === 'solid' ? ('solid' as const) : type.linePattern === 'dotted' ? ('dotted' as const) : ('dashed' as const) } : undefined;

/**
 * Step 1 of the guide (auto-routing.md §6, layout A): the routing target that Auto-place writes on each port of each
 * stamp of the rule. Routing connects the port to a network of this type later; a segment that the user connects
 * defines the network type of the port.
 */
export function RuleRoutingSection({ draft, definition, need, offered, drawingTypes, onChange }: RuleRoutingSectionProps) {
  const ports = routingPortsOf(definition);
  const perPort = draft.portRoutingTargets !== null;
  const typeOf = (id: string) => offered.find((t) => t.id === id);
  const nameOf = (id: string) => typeOf(id)?.name ?? 'a network type that is not found';
  const defaultId = draft.countBy === 'need' ? routingTargetDefaultOf(draft.needId) : undefined;
  const change = (patch: Partial<Draft>) => onChange({ ...patch, networkTypeCopies: networkTypeCopiesOf({ ...draft, ...patch }, drawingTypes) });
  const options = (value: string) => (
    <>
      <option value="">None</option>
      {value && !typeOf(value) && <option value={value}>Not found</option>}
      {offered.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </>
  );
  const named = [...new Set([draft.routingTarget, ...Object.values(draft.portRoutingTargets ?? {})].filter((id): id is string => !!id))];
  const onlyInDrawing = named.filter((id) => !getNetworkTypeFromLibrary(id) && typeOf(id));
  const missing = named.filter((id) => !typeOf(id));
  const gets = ruleRoutingTargets({ ...(draft.routingTarget ? { routingTarget: draft.routingTarget } : {}), ...(draft.portRoutingTargets ? { portRoutingTargets: draft.portRoutingTargets } : {}) }, ports);
  return (
    <div className="mep-guide-section" data-testid="pg-routing">
      <h3>Routing target</h3>
      <p className="mep-guide-note">Routing connects each placed stamp to a network of this type later. A segment that you connect to a port defines the network type of the port.</p>
      {!perPort && (
        <div className="mep-guide-field">
          <label htmlFor="pg-routing">Network type</label>
          <span className="mep-routing-field">
            <span className={`mep-routing-swatch${typeOf(draft.routingTarget) ? '' : ' none'}`} style={lineStyle(typeOf(draft.routingTarget))} aria-hidden="true" />
            <select id="pg-routing" value={draft.routingTarget} onChange={(e) => change({ routingTarget: e.target.value })}>
              {options(draft.routingTarget)}
            </select>
          </span>
        </div>
      )}
      {!perPort && defaultId && (
        <p className="mep-guide-note" data-testid="pg-routing-default">
          {draft.routingTarget === defaultId ? (
            <span className="mep-rt-tag">default for {need?.name ?? draft.needId}</span>
          ) : (
            <>
              {need?.name ?? draft.needId} usually goes to {nameOf(defaultId)}.{' '}
              <button type="button" className="mep-guide-link" id="pg-routing-use-default" onClick={() => change({ routingTarget: defaultId })}>
                Use {nameOf(defaultId)}
              </button>
            </>
          )}
        </p>
      )}
      {(ports.length >= 2 || perPort) && (
        <label className="mep-guide-check-row mep-routing-check">
          <input
            type="checkbox"
            id="pg-routing-perport"
            checked={perPort}
            onChange={(e) =>
              change(e.target.checked ? { portRoutingTargets: Object.fromEntries(ports.map((p) => [p.id, draft.routingTarget || null])) } : { portRoutingTargets: null })
            }
          />
          <span>Give each port of the stamp its own routing target</span>
        </label>
      )}
      {perPort &&
        ports.map((port, i) => {
          const own = draft.portRoutingTargets?.[port.id];
          const value = own === undefined ? draft.routingTarget : (own ?? '');
          return (
            <div className="mep-guide-field" key={port.id} data-port={port.id}>
              <label htmlFor={`pg-routing-port-${i}`}>{port.name || port.id}</label>
              <span className="mep-routing-field">
                <span className={`mep-routing-swatch${typeOf(value) ? '' : ' none'}`} style={lineStyle(typeOf(value))} aria-hidden="true" />
                <select id={`pg-routing-port-${i}`} value={value} onChange={(e) => change({ portRoutingTargets: { ...draft.portRoutingTargets, [port.id]: e.target.value || null } })}>
                  {options(value)}
                </select>
              </span>
            </div>
          );
        })}
      {onlyInDrawing.length > 0 && (
        <p className="mep-guide-note" data-testid="pg-routing-copy">
          {onlyInDrawing.map(nameOf).join(', ')} {onlyInDrawing.length === 1 ? 'is' : 'are'} only in this drawing. The rule keeps a copy, so Auto-place can add it to another drawing.
        </p>
      )}
      {missing.length > 0 && (
        <div className="mep-guide-callout bad" data-testid="pg-routing-missing">
          <span>The network type of the routing target is not found. The stamps get no routing target for it. Choose another network type.</span>
        </div>
      )}
      <p className="mep-guide-note" data-testid="pg-routing-gets">
        Each placed stamp gets:{' '}
        {gets
          ? ports
              .filter((p) => gets[p.id])
              .map((p) => (ports.length === 1 ? nameOf(gets[p.id]!) : `${p.name || p.id} → ${nameOf(gets[p.id]!)}`))
              .join(', ')
          : 'no routing target. Routing leaves the stamp alone.'}
      </p>
    </div>
  );
}
