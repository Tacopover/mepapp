import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { SketchScene, StampInfo } from '@mepapp/render';
import { getStampPorts, networkOfStartPort } from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { startCandidates } from './routePlan.js';
import { SizingLimitsFields } from './SizingLimitsFields.js';
import { emptyLimitsDraft, limitsDraftFromSettings, limitsErrors, limitsToSettings, suggestedLimitsDraft, type LimitsDraft, type LimitsErrors } from './sizingDraft.js';
import { hasTwoFlows, needsConfirm, portsWithSegment, showEditTypeButton, sizeChangeLines, sizeProblemLines, sizeResultLines, sizeText, stampIdsOfSegments, totalFlowText, type SizeTextKey } from './sizePlan.js';

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
  const [confirming, setConfirming] = useState(false);
  const [applied, setApplied] = useState<{ signature: string; count: number } | null>(null);
  useEffect(() => {
    if (!scene) return;
    const refresh = () => {
      setStamps(scene.listStamps());
      setConnectivity(scene.getConnectivity());
      setVersion((v) => v + 1);
    };
    refresh();
    const events = ['pageChanged', 'documentActivated', 'drawingChanged', 'flowSolved', 'networkTypesChanged', 'networkSizingChanged'] as const;
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
  const method = plan?.sizingMethod ?? undefined;
  const savedKey = JSON.stringify(plan?.sizing ?? null);
  const [limits, setLimits] = useState<LimitsDraft>(() => limitsDraftFromSettings(plan?.sizing));
  useEffect(() => {
    setLimits(limitsDraftFromSettings(plan?.sizing));
    // The draft resets when the start pair or the method changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startStamp?.id, selectedPort, method]);
  useEffect(() => {
    if (!method) return;
    if (JSON.stringify(limitsToSettings(limits, method)) !== savedKey) setLimits(limitsDraftFromSettings(plan?.sizing));
    // Only a change of the saved entry resets the draft. The own write of the dialog equals the draft, so it does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  const network = startStamp && selectedPort ? networkOfStartPort(connectivity, startStamp.id, selectedPort) : null;
  const twoFlows = network ? hasTwoFlows(stamps, stampIdsOfSegments(connectivity.segments, network.segmentIds)) : false;

  const limitsBlockers = new Set<string>(['discipline-not-sized', 'method-discipline', 'no-segment-at-port']);
  const showLimits = (method === 'air' || method === 'water') && !(plan?.result.problems ?? []).some((problem) => limitsBlockers.has(problem.code));
  const hasSaved = plan?.sizing != null;
  const saveLimits = (next: LimitsDraft) => {
    setLimits(next);
    if (!scene || !startStamp || !selectedPort || !method) return;
    const settings = limitsToSettings(next, method);
    if (settings) scene.setNetworkSizing(startStamp.id, selectedPort, settings);
  };
  const clearLimits = () => {
    if (!scene || !startStamp || !selectedPort) return;
    scene.setNetworkSizing(startStamp.id, selectedPort, undefined);
    setLimits(emptyLimitsDraft());
  };
  const limitsShown = ((): LimitsErrors => {
    const errors = limitsErrors(limits, method ?? 'air');
    const filled = (text: string) => text.trim() !== '' || hasSaved;
    return {
      airMaxVelocity: errors.airMaxVelocity && filled(limits.air.maxVelocity),
      airMaxDrop: errors.airMaxDrop && filled(limits.air.maxDrop),
      airAspect: errors.airAspect && filled(limits.air.aspect),
      waterMaxVelocity: errors.waterMaxVelocity && filled(limits.water.maxVelocity),
      waterMaxDrop: errors.waterMaxDrop && filled(limits.water.maxDrop),
      waterDeltaT: errors.waterDeltaT && filled(limits.water.deltaT),
    };
  })();

  const labelOf = (stamp: StampInfo) => (stamp.definitionId ? stampName(stamp.definitionId) : null) ?? stamp.definitionId ?? stamp.id;
  const startLabels = uniqueLabels(candidates.map((c) => c.stamp), labelOf);
  const problemLines = plan ? sizeProblemLines(plan.result.problems) : [];
  const result = plan?.result;
  const okResult = result && result.status === 'ok' ? result : null;
  const signature = okResult ? JSON.stringify([okResult.sizes, okResult.unsized]) : '';
  const canApply = okResult !== null && okResult.sizes.length > 0;
  const resultLines = okResult
    ? [...sizeResultLines(okResult, okResult.totalFlowM3s === null ? '' : totalFlowText(okResult.totalFlowM3s, plan?.flowUnit ?? null), method === 'water' ? 'water' : 'air'), ...sizeChangeLines(okResult)]
    : [];
  useEffect(() => {
    setConfirming(false);
  }, [signature]);
  const appliedNow = applied !== null && applied.signature === signature ? applied.count : null;
  const showConfirm = confirming && okResult !== null && needsConfirm(okResult);
  const apply = () => {
    if (!scene || !okResult) return;
    scene.applyNetworkSizes(okResult.sizes);
    setApplied({ signature, count: okResult.sizes.length });
    setConfirming(false);
  };

  return (
    <Dialog
      title={sizeText('title')}
      className="mep-modal--route"
      backdropClassName="mep-modal-backdrop--route"
      closeOnBackdropClick={false}
      onClose={onClose}
      actions={
        <>
          <button
            type="button"
            data-testid="size-apply"
            disabled={!canApply || showConfirm}
            onClick={() => {
              if (okResult && needsConfirm(okResult)) setConfirming(true);
              else apply();
            }}
          >
            {sizeText('size')}
          </button>
          <button type="button" data-testid="size-close" onClick={onClose}>
            {sizeText('close')}
          </button>
        </>
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
                  setConfirming(false);
                }}
              >
                {candidates.map((c) => (
                  <option key={c.stamp.id} value={c.stamp.id}>{startLabels.get(c.stamp.id)}</option>
                ))}
              </select>
            </label>
            <label className="mep-route-field">
              <span>{sizeText('startPort')}</span>
              <select data-testid="size-port" value={selectedPort ?? ''} onChange={(event) => {
                setPortId(event.target.value);
                setConfirming(false);
              }}>
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
            {showLimits && (method === 'air' || method === 'water') && (
              <div className="mep-size-limits" data-testid="size-limits">
                <p className="mep-size-limits-title">{sizeText('limitsSection')}</p>
                <SizingLimitsFields method={method} draft={limits} onChange={saveLimits} showErrors={limitsShown} />
                <div className="mep-size-limits-actions">
                  <button type="button" data-testid="size-limits-suggest" onClick={() => saveLimits(suggestedLimitsDraft(method))}>
                    {sizeText('suggest')}
                  </button>
                  <button type="button" data-testid="size-limits-clear" disabled={!hasSaved} onClick={clearLimits}>
                    {sizeText('clearLimits')}
                  </button>
                </div>
              </div>
            )}
            {okResult && (
              <div data-testid="size-result" aria-live="polite">
                {resultLines.map((line, index) => (
                  <p key={index} className={index === 0 ? 'mep-route-text mep-route-main' : 'mep-route-text'}>{line}</p>
                ))}
                {appliedNow !== null && (
                  <p className="mep-route-text mep-size-applied" data-testid="size-applied">
                    {appliedNow === 1 ? sizeText('appliedCountOne') : sizeText('appliedCount', { n: appliedNow })}
                  </p>
                )}
              </div>
            )}
            {showConfirm && (
              <div className="mep-size-confirm" data-testid="size-confirm" role="alertdialog" aria-label={sizeText('confirmQuestion')}>
                <p className="mep-route-text">{sizeText('confirmQuestion')}</p>
                <div className="mep-size-confirm-actions">
                  <button type="button" data-testid="size-confirm-yes" onClick={apply}>{sizeText('confirmYes')}</button>
                  <button type="button" data-testid="size-confirm-no" onClick={() => setConfirming(false)}>{sizeText('confirmNo')}</button>
                </div>
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
