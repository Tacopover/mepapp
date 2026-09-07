import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';
import {
  DockviewReact,
  themeLight,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelProps,
  type SerializedDockview,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { IconDock, IconFloat } from '../icons.js';

export interface DockviewTabDef {
  id: string;
  label: string;
}

export interface DockviewShellProps {
  tabs: DockviewTabDef[];
  content: Record<string, ReactNode>;
}

const LAYOUT_STORAGE_KEY = 'mepapp.dockLayout.v1';

// Field Blueprint's own light palette, layered on dockview's stock light
// theme via CSS variable overrides — see the `.mep-dockview-theme` block in
// theme.css. Keeps this as a small, real theme rather than the placeholder
// dark theme the spike used.
const theme = { ...themeLight, className: `${themeLight.className} mep-dockview-theme` };

interface SlotParams {
  tabId: string;
}

// Panel content isn't handed to dockview through `params` (dockview
// serializes params into the saved layout JSON — a React element there
// would break persistence). Instead each slot looks up its live content by
// id from this context, which App.tsx re-provides on every render.
const DockContentContext = createContext<Record<string, ReactNode>>({});

function DockContentSlot({ params }: IDockviewPanelProps<SlotParams>) {
  const content = useContext(DockContentContext);
  return <div className="mep-dock-body">{content[params.tabId] ?? null}</div>;
}

// Per-group Dock/Float shortcut button — real drag-and-drop (Shift+drag a
// tab to float it, drag a floating tab onto a group to redock it) works
// without this, but it's not discoverable without knowing the Shift
// modifier, so it stays as an explicit affordance alongside the drag
// gestures (see dockable-panel-system.md D3).
function DockGroupHeaderActions(props: IDockviewHeaderActionsProps) {
  const isFloating = props.location?.type === 'floating';

  const onFloat = () => {
    props.containerApi.addFloatingGroup(props.group, { width: 360, height: 460 });
  };
  const onDock = () => {
    const target = props.containerApi.groups.find((g) => g.id !== props.group.id && g.api.location.type === 'grid') ?? props.containerApi.addGroup();
    props.api.moveTo({ group: target, position: 'center' });
  };

  return (
    <div className="mep-dock-header-actions">
      <button type="button" className="mep-dock-mode-btn" title={isFloating ? 'Dock' : 'Float'} onClick={isFloating ? onDock : onFloat}>
        {isFloating ? <IconDock size={13} /> : <IconFloat size={13} />}
      </button>
    </div>
  );
}

// Registered once at module scope so component identity is stable across
// renders — an inline object here would make DockviewReact remount every
// panel on every App.tsx re-render.
const components = { slot: DockContentSlot };

/**
 * Replaces the hand-rolled DockPanel: wires the app's real panel content
 * into dockview-react so floating/resizing/re-docking/tab-drag-to-float/
 * tab-drag-to-merge come from the library instead of being hand-built.
 * See .claude/plans/dockable-panel-system.md.
 */
export function DockviewShell({ tabs, content }: DockviewShellProps) {
  const apiRef = useRef<DockviewApi | null>(null);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;

      let restored = false;
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved) {
        try {
          event.api.fromJSON(JSON.parse(saved) as SerializedDockview);
          restored = true;
        } catch {
          // Corrupt/incompatible saved layout — fall through to the default below.
        }
      }

      if (!restored) {
        tabs.forEach((tab, i) => {
          event.api.addPanel({
            id: tab.id,
            component: 'slot',
            title: tab.label,
            params: { tabId: tab.id },
            position: i === 0 ? undefined : { referencePanel: tabs[0].id, direction: 'within' },
          });
        });
      }

      event.api.onDidLayoutChange(() => {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(event.api.toJSON()));
      });
    },
    [tabs],
  );

  return (
    <DockContentContext.Provider value={content}>
      <DockviewReact theme={theme} onReady={onReady} components={components} rightHeaderActionsComponent={DockGroupHeaderActions} />
    </DockContentContext.Provider>
  );
}
