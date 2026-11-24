import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FittingInfo, SegmentInfo } from '@mepapp/render';
import { formatSolvedCapacity, PropertiesPanel, type PropertiesPanelProps } from './PropertiesPanel.js';

describe('formatSolvedCapacity', () => {
  it('gives the plain number without atMost', () => {
    expect(formatSolvedCapacity(100)).toBe('100');
  });

  it('gives at most with atMost', () => {
    expect(formatSolvedCapacity(100, true)).toBe('at most 100');
  });

  it('gives Not solved for null', () => {
    expect(formatSolvedCapacity(null)).toBe('Not solved');
    expect(formatSolvedCapacity(null, true)).toBe('Not solved');
  });

  it('keeps a decimal value', () => {
    expect(formatSolvedCapacity(0.5, true)).toBe('at most 0.5');
  });
});

function render(overrides: Partial<PropertiesPanelProps> = {}): string {
  const props = {
    sceneRef: { current: null },
    selection: [],
    selectedSegment: null,
    selectedSegments: [],
    selectedFitting: null,
    networkTypes: [],
    customPropertyDefs: { terminal: [], equipment: [], circuit: [], room: [] },
    customStampDefinitions: [],
    labelLanguage: 'en',
    onOpenSchematic: () => {},
    onEditStamp: () => {},
    onReplaceStamps: () => {},
    circuits: [],
    panels: [],
    panelSections: [],
    circuitTypes: [],
    selectedCircuitId: null,
    selectedPanelId: null,
    setSelectedCircuitId: () => {},
    setSelectedPanelId: () => {},
    allStamps: [],
    showCircuitLines: false,
    onToggleCircuitLines: () => {},
    ...overrides,
  } as PropertiesPanelProps;
  return renderToStaticMarkup(createElement(PropertiesPanel, props));
}

function segment(overrides: Partial<SegmentInfo> = {}): SegmentInfo {
  return { id: 's1', networkTypeId: 'supply-air', shape: 'round', lengthPt: 100, lengthMm: null, solvedCapacity: 100, solvedNoSource: 'highest', ...overrides };
}

function fitting(overrides: Partial<FittingInfo> = {}): FittingInfo {
  return { id: 'f1', kind: 'junction', position: { x: 0, y: 0 }, solvedCapacity: 100, solvedNoSource: 'highest', ...overrides };
}

function hintOf(html: string, testId: string): string | undefined {
  return new RegExp(`data-testid="${testId}">([^<]*)<`).exec(html)?.[1];
}

function countOf(html: string, testId: string): number {
  return html.split(`data-testid="${testId}"`).length - 1;
}

describe('PropertiesPanel at most', () => {
  it('puts the at most hint above the riser hint of a segment with no source', () => {
    const html = render({ selectedSegment: segment(), segmentRiserHint: 'RISER HINT' });
    expect(html).toContain('value="at most 100"');
    expect(html).toContain('data-testid="props-at-most-hint"');
    expect(html.indexOf('props-at-most-hint')).toBeLessThan(html.indexOf('props-segment-riser-hint'));
    expect(hintOf(html, 'props-at-most-hint')).toMatch(/^No source yet\..*Place an air handling unit or a fan to set the source\.$/);
  });

  it('shows the plain number and no hint for a segment whose source is set', () => {
    const html = render({ selectedSegment: segment({ solvedNoSource: undefined }) });
    expect(html).toContain('value="100"');
    expect(html).not.toContain('props-at-most-hint');
  });

  it('shows the plain number and the loop hint for a segment on a loop', () => {
    const html = render({ selectedSegment: segment({ solvedNoSource: 'loop' }) });
    expect(html).toContain('value="100"');
    expect(hintOf(html, 'props-at-most-hint')).toMatch(/^This network has a loop and no source\./);
  });

  it('shows Not solved and the loop hint for the closing segment of a loop', () => {
    const html = render({ selectedSegment: segment({ solvedNoSource: 'loop', solvedCapacity: null }) });
    expect(html).toContain('value="Not solved"');
    expect(hintOf(html, 'props-at-most-hint')).toMatch(/^This network has a loop and no source\./);
  });

  it('shows Not solved and no hint for a highest segment with no value', () => {
    const html = render({ selectedSegment: segment({ solvedCapacity: null }) });
    expect(html).toContain('value="Not solved"');
    expect(html).not.toContain('props-at-most-hint');
  });

  it('names the drain source word for a fitting of a drain network', () => {
    const html = render({ selectedFitting: fitting(), fittingNetworkTypeId: 'sanitary-waste' });
    expect(html).toContain('value="at most 100"');
    expect(hintOf(html, 'props-at-most-hint')).toMatch(/Place an outlet or a pump to set the source\.$/);
  });

  it('shows no hint on a riser fitting, the riser block has its own hint', () => {
    const html = render({
      selectedFitting: fitting(),
      riserLines: { heading: 'R1', tag: null, rows: [], hints: [] },
    });
    expect(html).toContain('value="at most 100"');
    expect(html).toContain('data-testid="props-riser-section"');
    expect(html).not.toContain('props-at-most-hint');
  });

  it('names the neutral source word for a fitting with no network type', () => {
    const html = render({ selectedFitting: fitting() });
    expect(hintOf(html, 'props-at-most-hint')).toMatch(/Place a source equipment to set the source\.$/);
  });

  it('shows at most and one hint for several highest segments with one value', () => {
    const html = render({ selectedSegments: [segment({ id: 's1' }), segment({ id: 's2' })] });
    expect(html).toContain('value="at most 100"');
    expect(countOf(html, 'props-at-most-hint')).toBe(1);
  });

  it('shows Varies and one hint for several highest segments with different values', () => {
    const html = render({ selectedSegments: [segment({ id: 's1' }), segment({ id: 's2', solvedCapacity: 200 })] });
    expect(html).toContain('value="Varies"');
    expect(countOf(html, 'props-at-most-hint')).toBe(1);
  });

  it('shows the plain number and no hint when the selected segments differ in state', () => {
    const html = render({ selectedSegments: [segment({ id: 's1' }), segment({ id: 's2', solvedNoSource: undefined })] });
    expect(html).toContain('value="100"');
    expect(countOf(html, 'props-at-most-hint')).toBe(0);
  });

  it('names the neutral source word when the selected segments have two disciplines', () => {
    const html = render({
      selectedSegments: [segment({ id: 's1', networkTypeId: 'supply-air' }), segment({ id: 's2', networkTypeId: 'domestic-cold-water' })],
    });
    expect(hintOf(html, 'props-at-most-hint')).toMatch(/Place a source equipment to set the source\.$/);
  });
});
