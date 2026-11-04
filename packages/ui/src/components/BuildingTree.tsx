import { useEffect, useRef, type KeyboardEvent } from 'react';
import { moveFocus, type TreeNode } from '../buildingTree.js';

export interface BuildingTreeProps {
  nodes: TreeNode[];
  /** The key of the selected node. */
  selectedKey: string;
  /** The key that has the focus (roving tabindex): the one tab stop of the tree. */
  focusKey: string;
  onFocusKey: (key: string) => void;
  /** Enter, Space or a click on a node. */
  onActivate: (node: TreeNode) => void;
  /** Left and Right on a building, or a click on its arrow. */
  onToggle: (key: string, expand: boolean) => void;
  /** Delete on a building that is not open, or a click on its remove button. */
  onForget: (node: TreeNode) => void;
  /** Focus the tree when it mounts. */
  autoFocus: boolean;
}

/** The buildings and the levels of the open building as an ARIA tree (flat items with aria-level). */
export function BuildingTree({
  nodes,
  selectedKey,
  focusKey,
  onFocusKey,
  onActivate,
  onToggle,
  onForget,
  autoFocus,
}: BuildingTreeProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoFocus) rootRef.current?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')?.focus();
  }, []);

  function focusItem(key: string) {
    onFocusKey(key);
    const items = rootRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]');
    items?.forEach((item) => {
      if (item.dataset.key === key) item.focus();
    });
  }

  function forget(node: TreeNode) {
    const index = nodes.findIndex((item) => item.key === node.key);
    const nextKey = nodes[index + 1]?.key ?? nodes[index - 1]?.key ?? null;
    onForget(node);
    if (nextKey !== null) requestAnimationFrame(() => focusItem(nextKey));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, node: TreeNode) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate(node);
      return;
    }
    if (event.key === 'Delete' && node.kind === 'building' && !node.isOpen) {
      event.preventDefault();
      forget(node);
      return;
    }
    const move = moveFocus(nodes, node.key, event.key);
    if (move === null) return;
    event.preventDefault();
    if (move.toggle !== null) onToggle(move.toggle.key, move.toggle.expand);
    focusItem(move.focusKey);
  }

  if (nodes.length === 0) return <p className="mep-hint mep-tree-empty">No buildings yet.</p>;

  return (
    <div ref={rootRef} className="mep-tree" role="tree" aria-label="Buildings and levels">
      {nodes.map((node) => (
        <div
          key={node.key}
          role="treeitem"
          data-key={node.key}
          data-kind={node.kind}
          data-testid={`tree-${node.kind}`}
          aria-level={node.depth}
          aria-selected={node.key === selectedKey}
          aria-expanded={node.expandable ? node.expanded : undefined}
          tabIndex={node.key === focusKey ? 0 : -1}
          className={`mep-tree-item mep-tree-item--${node.kind === 'add-level' ? 'add' : node.kind}${node.isOpen ? ' mep-tree-item--open' : ''}${node.key === selectedKey ? ' mep-tree-item--selected' : ''}`}
          onFocus={(event) => {
            if (event.target === event.currentTarget) onFocusKey(node.key);
          }}
          onClick={() => onActivate(node)}
          onKeyDown={(event) => handleKeyDown(event, node)}
        >
          {node.expandable ? (
            <button
              type="button"
              className="mep-tree-arrow"
              tabIndex={-1}
              aria-hidden="true"
              title={node.expanded ? 'Collapse' : 'Expand'}
              onClick={(event) => {
                event.stopPropagation();
                const item = event.currentTarget.closest('[role="treeitem"]') as HTMLElement | null;
                onToggle(node.key, !node.expanded);
                item?.focus();
              }}
            >
              {node.expanded ? '▾' : '▸'}
            </button>
          ) : (
            <span className="mep-tree-arrow" aria-hidden="true" />
          )}
          <span className="mep-tree-text">
            <span className="mep-tree-label" title={node.label}>
              {node.label}
            </span>
            {node.kind === 'building' && node.detail !== null && <span className="mep-tree-detail">{node.detail}</span>}
          </span>
          {node.kind === 'level' && node.warning && (
            <span className="mep-tree-dot" role="img" aria-label="A sheet of this level has a missing PDF or no access" title="A sheet of this level has a missing PDF or no access" />
          )}
          {node.kind === 'sheet' && node.warning && (
            <span className="mep-tree-dot" role="img" aria-label="This sheet has a missing PDF or no access" title="This sheet has a missing PDF or no access" />
          )}
          {node.kind !== 'building' && node.detail !== null && <span className="mep-tree-count">{node.detail}</span>}
          {node.kind === 'building' && !node.isOpen && (
            <button
              type="button"
              className="mep-tree-forget"
              tabIndex={-1}
              aria-label={`Remove ${node.label} from the list`}
              title="Remove from the list"
              onClick={(event) => {
                event.stopPropagation();
                forget(node);
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
