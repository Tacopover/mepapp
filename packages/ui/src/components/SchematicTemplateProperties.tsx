import { useEffect, useRef, useState } from 'react';
import {
  ExpressionError,
  SCHEMATIC_BLOCK_CATALOGUE,
  addField,
  findBlock,
  findFieldUses,
  formatNumberList,
  getBindingFieldsForScope,
  getBlockHeight,
  getBlockWidth,
  parseBinding,
  parseExpression,
  parseNumberList,
  removeField,
  reorderField,
  setTemplateDirection,
  setBlockSymbol,
  updateBlock,
  updateField,
  updateGroup,
  type BlockRef,
  type CircuitGroupRule,
  type CircuitType,
  type SchematicBlock,
  type SchematicBlockStyle,
  type SchematicFieldDefinition,
  type SchematicSymbol,
  type SchematicTemplate,
  type TotalsTableRow,
} from '@mepapp/core';

export type EditTemplate = (change: (template: SchematicTemplate) => SchematicTemplate, gestureKey?: string | null) => void;

export interface SchematicTemplatePropertiesProps {
  template: SchematicTemplate;
  edit: EditTemplate;
  endGesture: () => void;
  selection: BlockRef | null;
  activeGroupId: string | null;
  circuitTypes: CircuitType[];
  /** Load types found on the preview data's terminals, offered when the user types a load type filter. */
  loadTypes: string[];
  /** Plain sentences: template validation issues and generator diagnostics. */
  notes: string[];
  onDuplicateBlock: () => void;
  onDeleteBlock: () => void;
  onEditDrawing: () => void;
  /** The symbol library, to name the symbol a drawing block points at. */
  symbols: SchematicSymbol[];
  onChangeSymbol: () => void;
  onDetachSymbol: () => void;
}

const SHEET_SIZES = [
  { label: 'A3', widthMm: 420, heightMm: 297 },
  { label: 'A1', widthMm: 841, heightMm: 594 },
  { label: 'A0', widthMm: 1189, heightMm: 841 },
];

/** The types whose symbol is an optional visual override (a drawing has its own Symbol and Shapes rows). */
const DEVICE_SYMBOL_TYPES: readonly string[] = ['mainDevice', 'protectiveDevice', 'accessoryDevice', 'loadSymbol'];
const FIELD_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SCOPE_LABELS = { once: 'Sheet', panel: 'Panel', section: 'Section', circuit: 'Circuit', aggregate: 'Aggregate' } as const;

function toHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  onBlur: () => void;
  /** A blank box means "no value" (the field is optional). */
  optional?: boolean;
  placeholder?: string;
  min?: number;
  step?: number;
}

/** Keeps its own text while it has focus, so the user can clear the box and type a new number. */
function NumberField({ label, value, onCommit, onBlur, optional, placeholder, min, step = 1 }: NumberFieldProps) {
  const format = (v: number | undefined) => (v === undefined ? '' : String(Math.round(v * 1000) / 1000));
  const [text, setText] = useState(format(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value]);

  return (
    <div className="mep-field-row">
      <label>{label}</label>
      <input
        type="number"
        value={text}
        placeholder={placeholder}
        step={step}
        min={min}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => {
          setText(event.target.value);
          if (event.target.value.trim() === '') {
            if (optional) onCommit(undefined);
            return;
          }
          const n = Number(event.target.value);
          if (Number.isFinite(n) && (min === undefined || n >= min)) onCommit(n);
        }}
        onBlur={() => {
          focused.current = false;
          setText(format(value));
          onBlur();
        }}
      />
    </div>
  );
}

function bindingError(source: string): string | null {
  try {
    parseBinding(source);
    return null;
  } catch (error) {
    if (error instanceof ExpressionError) return error.message;
    throw error;
  }
}

function formulaError(source: string): string | null {
  try {
    parseExpression(source);
    return null;
  } catch (error) {
    if (error instanceof ExpressionError) return error.message;
    throw error;
  }
}

export function SchematicTemplateProperties({ template, edit, endGesture, selection, activeGroupId, circuitTypes, loadTypes, notes, onDuplicateBlock, onDeleteBlock, onEditDrawing, symbols, onChangeSymbol, onDetachSymbol }: SchematicTemplatePropertiesProps) {
  const group = activeGroupId ? template.groups.find((g) => g.id === activeGroupId) : undefined;
  const block = selection ? findBlock(template, selection) : undefined;

  return (
    <div className="mep-schematic-props">
      {notes.length > 0 && (
        <div className="mep-section">
          {notes.map((note, i) => (
            <p key={i} className="mep-schematic-note" role="status">
              {note}
            </p>
          ))}
        </div>
      )}

      {block && selection && (
        <BlockProperties template={template} block={block} selection={selection} edit={edit} endGesture={endGesture} loadTypes={loadTypes} onDuplicateBlock={onDuplicateBlock} onDeleteBlock={onDeleteBlock} onEditDrawing={onEditDrawing} symbols={symbols} onChangeSymbol={onChangeSymbol} onDetachSymbol={onDetachSymbol} />
      )}
      {!block && (
        <div className="mep-section">
          <p className="mep-schematic-hint">Select a block on the sheet or in the list to edit it.</p>
        </div>
      )}

      {group && (
        <details open className="mep-section">
          <summary>
            <h4>Group · {group.name}</h4>
          </summary>
          <div className="mep-schematic-field">
            <label>Name</label>
            <input type="text" value={group.name} onChange={(e) => edit((t) => updateGroup(t, group.id, { name: e.target.value }), `group:${group.id}:name`)} onBlur={endGesture} />
          </div>
          <div className="mep-schematic-field">
            <label>Applies to</label>
            <select value={group.rule.kind} onChange={(e) => edit((t) => updateGroup(t, group.id, { rule: ruleOfKind(e.target.value) }))}>
              <option value="any">Any circuit</option>
              <option value="spare">Spare circuits</option>
              <option value="circuitType">Circuit type</option>
              <option value="circuitNumber">Circuit number</option>
            </select>
          </div>
          {group.rule.kind === 'circuitType' && (
            <div className="mep-schematic-checks">
              {circuitTypes.length === 0 && <span className="mep-schematic-hint">This document has no circuit types.</span>}
              {circuitTypes.map((type) => {
                const ids = group.rule.kind === 'circuitType' ? group.rule.circuitTypeIds : [];
                return (
                  <label key={type.id}>
                    <input
                      type="checkbox"
                      checked={ids.includes(type.id)}
                      onChange={(e) => edit((t) => updateGroup(t, group.id, { rule: { kind: 'circuitType', circuitTypeIds: e.target.checked ? [...ids, type.id] : ids.filter((id) => id !== type.id) } }))}
                    />
                    {type.name}
                  </label>
                );
              })}
            </div>
          )}
          {group.rule.kind === 'circuitNumber' && <CircuitNumberRule key={group.id} numbers={group.rule.numbers} onChange={(numbers) => edit((t) => updateGroup(t, group.id, { rule: { kind: 'circuitNumber', numbers } }), `group:${group.id}:numbers`)} onBlur={endGesture} />}
          <NumberField label="Pitch mm" value={group.pitch} min={0.1} step={0.5} onBlur={endGesture} onCommit={(v) => v !== undefined && edit((t) => updateGroup(t, group.id, { pitch: v }), `group:${group.id}:pitch`)} />
          <p className="mep-schematic-hint">The first group whose rule matches a circuit is used for it. The pitch is the distance to the next circuit.</p>
        </details>
      )}

      <FieldsSection template={template} edit={edit} endGesture={endGesture} />

      <details open className="mep-section">
        <summary>
          <h4>Template</h4>
        </summary>
        <div className="mep-schematic-field">
          <label>Name</label>
          <input type="text" value={template.name} onChange={(e) => edit((t) => ({ ...t, name: e.target.value }), 'template:name')} onBlur={endGesture} />
        </div>
        <div className="mep-schematic-field">
          <label>Description</label>
          <input type="text" value={template.description} onChange={(e) => edit((t) => ({ ...t, description: e.target.value }), 'template:description')} onBlur={endGesture} />
        </div>
        <div className="mep-schematic-field">
          <label>Locale label</label>
          <input type="text" value={template.locale} onChange={(e) => edit((t) => ({ ...t, locale: e.target.value }), 'template:locale')} onBlur={endGesture} />
        </div>
        <NumberField label="Sheet width mm" value={template.sheet.widthMm} min={1} onBlur={endGesture} onCommit={(v) => v !== undefined && edit((t) => ({ ...t, sheet: { ...t.sheet, widthMm: v } }), 'template:sheetW')} />
        <NumberField label="Sheet height mm" value={template.sheet.heightMm} min={1} onBlur={endGesture} onCommit={(v) => v !== undefined && edit((t) => ({ ...t, sheet: { ...t.sheet, heightMm: v } }), 'template:sheetH')} />
        <div className="mep-schematic-buttons">
          {SHEET_SIZES.map((size) => (
            <button key={size.label} type="button" onClick={() => edit((t) => ({ ...t, sheet: { widthMm: size.widthMm, heightMm: size.heightMm } }))} title={`${size.widthMm} x ${size.heightMm} mm`}>
              {size.label}
            </button>
          ))}
        </div>
        <div className="mep-schematic-field">
          <label>Decimal separator</label>
          <select value={template.numberFormat.decimalSeparator} onChange={(e) => edit((t) => ({ ...t, numberFormat: { decimalSeparator: e.target.value === ',' ? ',' : '.' } }))}>
            <option value=",">Comma (1,5)</option>
            <option value=".">Point (1.5)</option>
          </select>
        </div>
        <div className="mep-schematic-field">
          <label>Date format</label>
          <select value={template.dateFormat ?? 'dd-mm-yyyy'} onChange={(e) => edit((t) => ({ ...t, dateFormat: e.target.value === 'yyyy-mm-dd' ? 'yyyy-mm-dd' : 'dd-mm-yyyy' }))}>
            <option value="dd-mm-yyyy">Day-month-year (25-09-2026)</option>
            <option value="yyyy-mm-dd">Year-month-day (2026-09-25)</option>
          </select>
        </div>
        <div className="mep-schematic-field">
          <label>Circuits run</label>
          <select value={template.groups[0]?.direction ?? 'column'} onChange={(e) => edit((t) => setTemplateDirection(t, e.target.value === 'row' ? 'row' : 'column'))} disabled={template.groups.length === 0}>
            <option value="column">Down the sheet (rows)</option>
            <option value="row">Across the sheet (columns)</option>
          </select>
        </div>
        <NumberField label="Group anchor x" value={template.groupAnchor.x} onBlur={endGesture} onCommit={(v) => v !== undefined && edit((t) => ({ ...t, groupAnchor: { ...t.groupAnchor, x: v } }), 'template:anchorX')} />
        <NumberField label="Group anchor y" value={template.groupAnchor.y} onBlur={endGesture} onCommit={(v) => v !== undefined && edit((t) => ({ ...t, groupAnchor: { ...t.groupAnchor, y: v } }), 'template:anchorY')} />
      </details>
    </div>
  );
}

const FIELD_TYPE_LABELS: Record<SchematicFieldDefinition['type'], string> = { text: 'Text', multiline: 'Multi-line text', date: 'Date', number: 'Number' };

/** The id box keeps its own text while it has focus and commits only an id that is valid and free, so the template never holds a bad or repeated id. */
function FieldIdInput({ value, others, onCommit, onBlur }: { value: string; others: string[]; onCommit: (id: string) => void; onBlur: () => void }) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  const problem = !FIELD_ID_PATTERN.test(text) ? 'Use letters, digits and underscores. Do not start with a digit.' : others.includes(text) ? 'Another field uses this id.' : null;
  return (
    <>
      <input
        type="text"
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          setText(e.target.value);
          if (FIELD_ID_PATTERN.test(e.target.value) && !others.includes(e.target.value)) onCommit(e.target.value);
        }}
        onBlur={() => {
          focused.current = false;
          setText(value);
          onBlur();
        }}
      />
      {problem && (
        <p className="mep-schematic-note" role="alert">
          {problem}
        </p>
      )}
    </>
  );
}

function FieldsSection({ template, edit, endGesture }: { template: SchematicTemplate; edit: EditTemplate; endGesture: () => void }) {
  const fields = template.fields ?? [];
  const remove = (field: SchematicFieldDefinition) => {
    const uses = findFieldUses(template, field.id);
    if (uses.length > 0 && !window.confirm(`The field "${field.label}" is read by ${uses.join(', ')}. That text goes blank if you delete the field. Delete it?`)) return;
    edit((t) => removeField(t, field.id));
  };
  return (
    <details open className="mep-section">
      <summary>
        <h4>Fields</h4>
      </summary>
      <p className="mep-schematic-hint">A field is a value that the user fills in for each schematic, such as the project name. A block shows it with {'{field.id}'}.</p>
      {fields.map((field, index) => {
        const key = (name: string) => `field:${index}:${name}`;
        const defaultError = field.defaultBinding ? bindingError(field.defaultBinding) : null;
        return (
          <div key={index} className="mep-schematic-fieldrow">
            <div className="mep-schematic-field">
              <label>Label</label>
              <input type="text" value={field.label} onChange={(e) => edit((t) => updateField(t, field.id, { label: e.target.value }), key('label'))} onBlur={endGesture} />
            </div>
            <div className="mep-schematic-field">
              <label>Id</label>
              <FieldIdInput
                value={field.id}
                others={fields.filter((_, i) => i !== index).map((f) => f.id)}
                onCommit={(id) => edit((t) => updateField(t, field.id, { id }), key('id'))}
                onBlur={endGesture}
              />
              <span className="mep-schematic-hint">Text that shows it: {`{field.${field.id}}`}. Changing the id does not change text that already reads the old id.</span>
            </div>
            <div className="mep-schematic-field">
              <label>Type</label>
              <select value={field.type} onChange={(e) => edit((t) => updateField(t, field.id, { type: e.target.value as SchematicFieldDefinition['type'] }))}>
                {(Object.keys(FIELD_TYPE_LABELS) as SchematicFieldDefinition['type'][]).map((type) => (
                  <option key={type} value={type}>
                    {FIELD_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="mep-schematic-field">
              <label>Entered</label>
              <select value={field.scope} onChange={(e) => edit((t) => updateField(t, field.id, { scope: e.target.value === 'project' ? 'project' : 'schematic' }))}>
                <option value="project">Once, shared by all schematics</option>
                <option value="schematic">For each schematic</option>
              </select>
            </div>
            {field.type === 'date' ? (
              <label className="mep-schematic-check">
                <input type="checkbox" checked={field.defaultToday === true} onChange={(e) => edit((t) => updateField(t, field.id, { defaultToday: e.target.checked ? true : undefined }))} />
                Default to today
              </label>
            ) : (
              <div className="mep-schematic-field">
                <label>Default</label>
                <input
                  type="text"
                  value={field.defaultBinding ?? ''}
                  placeholder="Text with {panel.name}"
                  onChange={(e) => edit((t) => updateField(t, field.id, { defaultBinding: e.target.value === '' ? undefined : e.target.value }), key('default'))}
                  onBlur={endGesture}
                />
                {defaultError && (
                  <p className="mep-schematic-note" role="alert">
                    {defaultError}
                  </p>
                )}
              </div>
            )}
            <div className="mep-schematic-buttons">
              <button type="button" onClick={() => edit((t) => reorderField(t, field.id, -1))} disabled={index === 0} title="Move up">
                Up
              </button>
              <button type="button" onClick={() => edit((t) => reorderField(t, field.id, 1))} disabled={index === fields.length - 1} title="Move down">
                Down
              </button>
              <button type="button" onClick={() => remove(field)}>
                Delete field
              </button>
            </div>
          </div>
        );
      })}
      <div className="mep-schematic-buttons">
        <button type="button" onClick={() => edit((t) => addField(t).template)}>
          Add field
        </button>
      </div>
    </details>
  );
}

function ruleOfKind(kind: string): CircuitGroupRule {
  if (kind === 'spare') return { kind: 'spare' };
  if (kind === 'circuitType') return { kind: 'circuitType', circuitTypeIds: [] };
  if (kind === 'circuitNumber') return { kind: 'circuitNumber', numbers: [] };
  return { kind: 'any' };
}

function CircuitNumberRule({ numbers, onChange, onBlur }: { numbers: number[]; onChange: (numbers: number[]) => void; onBlur: () => void }) {
  const [text, setText] = useState(formatNumberList(numbers));
  return (
    <div className="mep-schematic-field">
      <label>Circuit numbers</label>
      <input
        type="text"
        value={text}
        placeholder="1, 2, 5"
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseNumberList(e.target.value));
        }}
        onBlur={onBlur}
      />
    </div>
  );
}

interface BlockPropertiesProps {
  template: SchematicTemplate;
  block: SchematicBlock;
  selection: BlockRef;
  edit: EditTemplate;
  endGesture: () => void;
  loadTypes: string[];
  onDuplicateBlock: () => void;
  onDeleteBlock: () => void;
  onEditDrawing: () => void;
  symbols: SchematicSymbol[];
  onChangeSymbol: () => void;
  onDetachSymbol: () => void;
}

function BlockProperties({ template, block, selection, edit, endGesture, loadTypes, onDuplicateBlock, onDeleteBlock, onEditDrawing, symbols, onChangeSymbol, onDetachSymbol }: BlockPropertiesProps) {
  const info = SCHEMATIC_BLOCK_CATALOGUE[block.type];
  const key = (field: string) => `field:${block.id}:${field}`;
  const patch = (fields: Partial<SchematicBlock>, gestureKey?: string) => edit((t) => updateBlock(t, selection, fields), gestureKey);
  const style = block.style ?? {};
  const setStyle = (change: Partial<SchematicBlockStyle>, gestureKey?: string) => {
    const next: Record<string, unknown> = { ...style, ...change };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    patch({ style: Object.keys(next).length > 0 ? (next as SchematicBlockStyle) : undefined }, gestureKey);
  };

  const custom = block.binding !== undefined;
  const bindingText = block.binding ?? '';
  const errorText = custom && bindingText !== '' ? bindingError(bindingText) : null;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fields = getBindingFieldsForScope(info.scope);
  const templateFields = (template.fields ?? []).filter((f) => FIELD_ID_PATTERN.test(f.id));
  const insertField = (expression: string) => {
    if (expression === '') return;
    const source = block.binding ?? info.defaultBinding ?? '';
    const el = textareaRef.current;
    const start = custom ? (el?.selectionStart ?? source.length) : source.length;
    const end = custom ? (el?.selectionEnd ?? source.length) : source.length;
    const insert = `{${expression}}`;
    patch({ binding: source.slice(0, start) + insert + source.slice(end) });
    requestAnimationFrame(() => {
      const caret = start + insert.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  };

  return (
    <>
      <details open className="mep-section">
        <summary>
          <h4>Block · {info.label}</h4>
        </summary>
        <div className="mep-schematic-field">
          <label>Type and scope</label>
          <span className="mep-schematic-readonly">
            {block.type} · {block.type === 'drawing' && selection.groupId !== undefined ? 'Each circuit' : SCOPE_LABELS[info.scope]}
          </span>
        </div>
        <div className="mep-schematic-field">
          <label>Id</label>
          <span className="mep-schematic-readonly">{block.id}</span>
        </div>
        <NumberField label="x mm" value={block.x} step={0.5} onBlur={endGesture} onCommit={(v) => v !== undefined && patch({ x: v }, key('x'))} />
        <NumberField label="y mm" value={block.y} step={0.5} onBlur={endGesture} onCommit={(v) => v !== undefined && patch({ y: v }, key('y'))} />
        <NumberField label="Width mm" value={block.width} optional min={0.1} step={0.5} placeholder={String(getBlockWidth({ ...block, width: undefined }))} onBlur={endGesture} onCommit={(v) => patch({ width: v }, key('width'))} />
        <NumberField label="Height mm" value={block.height} optional min={0.1} step={0.5} placeholder={String(getBlockHeight({ ...block, height: undefined }))} onBlur={endGesture} onCommit={(v) => patch({ height: v }, key('height'))} />
        <NumberField label="Rotation °" value={block.rotation} step={5} onBlur={endGesture} onCommit={(v) => v !== undefined && patch({ rotation: v }, key('rotation'))} />
        {(block.type === 'busbar' || block.type === 'section') && <p className="mep-schematic-hint">Leave the size blank along the circuit direction, so the block spans its circuits.</p>}
        {block.type === 'drawing' && block.symbolId !== undefined && (
          <div className="mep-schematic-field">
            <label>Symbol</label>
            <span className="mep-schematic-readonly">{symbols.find((s) => s.id === block.symbolId)?.name ?? 'Missing symbol'}</span>
            <button type="button" onClick={onChangeSymbol}>
              Change…
            </button>
            <button type="button" onClick={onDetachSymbol} disabled={!symbols.some((s) => s.id === block.symbolId)} title="Keep a copy of the symbol's shapes in this block, so it no longer follows the library">
              Detach to drawing
            </button>
          </div>
        )}
        {DEVICE_SYMBOL_TYPES.includes(block.type) && (
          <div className="mep-schematic-field">
            <label>Symbol</label>
            <span className="mep-schematic-readonly">{block.symbolId === undefined ? 'Default' : (symbols.find((s) => s.id === block.symbolId)?.name ?? 'Missing symbol')}</span>
            <button type="button" onClick={onChangeSymbol}>
              Choose symbol…
            </button>
            {block.symbolId !== undefined && (
              <button type="button" onClick={() => edit((t) => setBlockSymbol(t, selection, undefined))} title="Go back to the built-in mark">
                Use default
              </button>
            )}
          </div>
        )}
        {block.type === 'drawing' && block.symbolId === undefined && (
          <div className="mep-schematic-field">
            <label>Shapes</label>
            <span className="mep-schematic-readonly">{block.shapes?.length ?? 0} shapes</span>
            <button type="button" onClick={onEditDrawing}>
              Edit drawing…
            </button>
          </div>
        )}
        <div className="mep-schematic-buttons">
          <button type="button" onClick={onDuplicateBlock}>
            Duplicate
          </button>
          <button type="button" onClick={onDeleteBlock}>
            Delete
          </button>
        </div>
      </details>

      {block.type !== 'totalsTable' && block.type !== 'frame' && block.type !== 'busbar' && block.type !== 'drawing' && (
        <details open className="mep-section">
          <summary>
            <h4>Text binding</h4>
          </summary>
          <div className="mep-schematic-radios">
            <label>
              <input type="radio" name={`binding-${block.id}`} checked={!custom} onChange={() => patch({ binding: undefined })} />
              Default
            </label>
            <label>
              <input type="radio" name={`binding-${block.id}`} checked={custom} onChange={() => patch({ binding: info.defaultBinding ?? '' })} />
              Custom
            </label>
          </div>
          {custom ? (
            <textarea
              ref={textareaRef}
              className="mep-schematic-textarea"
              rows={3}
              value={bindingText}
              onChange={(e) => patch({ binding: e.target.value }, key('binding'))}
              onBlur={endGesture}
              placeholder="Text with {fields}"
            />
          ) : (
            <p className="mep-schematic-readonly">{info.defaultBinding === undefined || info.defaultBinding === '' ? 'No text' : info.defaultBinding}</p>
          )}
          {errorText && (
            <p className="mep-schematic-note" role="alert">
              {errorText}
            </p>
          )}
          <div className="mep-schematic-field">
            <label>Insert field</label>
            <select value="" onChange={(e) => insertField(e.target.value)}>
              <option value="">Insert field…</option>
              {templateFields.length > 0 && (
                <optgroup label="Template fields">
                  {templateFields.map((field) => (
                    <option key={`field.${field.id}`} value={`field.${field.id}`} title={`{field.${field.id}}`}>
                      Field: {field.label}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Data">
                {fields.map((field) => (
                  <option key={field.expression} value={field.expression} title={field.description}>
                    {field.expression} — {field.description}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <p className="mep-schematic-hint">Write {'{field}'} for a value. Put text in [square brackets] to show it only when a field inside has a value.</p>
        </details>
      )}

      {block.type !== 'drawing' && (
        <details open className="mep-section">
          <summary>
            <h4>Style</h4>
          </summary>
          <NumberField label="Font size mm" value={style.fontSizeMm} optional min={0.5} step={0.1} onBlur={endGesture} onCommit={(v) => setStyle({ fontSizeMm: v }, key('fontSize'))} />
          <NumberField label="Line width mm" value={style.strokeWidthMm} optional min={0.05} step={0.05} onBlur={endGesture} onCommit={(v) => setStyle({ strokeWidthMm: v }, key('strokeWidth'))} />
          <div className="mep-schematic-radios">
            <label>
              <input type="checkbox" checked={style.bold === true} onChange={(e) => setStyle({ bold: e.target.checked || undefined })} />
              Bold
            </label>
            <label>
              <input type="checkbox" checked={style.italic === true} onChange={(e) => setStyle({ italic: e.target.checked || undefined })} />
              Italic
            </label>
          </div>
          <div className="mep-schematic-field">
            <label>Align</label>
            <select value={style.align ?? ''} onChange={(e) => setStyle({ align: e.target.value === '' ? undefined : (e.target.value as SchematicBlockStyle['align']) })}>
              <option value="">Default</option>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div className="mep-schematic-field">
            <label>Line style</label>
            <select value={style.dash ?? ''} onChange={(e) => setStyle({ dash: e.target.value === '' ? undefined : (e.target.value as SchematicBlockStyle['dash']) })}>
              <option value="">Default</option>
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>
          <div className="mep-schematic-field">
            <label>Color</label>
            <span className="mep-schematic-color">
              <input type="color" value={style.color === undefined ? '#111111' : toHex(style.color)} onChange={(e) => setStyle({ color: parseInt(e.target.value.slice(1), 16) }, key('color'))} onBlur={endGesture} />
              <button type="button" onClick={() => setStyle({ color: undefined })} disabled={style.color === undefined}>
                Clear
              </button>
            </span>
          </div>
        </details>
      )}

      {(info.scope === 'circuit' || info.scope === 'aggregate') && (
        <details open className="mep-section">
          <summary>
            <h4>Load type</h4>
          </summary>
          <div className="mep-schematic-field">
            <label>Load type filter</label>
            <input
              type="text"
              list="mep-schematic-load-types"
              value={block.loadTypeFilter ?? ''}
              onChange={(e) => patch({ loadTypeFilter: e.target.value === '' ? undefined : e.target.value }, key('loadType'))}
              onBlur={endGesture}
            />
            <datalist id="mep-schematic-load-types">
              {loadTypes.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
          </div>
          <p className="mep-schematic-hint">Only terminals of this load type count in {'{terminals}'} and {'{terminal.…}'}. Leave blank for all.</p>
        </details>
      )}

      {block.type === 'totalsTable' && <TotalsTableEditor block={block} patch={patch} endGesture={endGesture} keyOf={key} />}
    </>
  );
}

function TotalsTableEditor({ block, patch, endGesture, keyOf }: { block: SchematicBlock; patch: (fields: Partial<SchematicBlock>, gestureKey?: string) => void; endGesture: () => void; keyOf: (field: string) => string }) {
  const rows = block.tableRows ?? [];
  const setRow = (index: number, change: Partial<TotalsTableRow>, gestureKey?: string) => patch({ tableRows: rows.map((row, i) => (i === index ? { ...row, ...change } : row)) }, gestureKey);
  return (
    <details open className="mep-section">
      <summary>
        <h4>Table rows</h4>
      </summary>
      <div className="mep-schematic-field">
        <label>Columns</label>
        <select value={block.tableColumns ?? 'panel'} onChange={(e) => patch({ tableColumns: e.target.value === 'circuits' ? 'circuits' : 'panel' })}>
          <option value="panel">One value per row</option>
          <option value="circuits">One column per circuit</option>
        </select>
      </div>
      {rows.map((row, index) => {
        const error = formulaError(row.formula);
        return (
          <div key={index} className="mep-schematic-row-edit">
            <input type="text" value={row.label} placeholder="Label" onChange={(e) => setRow(index, { label: e.target.value }, keyOf(`row${index}label`))} onBlur={endGesture} />
            <input type="text" value={row.formula} placeholder="Formula" onChange={(e) => setRow(index, { formula: e.target.value }, keyOf(`row${index}formula`))} onBlur={endGesture} />
            <button type="button" onClick={() => patch({ tableRows: rows.filter((_, i) => i !== index) })} title="Remove this row">
              ×
            </button>
            {error && (
              <p className="mep-schematic-note" role="alert">
                {error}
              </p>
            )}
          </div>
        );
      })}
      <div className="mep-schematic-buttons">
        <button type="button" onClick={() => patch({ tableRows: [...rows, { label: 'New row', formula: 'sum(circuit.capacity)' }] })}>
          Add row
        </button>
      </div>
      <p className="mep-schematic-hint">A formula has no braces, for example sum(circuit.capacityL1).</p>
    </details>
  );
}
