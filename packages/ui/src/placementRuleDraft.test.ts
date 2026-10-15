import { describe, expect, it } from 'vitest';
import { BUILT_IN_NEEDS, PLACEMENT_RULE_EXAMPLES, validatePlacementRule, type RoomNeed } from '@mepapp/core';
import { blankRule, countByPatch, draftOf, FieldError, needPatch, ruleOf } from './components/placementRuleDraft.js';

const need = (id: string) => BUILT_IN_NEEDS.find((n) => n.id === id)!;

describe('the draft of a placement rule', () => {
  it('gives each example rule back unchanged', () => {
    for (const example of PLACEMENT_RULE_EXAMPLES) expect(ruleOf(example.id, draftOf(example))).toEqual(example);
  });

  it('a blank rule serves Supply air and is valid', () => {
    const rule = blankRule('New rule');
    expect(rule).toMatchObject({ countBy: 'need', needId: 'supplyAir', unit: 'dm³/s' });
    expect(validatePlacementRule(rule, [])).toBeNull();
  });

  it('a new need keeps a unit that it offers, and Light gets the factors', () => {
    const draft = draftOf(blankRule('R'));
    expect(needPatch({ ...draft, unit: 'm³/h' }, need('returnAir'))).toMatchObject({ needId: 'returnAir', unit: 'm³/h' });
    expect(needPatch(draft, need('heating'))).toMatchObject({ unit: 'W' });
    expect(needPatch(draft, need('light'))).toMatchObject({ unit: '', uf: '0.6', mf: '0.8' });
    expect(countByPatch('coverage')).toEqual({ countBy: 'coverage', strategy: 'evenSpread' });
  });

  it('keeps the unit only for a flow or a power, and writes a capacity only for a flow, a power or another amount', () => {
    const draft = { ...draftOf(blankRule('R')), capacity: '2' };
    const sockets = ruleOf('r', { ...draft, ...needPatch(draft, need('sockets')), writeCapacity: true });
    expect(sockets).toMatchObject({ needId: 'sockets', capacityPerElement: 2, writeCapacity: false });
    expect(sockets.unit).toBeUndefined();
    const own: RoomNeed = { id: 'need-water', name: 'Water', kind: 'amount', unit: 'l/s', own: true };
    expect(ruleOf('r', { ...draft, needId: own.id }, [...BUILT_IN_NEEDS, own]).writeCapacity).toBe(true);
  });

  it('Light needs the factors; a UF table needs both numbers in a row', () => {
    const draft = { ...draftOf(blankRule('R')), ...needPatch(draftOf(blankRule('R')), need('light')) };
    expect(ruleOf('r', { ...draft, capacity: '3600' }).luminaire).toEqual({ utilisationFactor: 0.6, maintenanceFactor: 0.8 });
    expect(() => ruleOf('r', { ...draft, mf: '' })).toThrow(/maintenance factor/);
    expect(() => ruleOf('r', { ...draft, ufMode: 'table', ufTable: [{ k: '1', uf: '' }] })).toThrow(FieldError);
  });

  it('the same number in each room', () => {
    const rule = ruleOf('r', { ...draftOf(blankRule('R')), ...countByPatch('perRoom'), perRoomCount: '2' });
    expect(rule).toMatchObject({ countBy: 'perRoom', perRoomCount: 2, writeCapacity: false });
    expect(rule.needId).toBeUndefined();
  });

  it('keeps the routing targets and the network type copies', () => {
    const copy = { id: 'nt-1', name: 'Supply Air 2', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#1565c0', lineWidthPt: 2, linePattern: 'solid' } as const;
    const rule = { ...blankRule('R'), routingTarget: 'chilled-water', portRoutingTargets: { hw: 'heating-water', drain: null }, networkTypeCopies: [copy] };
    expect(ruleOf(rule.id, draftOf(rule))).toEqual(rule);
    expect(ruleOf('r', draftOf(blankRule('R')))).not.toHaveProperty('routingTarget');
  });

  it('refuses a text that is not a number', () => {
    expect(() => ruleOf('r', { ...draftOf(blankRule('R')), capacity: 'abc' })).toThrow('What one stamp gives: "abc" is not a number.');
  });
});
