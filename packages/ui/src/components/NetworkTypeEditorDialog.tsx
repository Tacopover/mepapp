import { useState } from 'react';
import type { Discipline, FlowUnitId, LinePattern, NetworkType } from '@mepapp/core';
import { FLOW_UNITS } from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { ColorPicker } from './ColorPicker.js';
import { applySuggested, coerceMethod, draftErrors, draftFromType, draftHasErrors, draftToPatch, methodsForDiscipline, type SizingMethodChoice } from './sizingDraft.js';
import { sizeText, type SizeTextKey } from './sizePlan.js';

export type NetworkTypeEditPatch = Partial<Pick<NetworkType, 'name' | 'color' | 'lineWidthPt' | 'linePattern' | 'discipline' | 'flowUnit' | 'sizing'>>;

/** All 6 core Discipline values, human-labeled — finer-grained than disciplineGroups.ts's 5-way UI grouping (which this dialog's dropdown drives, via disciplineGroupOf), so it needs its own label map. */
const DISCIPLINES: Array<{ value: Discipline; label: string }> = [
  { value: 'heatingAndCooling', label: 'Heating & Cooling' },
  { value: 'ventilation', label: 'Ventilation' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'fireProtection', label: 'Fire Protection' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'other', label: 'Other' },
];

export interface NetworkTypeEditorDialogProps {
  networkType: NetworkType;
  onSave: (id: string, patch: NetworkTypeEditPatch) => void;
  /** Clones networkType into a brand-new "<name>_copy" type — see SketchScene.duplicateNetworkType. The caller retargets this same dialog at the new copy (pass a new `key` so local state re-seeds) rather than closing it. */
  onDuplicate: (id: string) => void;
  onClose: () => void;
}

const METHOD_TEXT_KEYS: Record<SizingMethodChoice, SizeTextKey> = { none: 'methodNone', air: 'methodAir', water: 'methodWater' };

const LINE_PATTERNS: Array<{ value: LinePattern; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dashDot', label: 'Dash-Dot' },
  { value: 'longDash', label: 'Long Dash' },
  { value: 'dashDotDot', label: 'Dash-Dot-Dot' },
];

/** Edits a network type's name and drawn visuals (color/thickness/pattern) — every segment tagged with this type re-renders immediately on Save, via SketchScene.updateNetworkType. Modeled on ElementEditorDialog/GlobalPropertiesDialog's local-draft + explicit Save pattern. */
export function NetworkTypeEditorDialog({ networkType, onSave, onDuplicate, onClose }: NetworkTypeEditorDialogProps) {
  const [name, setName] = useState(networkType.name);
  const [color, setColor] = useState(networkType.color);
  const [lineWidthPt, setLineWidthPt] = useState(networkType.lineWidthPt);
  const [linePattern, setLinePattern] = useState<LinePattern>(networkType.linePattern);
  const [discipline, setDiscipline] = useState<Discipline>(networkType.discipline);
  const [sizingDraft, setSizingDraft] = useState(() => coerceMethod(draftFromType(networkType), networkType.discipline));
  const errors = draftErrors(sizingDraft);
  const methods = methodsForDiscipline(discipline);

  function handleSave() {
    onSave(networkType.id, { name: name.trim() || networkType.name, color, lineWidthPt, linePattern, discipline, ...draftToPatch(sizingDraft) });
  }

  return (
    <Dialog
      title={sizeText('editorTitle', { name: networkType.name })}
      onClose={onClose}
      actions={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => onDuplicate(networkType.id)} title="Create a copy of this network type">
            Duplicate
          </button>
          <button onClick={handleSave} disabled={draftHasErrors(errors)}>Save</button>
        </>
      }
    >
      <div className="mep-section">
        <div className="mep-field-row">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="mep-field-row">
          <label>Discipline</label>
          <select
            value={discipline}
            onChange={(e) => {
              const value = e.target.value as Discipline;
              setDiscipline(value);
              setSizingDraft((d) => coerceMethod(d, value));
            }}
          >
            {DISCIPLINES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="mep-field-row">
          <label>Color</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="mep-field-row">
          <label>Thickness (pt)</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={lineWidthPt}
            onChange={(e) => setLineWidthPt(Number(e.target.value))}
          />
        </div>
        <div className="mep-field-row">
          <label>Pattern</label>
          <select value={linePattern} onChange={(e) => setLinePattern(e.target.value as LinePattern)}>
            {LINE_PATTERNS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mep-section">
        <div className="mep-nt-section-title">{sizeText('flowSection')}</div>
        <div className="mep-field-row">
          <label>{sizeText('flowUnit')}</label>
          <select
            data-testid="nt-flow-unit"
            value={sizingDraft.flowUnit}
            onChange={(e) => setSizingDraft((d) => ({ ...d, flowUnit: e.target.value as FlowUnitId | '' }))}
          >
            <option value="">{sizeText('flowUnitNotSet')}</option>
            {FLOW_UNITS.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.id}
              </option>
            ))}
          </select>
        </div>
        <div className="mep-field-row">
          <label>{sizeText('sizingMethod')}</label>
          <select
            data-testid="nt-sizing-method"
            value={sizingDraft.method}
            onChange={(e) => setSizingDraft((d) => ({ ...d, method: e.target.value as SizingMethodChoice }))}
          >
            {methods.map((method) => (
              <option key={method} value={method}>
                {sizeText(METHOD_TEXT_KEYS[method])}
              </option>
            ))}
          </select>
        </div>
        {methods.length === 1 && <p className="mep-nt-note" data-testid="nt-discipline-note">{sizeText('disciplineNotSized')}</p>}
        {sizingDraft.method === 'air' && (
          <>
            <div className="mep-field-row">
              <label>{sizeText('maxVelocity')}</label>
              <input
                data-testid="nt-air-max-velocity"
                type="number"
                step="any"
                value={sizingDraft.air.maxVelocity}
                onChange={(e) => setSizingDraft((d) => ({ ...d, air: { ...d.air, maxVelocity: e.target.value } }))}
              />
            </div>
            {errors.airMaxVelocity && <p className="mep-field-error" data-testid="nt-error-air-max-velocity">{sizeText('valueNotPositive')}</p>}
            <div className="mep-field-row">
              <label>{sizeText('maxDrop')}</label>
              <input
                data-testid="nt-air-max-drop"
                type="number"
                step="any"
                value={sizingDraft.air.maxDrop}
                onChange={(e) => setSizingDraft((d) => ({ ...d, air: { ...d.air, maxDrop: e.target.value } }))}
              />
            </div>
            {errors.airMaxDrop && <p className="mep-field-error" data-testid="nt-error-air-max-drop">{sizeText('valueNotPositive')}</p>}
            <div className="mep-field-row">
              <label>{sizeText('airShape')}</label>
              <select
                data-testid="nt-air-shape"
                value={sizingDraft.air.shape}
                onChange={(e) => setSizingDraft((d) => ({ ...d, air: { ...d.air, shape: e.target.value as 'round' | 'rectangular' } }))}
              >
                <option value="round">{sizeText('shapeRound')}</option>
                <option value="rectangular">{sizeText('shapeRect')}</option>
              </select>
            </div>
            {sizingDraft.air.shape === 'rectangular' && (
              <>
                <div className="mep-field-row">
                  <label>{sizeText('maxAspect')}</label>
                  <input
                    data-testid="nt-air-aspect"
                    type="number"
                    step="any"
                    placeholder="4"
                    value={sizingDraft.air.aspect}
                    onChange={(e) => setSizingDraft((d) => ({ ...d, air: { ...d.air, aspect: e.target.value } }))}
                  />
                </div>
                {errors.airAspect && <p className="mep-field-error" data-testid="nt-error-air-aspect">{sizeText('valueAtLeastOne')}</p>}
              </>
            )}
            <div className="mep-field-row">
              <label>{sizeText('airSeries')}</label>
              <select
                data-testid="nt-air-series"
                value={sizingDraft.air.series}
                onChange={(e) => setSizingDraft((d) => ({ ...d, air: { ...d.air, series: e.target.value as 'standard' | 'free' } }))}
              >
                <option value="standard">{sizeText('seriesStandard')}</option>
                <option value="free">{sizeText('seriesFree')}</option>
              </select>
            </div>
            <p className="mep-nt-note">{sizeText('velocityNote')}</p>
            <p className="mep-nt-note">{sizeText('fluidAir')}</p>
          </>
        )}
        {sizingDraft.method === 'water' && (
          <>
            <div className="mep-field-row">
              <label>{sizeText('maxVelocity')}</label>
              <input
                data-testid="nt-water-max-velocity"
                type="number"
                step="any"
                value={sizingDraft.water.maxVelocity}
                onChange={(e) => setSizingDraft((d) => ({ ...d, water: { ...d.water, maxVelocity: e.target.value } }))}
              />
            </div>
            {errors.waterMaxVelocity && <p className="mep-field-error" data-testid="nt-error-water-max-velocity">{sizeText('valueNotPositive')}</p>}
            <div className="mep-field-row">
              <label>{sizeText('maxDrop')}</label>
              <input
                data-testid="nt-water-max-drop"
                type="number"
                step="any"
                value={sizingDraft.water.maxDrop}
                onChange={(e) => setSizingDraft((d) => ({ ...d, water: { ...d.water, maxDrop: e.target.value } }))}
              />
            </div>
            {errors.waterMaxDrop && <p className="mep-field-error" data-testid="nt-error-water-max-drop">{sizeText('valueNotPositive')}</p>}
            <div className="mep-field-row">
              <label>{sizeText('deltaT')}</label>
              <input
                data-testid="nt-water-delta-t"
                type="number"
                step="any"
                value={sizingDraft.water.deltaT}
                onChange={(e) => setSizingDraft((d) => ({ ...d, water: { ...d.water, deltaT: e.target.value } }))}
              />
            </div>
            <p className="mep-nt-note">{sizeText('deltaTHint')}</p>
            {errors.waterDeltaT && <p className="mep-field-error" data-testid="nt-error-water-delta-t">{sizeText('valueNotPositive')}</p>}
            <p className="mep-nt-note">{sizeText('pipeNote')}</p>
            <p className="mep-nt-note">{sizeText('fluidWater')}</p>
          </>
        )}
        {sizingDraft.method !== 'none' && (
          <>
            <button
              type="button"
              data-testid="nt-suggest"
              onClick={() => setSizingDraft((d) => applySuggested(d, d.method as 'air' | 'water'))}
            >
              {sizeText('suggest')}
            </button>
            <p className="mep-nt-note">{sizeText('sizesSourceHint')}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
