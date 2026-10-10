import { describe, expect, it } from 'vitest';
import { PLACEMENT_RULE_EXAMPLES, validatePlacementRule } from '@mepapp/core';
import { draftOf, FieldError, ruleOf } from './components/placementRuleDraft.js';

const supply = PLACEMENT_RULE_EXAMPLES.find((r) => r.id === 'example-supply-air')!;

describe('ruleOf: term sources', () => {
  it('keeps a source that fits the unit', () => {
    const rule = ruleOf(supply.id, { ...draftOf(supply), from: { perPerson: 'supplyPerPersonDm3s' } });
    expect(rule.amount.from).toEqual({ perPerson: 'supplyPerPersonDm3s' });
    expect(validatePlacementRule(rule, [])).toBeNull();
  });

  it('a term set back to Number has no source, and the rule is valid', () => {
    const rule = ruleOf(supply.id, { ...draftOf(supply), from: { perPerson: undefined } });
    expect(rule.amount.from).toBeUndefined();
    expect(validatePlacementRule(rule, [])).toBeNull();
  });

  it('refuses a source that does not fit the unit, and does not drop the term', () => {
    expect(() => ruleOf(supply.id, { ...draftOf(supply), unit: 'W', from: { perPerson: 'supplyPerPersonDm3s' } })).toThrow(FieldError);
    expect(() => ruleOf(supply.id, { ...draftOf(supply), unit: 'W', from: { perPerson: 'supplyPerPersonDm3s' } })).toThrow(/does not fit the unit W/);
  });
});
