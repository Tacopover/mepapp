import type { LimitsDraft, LimitsErrors } from './sizingDraft.js';
import { sizeText } from './sizePlan.js';

export interface SizingLimitsFieldsProps {
  method: 'air' | 'water';
  draft: LimitsDraft;
  onChange: (draft: LimitsDraft) => void;
  showErrors: LimitsErrors;
}

export function SizingLimitsFields({ method, draft, onChange, showErrors }: SizingLimitsFieldsProps) {
  const setAir = (patch: Partial<LimitsDraft['air']>) => onChange({ ...draft, air: { ...draft.air, ...patch } });
  const setWater = (patch: Partial<LimitsDraft['water']>) => onChange({ ...draft, water: { ...draft.water, ...patch } });
  if (method === 'air') {
    return (
      <>
        <label className="mep-route-field">
          <span>{sizeText('maxVelocity')}</span>
          <input
            data-testid="size-air-max-velocity"
            type="number"
            step="any"
            aria-invalid={showErrors.airMaxVelocity ? 'true' : undefined}
            value={draft.air.maxVelocity}
            onChange={(e) => setAir({ maxVelocity: e.target.value })}
          />
        </label>
        {showErrors.airMaxVelocity && <p className="mep-field-error" data-testid="size-error-air-max-velocity">{sizeText('valueNotPositive')}</p>}
        <label className="mep-route-field">
          <span>{sizeText('maxDrop')}</span>
          <input
            data-testid="size-air-max-drop"
            type="number"
            step="any"
            aria-invalid={showErrors.airMaxDrop ? 'true' : undefined}
            value={draft.air.maxDrop}
            onChange={(e) => setAir({ maxDrop: e.target.value })}
          />
        </label>
        {showErrors.airMaxDrop && <p className="mep-field-error" data-testid="size-error-air-max-drop">{sizeText('valueNotPositive')}</p>}
        <label className="mep-route-field">
          <span>{sizeText('airShape')}</span>
          <select
            data-testid="size-air-shape"
            value={draft.air.shape}
            onChange={(e) => setAir({ shape: e.target.value as 'round' | 'rectangular' })}
          >
            <option value="round">{sizeText('shapeRound')}</option>
            <option value="rectangular">{sizeText('shapeRect')}</option>
          </select>
        </label>
        {draft.air.shape === 'rectangular' && (
          <>
            <label className="mep-route-field">
              <span>{sizeText('maxAspect')}</span>
              <input
                data-testid="size-air-aspect"
                type="number"
                step="any"
                placeholder="4"
                aria-invalid={showErrors.airAspect ? 'true' : undefined}
                value={draft.air.aspect}
                onChange={(e) => setAir({ aspect: e.target.value })}
              />
            </label>
            {showErrors.airAspect && <p className="mep-field-error" data-testid="size-error-air-aspect">{sizeText('valueAtLeastOne')}</p>}
          </>
        )}
        <label className="mep-route-field">
          <span>{sizeText('airSeries')}</span>
          <select
            data-testid="size-air-series"
            value={draft.air.series}
            onChange={(e) => setAir({ series: e.target.value as 'standard' | 'free' })}
          >
            <option value="standard">{sizeText('seriesStandard')}</option>
            <option value="free">{sizeText('seriesFree')}</option>
          </select>
        </label>
      </>
    );
  }
  return (
    <>
      <label className="mep-route-field">
        <span>{sizeText('maxVelocity')}</span>
        <input
          data-testid="size-water-max-velocity"
          type="number"
          step="any"
          aria-invalid={showErrors.waterMaxVelocity ? 'true' : undefined}
          value={draft.water.maxVelocity}
          onChange={(e) => setWater({ maxVelocity: e.target.value })}
        />
      </label>
      {showErrors.waterMaxVelocity && <p className="mep-field-error" data-testid="size-error-water-max-velocity">{sizeText('valueNotPositive')}</p>}
      <label className="mep-route-field">
        <span>{sizeText('maxDrop')}</span>
        <input
          data-testid="size-water-max-drop"
          type="number"
          step="any"
          aria-invalid={showErrors.waterMaxDrop ? 'true' : undefined}
          value={draft.water.maxDrop}
          onChange={(e) => setWater({ maxDrop: e.target.value })}
        />
      </label>
      {showErrors.waterMaxDrop && <p className="mep-field-error" data-testid="size-error-water-max-drop">{sizeText('valueNotPositive')}</p>}
      <label className="mep-route-field">
        <span>{sizeText('deltaT')}</span>
        <input
          data-testid="size-water-delta-t"
          type="number"
          step="any"
          aria-invalid={showErrors.waterDeltaT ? 'true' : undefined}
          value={draft.water.deltaT}
          onChange={(e) => setWater({ deltaT: e.target.value })}
        />
      </label>
      <p className="mep-nt-note">{sizeText('deltaTHint')}</p>
      {showErrors.waterDeltaT && <p className="mep-field-error" data-testid="size-error-water-delta-t">{sizeText('valueNotPositive')}</p>}
    </>
  );
}
