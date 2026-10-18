import { useState } from 'react';
import type { Discipline, FlowUnitId, LinePattern, NetworkType } from '@mepapp/core';
import { FLOW_UNITS } from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { ColorPicker } from './ColorPicker.js';
import { coerceMethod, draftFromType, convertPanelOf, draftToPatch, methodsForDiscipline, type SizingMethodChoice } from './sizingDraft.js';
import { sizeText, type SizeTextKey } from './sizePlan.js';

export type NetworkTypeEditPatch = Partial<Pick<NetworkType, 'name' | 'color' | 'lineWidthPt' | 'linePattern' | 'discipline' | 'flowUnit' | 'sizingMethod'>>;

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
  /** Counts the stored capacities of this type: `convertible` can change unit, `mixed` (stamps with two network types) are skipped. */
  capacityInfo: (typeId: string) => { convertible: number; mixed: number };
  onConvertCapacities: (typeId: string, from: FlowUnitId, to: FlowUnitId) => void;
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
export function NetworkTypeEditorDialog({ networkType, onSave, onDuplicate, capacityInfo, onConvertCapacities, onClose }: NetworkTypeEditorDialogProps) {
  const [name, setName] = useState(networkType.name);
  const [color, setColor] = useState(networkType.color);
  const [lineWidthPt, setLineWidthPt] = useState(networkType.lineWidthPt);
  const [linePattern, setLinePattern] = useState<LinePattern>(networkType.linePattern);
  const [discipline, setDiscipline] = useState<Discipline>(networkType.discipline);
  const [sizingDraft, setSizingDraft] = useState(() => coerceMethod(draftFromType(networkType), networkType.discipline));
  const methods = methodsForDiscipline(discipline);

  const [info] = useState(() => capacityInfo(networkType.id));
  const [showConvert, setShowConvert] = useState(false);
  const panel = convertPanelOf(networkType.flowUnit, sizingDraft.flowUnit, info.convertible);

  function handleSaveClick() {
    if (panel === 'none') handleSave();
    else setShowConvert(true);
  }

  function handleConvertYes() {
    if (networkType.flowUnit && sizingDraft.flowUnit) onConvertCapacities(networkType.id, networkType.flowUnit, sizingDraft.flowUnit);
    handleSave();
  }

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
          <button onClick={handleSaveClick} disabled={showConvert && panel !== 'none'}>Save</button>
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
        {networkType.flowUnit === undefined && sizingDraft.flowUnit !== '' && (
          <p className="mep-nt-note" data-testid="nt-unit-read-note">{sizeText('unitReadNote', { unit: sizingDraft.flowUnit })}</p>
        )}
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
        {sizingDraft.method !== 'none' && <p className="mep-nt-note" data-testid="nt-limits-note">{sizeText('limitsNote')}</p>}
      </div>
      {showConvert && panel !== 'none' && networkType.flowUnit && sizingDraft.flowUnit && (
        <div className="mep-nt-convert" data-testid="nt-convert-panel">
          <p>
            {panel === 'question'
              ? sizeText(info.convertible === 1 ? 'convertQuestionOne' : 'convertQuestion', { n: info.convertible, old: networkType.flowUnit, new: sizingDraft.flowUnit })
              : sizeText('unitKindWarning')}
          </p>
          {panel === 'question' && info.mixed > 0 && <p>{sizeText('convertSkipped', { n: info.mixed })}</p>}
          <div className="mep-nt-convert-buttons">
            {panel === 'question' && (
              <button type="button" data-testid="nt-convert-yes" onClick={handleConvertYes}>{sizeText('convertYes')}</button>
            )}
            <button type="button" data-testid="nt-convert-no" onClick={handleSave}>{sizeText('convertNo')}</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
