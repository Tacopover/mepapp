import type { NetworkSummary, StampInfo } from '@mepapp/render';
import { getStampDefinition } from '@mepapp/core';
import { DISCIPLINE_GROUP_LABEL, disciplineGroupOf } from '../disciplineGroups.js';

export interface LayersPanelProps {
  networks: NetworkSummary[];
  stamps: StampInfo[];
}

const DISCIPLINE_SWATCH: Record<string, string> = {
  hvac: 'var(--hvac)',
  plumbing: 'var(--plumb)',
  electrical: 'var(--elec)',
  fire: 'var(--fire)',
};

export function LayersPanel({ networks, stamps }: LayersPanelProps) {
  return (
    <div>
      <div className="mep-section">
        <h4>Networks ({networks.length})</h4>
      </div>
      {networks.length === 0 && <div className="mep-empty-panel">No segments drawn yet.</div>}
      {networks.map((network) => {
        const group = disciplineGroupOf(network.discipline);
        return (
          <div key={network.id} className="mep-elem-row">
            <span className="swatch" style={{ background: DISCIPLINE_SWATCH[group] }} />
            <div>
              <b>{network.networkTypeName}</b>
              <span>
                {DISCIPLINE_GROUP_LABEL[group]} · {network.segmentCount} segment{network.segmentCount === 1 ? '' : 's'}, {network.fittingCount} fitting
                {network.fittingCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        );
      })}

      <div className="mep-section">
        <h4>Elements ({stamps.length})</h4>
      </div>
      {stamps.length === 0 && <div className="mep-empty-panel">No stamps placed yet.</div>}
      {stamps.map((stamp) => {
        const definition = stamp.definitionId ? getStampDefinition(stamp.definitionId) : undefined;
        return (
          <div key={stamp.id} className="mep-elem-row">
            <div>
              <b>{definition?.label ?? 'Stamp'}</b>
              <span>{definition ? DISCIPLINE_GROUP_LABEL[disciplineGroupOf(definition.discipline)] : 'Custom art'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
