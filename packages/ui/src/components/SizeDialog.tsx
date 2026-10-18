import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { SketchScene, StampInfo } from '@mepapp/render';
import { getStampPorts, networkOfStartPort } from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { startCandidates } from './routePlan.js';
import { hasTwoFlows, portsWithSegment, showEditTypeButton, sizeProblemLines, sizeText, stampIdsOfSegments, type SizeTextKey } from './sizePlan.js';

export interface SizeDialogProps {
  sceneRef: RefObject<SketchScene | null>;
  stampName: (definitionId: string) => string | null;
  onEditNetworkType: (networkTypeId: string) => void;
  onClose: () => void;
}

function uniqueLabels(stamps: readonly StampInfo[], labelOf: (stamp: StampInfo) => string): Map<string, string> {
  const totals = new Map<string, number>();
  for (const stamp of stamps) {
    const label = labelOf(stamp);
    totals.set(label, (totals.get(label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const stamp of stamps) {
    const label = labelOf(stamp);
    if ((totals.get(label) ?? 0) < 2) {
      labels.set(stamp.id, label);
      continue;
    }
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    labels.set(stamp.id, `${label} (${n})`);
  }
  return labels;
}

const SEVERITY_KEY = { error: 'severityError', warning: 'severityWarning', info: 'severityInfo' } as const satisfies Record<string, SizeTextKey>;

export function SizeDialog({ sceneRef, stampName, onEditNetworkType, onClose }: SizeDialogProps) {
  const scene = sceneRef.current;
  const [stamps, setStamps] = useState(() => scene?.listStamps() ?? []);
  const [connectivity, setConnectivity] = useState(() => scene?.getConnectivity() ?? { segments: [], fittings: [], portGroups: [] });
  const [version, setVersion] = useState(0);
  const [startId, setStartId] = useState<string | null>(null);
  const [portId, setPortId] = useState<string | null>(null);
  useEffect(() => {
    if (!scene) return;
    const refresh = () => {
      setStamps(scene.listStamps());
      setConnectivity(scene.getConnectivity());
      setVersion((v) => v + 1);
    };
    refresh();
    const events = ['pageChanged', 'documentActivated', 'drawingChanged', 'flowSolved', 'networkTypesChanged'] as const;
    for (const event of events) scene.on(event, refresh);
    return () => {
      for (const event of events) scene.off(event, refresh);
    };
  }, [scene]);

  const candidates = startCandidates(stamps).filter((c) => portsWithSegment(c.stamp.id, connectivity.segments).length > 0);
  const selectedStart = candidates.some((c) => c.stamp.id === startId) ? startId : (candidates[0]?.stamp.id ?? null);
  const startStamp = candidates.find((c) => c.stamp.id === selectedStart)?.stamp;
  const portIds = startStamp ? portsWithSegment(startStamp.id, connectivity.segments) : [];
  const selectedPort = portIds.includes(portId ?? '') ? portId : (portIds[0] ?? null);
  const portNameOf = (id: string) => (startStamp ? getStampPorts(startStamp).find((p) => p.id === id)?.name : undefined) ?? id;

  const plan = useMemo(
    () => (startStamp && selectedPort && scene ? scene.planNetworkSizes(startStamp.id, selectedPort) : null),
    // version changes with every scene event that can change the plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, startStamp?.id, selectedPort, version],
  );
  const method = plan?.networkTypeId ? scene?.getNetworkTypes().find((t) => t.id === plan.networkTypeId)?.sizing?.method : undefined;
  const network = startStamp && selectedPort ? networkOfStartPort(connectivity, startStamp.id, selectedPort) : null;
  const twoFlows = network ? hasTwoFlows(stamps, stampIdsOfSegments(connectivity.segments, network.segmentIds)) : false;

  const labelOf = (stamp: StampInfo) => (stamp.definitionId ? stampName(stamp.definitionId) : null) ?? stamp.definitionId ?? stamp.id;
  const startLabels = uniqueLabels(candidates.map((c) => c.stamp), labelOf);
  const problemLines = plan ? sizeProblemLines(plan.result.problems) : [];

  return (
    <Dialog
      title={sizeText('title')}
      className="mep-modal--route"
      backdropClassName="mep-modal-backdrop--route"
      closeOnBackdropClick={false}
      onClose={onClose}
      actions={
        <button type="button" data-testid="size-close" onClick={onClose}>
          {sizeText('close')}
        </button>
      }
    >
      <div data-testid="size-body">
        {candidates.length === 0 ? (
          <p className="mep-route-text" data-testid="size-no-equipment">{sizeText('noEquipment')}</p>
        ) : (
          <>
            <label className="mep-route-field">
              <span>{sizeText('startStamp')}</span>
              <select
                data-testid="size-start"
                value={selectedStart ?? ''}
                onChange={(event) => {
                  setStartId(event.target.value);
                  setPortId(null);
                }}
              >
                {candidates.map((c) => (
                  <option key={c.stamp.id} value={c.stamp.id}>{startLabels.get(c.stamp.id)}</option>
                ))}
              </select>
            </label>
            <label className="mep-route-field">
              <span>{sizeText('startPort')}</span>
              <select data-testid="size-port" value={selectedPort ?? ''} onChange={(event) => setPortId(event.target.value)}>
                {portIds.map((id) => (
                  <option key={id} value={id}>{portNameOf(id)}</option>
                ))}
              </select>
            </label>
            <p className="mep-route-text" data-testid="size-type">
              {sizeText('networkType')}: {plan?.networkTypeName ?? ''}
            </p>
            {plan?.flowUnit && (
              <p className="mep-route-text" data-testid="size-unit">{sizeText('capacityUnitNote', { unit: plan.flowUnit })}</p>
            )}
            {problemLines.length > 0 && (
              <div className="mep-route-checks" data-testid="size-checks">
                {problemLines.map((line) => (
                  <div key={line.code} className="mep-route-check-line">
                    <p className={`mep-route-text mep-route-check-${line.severity}`} data-testid={`size-line-${line.code}`} data-severity={line.severity}>
                      <strong className="mep-route-severity">{sizeText(SEVERITY_KEY[line.severity])}</strong>{' '}{line.text}
                    </p>
                    {line.hint !== '' && <p className="mep-route-text mep-route-hint">{line.hint}</p>}
                  </div>
                ))}
              </div>
            )}
            {plan && showEditTypeButton(plan.result.problems) && plan.networkTypeId && (
              <div className="mep-route-room-actions">
                <button type="button" data-testid="size-edit-type" onClick={() => onEditNetworkType(plan.networkTypeId as string)}>
                  {sizeText('editType')}
                </button>
              </div>
            )}
            <div data-testid="size-notes">
              {method === 'air' && <p className="mep-route-text mep-route-hint" data-testid="size-velocity-note">{sizeText('velocityNote')}</p>}
              {method && <p className="mep-route-text mep-route-hint" data-testid="size-fluid">{sizeText(method === 'air' ? 'fluidAir' : 'fluidWater')}</p>}
              {method === 'water' && <p className="mep-route-text mep-route-hint" data-testid="size-return-note">{sizeText('returnNote')}</p>}
              {method === 'water' && <p className="mep-route-text mep-route-hint" data-testid="size-pipe-note">{sizeText('pipeNote')}</p>}
              {twoFlows && <p className="mep-route-text mep-route-hint" data-testid="size-two-flows-note">{sizeText('twoFlowsNote')}</p>}
              <p className="mep-route-text mep-route-hint" data-testid="size-riser-note">{sizeText('riserNote')}</p>
              <p className="mep-route-text mep-route-hint" data-testid="size-draft-note">{sizeText('draftNote')}</p>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
