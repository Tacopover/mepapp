import { useEffect, useRef, useState } from 'react';
import { SCHEMATIC_BLOCK_CATALOGUE, type BlockRef, type SchematicBlockScope, type SchematicBlockType, type SchematicSymbol, type SchematicTemplate } from '@mepapp/core';
import { buildTemplateOutline, type OutlineBlock } from '../templateOutline.js';
import { IconBringToFront, IconChevDown, IconChevRight, IconCopy, IconPlus, IconSendToBack, IconTrash } from '../icons.js';
import { BlockTypeIcon } from './BlockTypeIcon.js';

/** The drag data type of a palette entry. The value is the block type. */
export const BLOCK_DRAG_TYPE = 'application/x-mep-schematic-block';

const PALETTE_SCOPES: { scope: SchematicBlockScope; label: string; hint?: string }[] = [
  { scope: 'once', label: 'Sheet' },
  { scope: 'panel', label: 'Panel' },
  { scope: 'section', label: 'Section' },
  { scope: 'circuit', label: 'Circuit', hint: 'Repeats for every circuit of a group.' },
  { scope: 'aggregate', label: 'Aggregate' },
];

export interface TemplateOutlinePanelProps {
  template: SchematicTemplate;
  symbols: SchematicSymbol[];
  selection: BlockRef | null;
  activeGroupId: string | null;
  onSelectBlock: (ref: BlockRef) => void;
  onSelectGroup: (groupId: string) => void;
  onReorderBlock: (ref: BlockRef, steps: number) => void;
  onDuplicateBlock: () => void;
  onDeleteBlock: () => void;
  onAddGroup: () => void;
  onReorderGroup: (groupId: string, steps: number) => void;
  onDuplicateGroup: (groupId: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onAddBlock: (type: SchematicBlockType) => void;
}

const sameRef = (a: BlockRef | null, b: BlockRef) => a !== null && a.blockId === b.blockId && a.groupId === b.groupId;

/** The template editor's left panel: an Outline tab (the sheet and each group, with their blocks) and an Add tab (the palette). */
export function TemplateOutlinePanel(props: TemplateOutlinePanelProps) {
  const [tab, setTab] = useState<'outline' | 'add'>('outline');
  return (
    <aside className="mep-schematic-side mep-ws-left">
      <div className="mep-subtabs" role="tablist" aria-label="Left panel">
        <button type="button" role="tab" aria-selected={tab === 'outline'} className={tab === 'outline' ? 'on' : undefined} onClick={() => setTab('outline')}>
          Outline
        </button>
        <button type="button" role="tab" aria-selected={tab === 'add'} className={tab === 'add' ? 'on' : undefined} onClick={() => setTab('add')}>
          Add
        </button>
      </div>
      {tab === 'outline' ? <OutlineTree {...props} /> : <Palette template={props.template} onAddBlock={props.onAddBlock} />}
    </aside>
  );
}

function OutlineTree({ template, symbols, selection, activeGroupId, onSelectBlock, onSelectGroup, onReorderBlock, onDuplicateBlock, onDeleteBlock, onAddGroup, onReorderGroup, onDuplicateGroup, onRemoveGroup }: TemplateOutlinePanelProps) {
  const outline = buildTemplateOutline(template, symbols);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectionKey = selection ? `${selection.groupId ?? '-'}/${selection.blockId}` : activeGroupId ? `group:${activeGroupId}` : null;
  useEffect(() => {
    if (!selectionKey) return;
    const row = listRef.current?.querySelector(`[data-outline-key="${CSS.escape(selectionKey)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [selectionKey]);

  const blockRows = (blocks: OutlineBlock[]) =>
    blocks.map((item, index) => {
      const selected = sameRef(selection, item.ref);
      const key = `${item.ref.groupId ?? '-'}/${item.id}`;
      return (
        <li key={key} className={`mep-outline-row mep-outline-block${selected ? ' on' : ''}`} data-outline-key={key}>
          <button type="button" className="mep-outline-main" aria-pressed={selected} onClick={() => onSelectBlock(item.ref)} title={`${item.label} (${item.id})`}>
            <BlockTypeIcon type={item.type} size={15} />
            <span className="mep-outline-label">
              {item.label}
              {item.detail && <span className="mep-outline-detail"> “{item.detail}”</span>}
            </span>
            <span className="mep-outline-id">{item.id}</span>
          </button>
          {selected && (
            <span className="mep-outline-tools">
              <button type="button" className="mep-outline-tool" aria-label="Draw earlier" title="Draw earlier (further back)" disabled={index === 0} onClick={() => onReorderBlock(item.ref, -1)}>
                <IconSendToBack size={14} />
              </button>
              <button type="button" className="mep-outline-tool" aria-label="Draw later" title="Draw later (in front)" disabled={index === blocks.length - 1} onClick={() => onReorderBlock(item.ref, 1)}>
                <IconBringToFront size={14} />
              </button>
              <button type="button" className="mep-outline-tool" aria-label="Duplicate" title="Duplicate (Ctrl+D)" onClick={onDuplicateBlock}>
                <IconCopy size={14} />
              </button>
              <button type="button" className="mep-outline-tool" aria-label="Delete" title="Delete (Delete key)" onClick={onDeleteBlock}>
                <IconTrash size={14} />
              </button>
            </span>
          )}
        </li>
      );
    });

  const caret = (key: string) => (
    <button type="button" className="mep-outline-caret" aria-label={collapsed.has(key) ? 'Expand' : 'Collapse'} aria-expanded={!collapsed.has(key)} onClick={() => toggle(key)}>
      {collapsed.has(key) ? <IconChevRight size={13} /> : <IconChevDown size={13} />}
    </button>
  );

  return (
    <div className="mep-outline" ref={listRef}>
      <div className="mep-outline-node">
        <div className="mep-outline-head">
          {caret('sheet')}
          <span className="mep-outline-title">Sheet</span>
          <span className="mep-outline-id">{outline.sheet.length}</span>
        </div>
        {!collapsed.has('sheet') && <ul className="mep-outline-list">{blockRows(outline.sheet)}</ul>}
      </div>

      {outline.groups.map((group, index) => {
        const active = group.groupId === activeGroupId && !selection;
        const current = group.groupId === activeGroupId && (!selection || selection.groupId === group.groupId);
        const key = `group:${group.groupId}`;
        return (
          <div key={group.groupId} className="mep-outline-node">
            <div className={`mep-outline-head mep-outline-row${active ? ' on' : ''}${current ? ' current' : ''}`} data-outline-key={key}>
              {caret(key)}
              <button type="button" className="mep-outline-main" aria-pressed={active} onClick={() => onSelectGroup(group.groupId)} title="Select the group to edit its rule and pitch">
                <span className="mep-outline-label">
                  <span className="mep-outline-title">{group.name}</span>
                  <span className="mep-outline-detail"> · {group.rule}</span>
                </span>
              </button>
              {current && (
                <span className="mep-outline-tools">
                  <button type="button" className="mep-outline-tool" aria-label="Move group up" title="Move up: it is checked earlier" disabled={index === 0} onClick={() => onReorderGroup(group.groupId, -1)}>
                    ↑
                  </button>
                  <button type="button" className="mep-outline-tool" aria-label="Move group down" title="Move down: it is checked later" disabled={index === outline.groups.length - 1} onClick={() => onReorderGroup(group.groupId, 1)}>
                    ↓
                  </button>
                  <button type="button" className="mep-outline-tool" aria-label="Duplicate group" title="Duplicate the group and its blocks" onClick={() => onDuplicateGroup(group.groupId)}>
                    <IconCopy size={14} />
                  </button>
                  <button type="button" className="mep-outline-tool" aria-label="Delete group" title="Delete the group and its blocks" onClick={() => onRemoveGroup(group.groupId)}>
                    <IconTrash size={14} />
                  </button>
                </span>
              )}
            </div>
            {!collapsed.has(key) && (
              <ul className="mep-outline-list">
                {blockRows(group.blocks)}
                {group.blocks.length === 0 && <li className="mep-schematic-hint mep-outline-empty">No blocks. Add circuit blocks from the Add tab.</li>}
              </ul>
            )}
          </div>
        );
      })}

      {outline.groups.length === 0 && <p className="mep-schematic-hint mep-outline-empty">No groups. Circuits are not drawn until you add one.</p>}
      <p className="mep-schematic-hint mep-outline-empty">The first group whose rule matches a circuit draws it.</p>
      <button type="button" className="mep-outline-add" onClick={onAddGroup}>
        <IconPlus size={14} /> Add group
      </button>
    </div>
  );
}

function Palette({ template, onAddBlock }: { template: SchematicTemplate; onAddBlock: (type: SchematicBlockType) => void }) {
  const canAddCircuitBlock = template.groups.length > 0;
  return (
    <div className="mep-palette">
      <p className="mep-schematic-hint">Click a block to add it, or drag it onto the sheet. Shapes, text and symbols are on the tool bar.</p>
      {PALETTE_SCOPES.map(({ scope, label, hint }) => (
        <div key={scope} className="mep-palette-group">
          <span className="mep-schematic-palette-heading" title={hint}>
            {label}
          </span>
          <div className="mep-palette-grid">
            {(Object.keys(SCHEMATIC_BLOCK_CATALOGUE) as SchematicBlockType[])
              .filter((type) => SCHEMATIC_BLOCK_CATALOGUE[type].scope === scope && type !== 'drawing')
              .map((type) => {
                const disabled = scope === 'circuit' && !canAddCircuitBlock;
                const info = SCHEMATIC_BLOCK_CATALOGUE[type];
                return (
                  <button
                    key={type}
                    type="button"
                    className="mep-palette-item"
                    disabled={disabled}
                    draggable={!disabled}
                    title={disabled ? 'Add a group first: circuit blocks belong to a group.' : `Add: ${info.label}. Drag it onto the sheet to place it.`}
                    onClick={() => onAddBlock(type)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(BLOCK_DRAG_TYPE, type);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <BlockTypeIcon type={type} />
                    <span>{info.label}</span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
