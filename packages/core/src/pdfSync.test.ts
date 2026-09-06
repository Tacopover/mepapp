import { describe, expect, it } from 'vitest';
import { planPdfSync, reconcilePdfSync } from './pdfSync.js';

describe('reconcilePdfSync', () => {
  it('matches a domain id whose observed geometry is identical', () => {
    const report = reconcilePdfSync(
      [{ id: 'segment-1', geometry: { x: 10, y: 20 } }],
      [{ id: 'segment-1', geometry: { x: 10, y: 20 } }],
    );
    expect(report.matchedIds).toEqual(['segment-1']);
    expect(report.drifted).toEqual([]);
    expect(report.missingIds).toEqual([]);
    expect(report.foreignIds).toEqual([]);
  });

  it('flags drift when a matched annotation moved (edited by another PDF viewer)', () => {
    const report = reconcilePdfSync(
      [{ id: 'segment-1', geometry: { x: 10, y: 20 } }],
      [{ id: 'segment-1', geometry: { x: 99, y: 20 } }],
    );
    expect(report.matchedIds).toEqual([]);
    expect(report.drifted).toEqual([{ id: 'segment-1', domainGeometry: { x: 10, y: 20 }, annotationGeometry: { x: 99, y: 20 } }]);
    expect(report.missingIds).toEqual([]);
  });

  it('flags a missing id when a domain object has no matching annotation (deleted by another viewer)', () => {
    const report = reconcilePdfSync([{ id: 'segment-1', geometry: { x: 0, y: 0 } }], []);
    expect(report.missingIds).toEqual(['segment-1']);
    expect(report.matchedIds).toEqual([]);
    expect(report.drifted).toEqual([]);
  });

  it('flags an observed annotation with no matching domain id as foreign, never claiming it', () => {
    const report = reconcilePdfSync([], [{ id: 'acrobat-comment-7', geometry: { x: 0, y: 0 } }]);
    expect(report.foreignIds).toEqual(['acrobat-comment-7']);
    expect(report.missingIds).toEqual([]);
  });

  it('handles a mixed batch independently per id', () => {
    const report = reconcilePdfSync(
      [
        { id: 'a', geometry: { x: 1 } },
        { id: 'b', geometry: { x: 2 } },
        { id: 'c', geometry: { x: 3 } },
      ],
      [
        { id: 'a', geometry: { x: 1 } }, // matched
        { id: 'b', geometry: { x: 200 } }, // drifted
        { id: 'foreign', geometry: { x: 0 } }, // foreign
        // 'c' missing entirely
      ],
    );
    expect(report.matchedIds).toEqual(['a']);
    expect(report.drifted.map((d) => d.id)).toEqual(['b']);
    expect(report.missingIds).toEqual(['c']);
    expect(report.foreignIds).toEqual(['foreign']);
  });
});

describe('planPdfSync', () => {
  it('plans a create for a brand-new domain object with no prior annotation', () => {
    const plan = planPdfSync([{ id: 'segment-1', geometry: { x: 0, y: 0 } }], [], new Set());
    expect(plan.toCreate).toEqual(['segment-1']);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it('plans an update when the domain geometry has moved since the annotation was written', () => {
    const plan = planPdfSync(
      [{ id: 'segment-1', geometry: { x: 5, y: 0 } }],
      [{ id: 'segment-1', geometry: { x: 0, y: 0 } }],
      new Set(['segment-1']),
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual(['segment-1']);
  });

  it('plans a delete only for a previously-synced id whose domain object is gone', () => {
    const plan = planPdfSync([], [{ id: 'segment-1', geometry: { x: 0, y: 0 } }], new Set(['segment-1']));
    expect(plan.toDelete).toEqual(['segment-1']);
  });

  it('never plans deleting a foreign annotation, even if it is currently observed and has no domain match', () => {
    const plan = planPdfSync(
      [],
      [{ id: 'acrobat-comment-7', geometry: { x: 0, y: 0 } }],
      new Set(), // never claimed by MepApp, so not in previouslySyncedIds
    );
    expect(plan.toDelete).toEqual([]);
  });

  it('plans nothing when domain and observed already agree', () => {
    const plan = planPdfSync(
      [{ id: 'segment-1', geometry: { x: 1, y: 2 } }],
      [{ id: 'segment-1', geometry: { x: 1, y: 2 } }],
      new Set(['segment-1']),
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });
});
