import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  SCHEMATIC_TEMPLATE_LIBRARY,
  generateSchematic,
  getCircuitLabel,
  getStampDefinition,
  type Circuit,
  type CircuitType,
  type Panel,
  type PanelSection,
  type StampDefinition,
} from '@mepapp/core';
import type { StampInfo } from '@mepapp/render';
import { SchematicBlockSvg } from '../schematicBlockSvg.js';
import { buildSchematicTerminals } from '../schematicTerminals.js';
import { Dialog } from './Dialog.js';

export interface SchematicDialogProps {
  panels: Panel[];
  circuits: Circuit[];
  panelSections: PanelSection[];
  circuitTypes: CircuitType[];
  stamps: StampInfo[];
  customStampDefinitions: StampDefinition[];
  initialPanelId: string;
  onClose: () => void;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_ZOOM_IN = 0.02;
const SHEET_MARGIN_MM = 8;

/**
 * The generated distribution board schedule for one panel (electrical-schematic-templates.md
 * Phase 4): the panel's circuits laid out by a template and drawn as SVG in sheet millimetres. It
 * regenerates from the props on every render, so it always shows the current circuits and terminals.
 * Read-only: the template editor is Phase 5, and export is Phase 6.
 */
export function SchematicDialog({ panels, circuits, panelSections, circuitTypes, stamps, customStampDefinitions, initialPanelId, onClose }: SchematicDialogProps) {
  const [panelId, setPanelId] = useState(initialPanelId);
  const [templateId, setTemplateId] = useState(SCHEMATIC_TEMPLATE_LIBRARY[0].id);
  const panel = panels.find((p) => p.id === panelId) ?? panels[0];
  const template = SCHEMATIC_TEMPLATE_LIBRARY.find((t) => t.id === templateId) ?? SCHEMATIC_TEMPLATE_LIBRARY[0];

  const terminals = useMemo(() => buildSchematicTerminals(stamps, customStampDefinitions), [stamps, customStampDefinitions]);
  const generated = useMemo(
    () => (panel ? generateSchematic({ panel, circuits, sections: panelSections, terminals, circuitTypes }, template) : undefined),
    [panel, circuits, panelSections, terminals, circuitTypes, template],
  );

  const fitView = (): ViewBox => ({ x: -SHEET_MARGIN_MM, y: -SHEET_MARGIN_MM, w: template.sheet.widthMm + SHEET_MARGIN_MM * 2, h: template.sheet.heightMm + SHEET_MARGIN_MM * 2 });
  const [view, setView] = useState<ViewBox>(fitView);
  useEffect(() => setView(fitView()), [template]); // eslint-disable-line react-hooks/exhaustive-deps

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const anchor = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
      const factor = Math.min(Math.max(Math.pow(1.0015, event.deltaY), 0.5), 2);
      setView((v) => {
        const w = Math.max(v.w * factor, template.sheet.widthMm * MAX_ZOOM_IN);
        const scale = w / v.w;
        return { x: anchor.x - (anchor.x - v.x) * scale, y: anchor.y - (anchor.y - v.y) * scale, w, h: v.h * scale };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [template, panel]);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const ctm = svgRef.current?.getScreenCTM();
    if (!drag || drag.pointerId !== event.pointerId || !ctm) return;
    const dx = (event.clientX - drag.clientX) / ctm.a;
    const dy = (event.clientY - drag.clientY) / ctm.d;
    dragRef.current = { ...drag, clientX: event.clientX, clientY: event.clientY };
    setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const loadShapesFor = (definitionId: string | undefined) => (definitionId ? getStampDefinition(definitionId, customStampDefinitions)?.shapes : undefined);

  const unplaced = generated?.diagnostics.filter((d) => d.kind === 'no-matching-group') ?? [];
  const bindingErrors = generated?.diagnostics.filter((d) => d.kind === 'binding-error') ?? [];
  const memberCount = panel ? circuits.filter((c) => c.panelId === panel.id).length : 0;

  return (
    <Dialog title="Schematic" onClose={onClose} className="mep-modal--wide" closeOnBackdropClick={false} actions={<button onClick={onClose}>Close</button>}>
      <div className="mep-schematic">
        <div className="mep-schematic-bar">
          <label>
            Panel
            <select value={panel?.id ?? ''} onChange={(event) => setPanelId(event.target.value)} disabled={panels.length === 0}>
              {panels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Template
            <select value={template.id} onChange={(event) => setTemplateId(event.target.value)} title={template.description}>
              {SCHEMATIC_TEMPLATE_LIBRARY.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setView(fitView())}>
            Fit to sheet
          </button>
          <span className="mep-schematic-hint">Scroll to zoom, drag to pan.</span>
        </div>

        {!panel ? (
          <p className="mep-schematic-empty">There is no panel yet. Convert an Equipment stamp to a panel first, then add circuits to it.</p>
        ) : (
          <>
            {memberCount === 0 && <p className="mep-schematic-note">This panel has no circuits yet, so only the panel-level blocks are shown.</p>}
            {unplaced.length > 0 && (
              <p className="mep-schematic-note" role="status">
                {unplaced.length} circuit{unplaced.length === 1 ? ' has' : 's have'} no matching group in this template and {unplaced.length === 1 ? 'is' : 'are'} not drawn:{' '}
                {unplaced.map((d) => (d.kind === 'no-matching-group' ? circuitLabelById(d.circuitId, circuits, panel) : '')).join(', ')}.
              </p>
            )}
            {bindingErrors.length > 0 && (
              <p className="mep-schematic-note" role="status">
                {bindingErrors.length} text binding{bindingErrors.length === 1 ? ' is' : 's are'} invalid in this template: {[...new Set(bindingErrors.map((d) => (d.kind === 'binding-error' ? d.message : '')))].join('; ')}
              </p>
            )}
            <svg
              ref={svgRef}
              className="mep-schematic-canvas"
              role="img"
              aria-label={`Schematic of panel ${panel.name}`}
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <rect x={0} y={0} width={template.sheet.widthMm} height={template.sheet.heightMm} fill="#ffffff" stroke="#9aa3ad" strokeWidth={0.4} />
              {generated?.blocks.map((block) => (
                <SchematicBlockSvg key={block.id} block={block} loadShapes={block.type === 'loadSymbol' ? loadShapesFor(block.loadStampDefinitionId) : undefined} />
              ))}
            </svg>
          </>
        )}
      </div>
    </Dialog>
  );
}

function circuitLabelById(circuitId: string, circuits: Circuit[], panel: Panel): string {
  const circuit = circuits.find((c) => c.id === circuitId);
  return circuit ? getCircuitLabel(circuit, panel) : circuitId;
}
