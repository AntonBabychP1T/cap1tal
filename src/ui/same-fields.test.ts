import { describe, expect, it } from 'vitest';

import { sameFields } from './same-fields';

/**
 * app-shell, "A form with unsaved edits asks before «назад» discards it": whether a form holds
 * anything the owner changed is `!sameFields(current, opened)` on the form's own field object.
 * The per-form proofs sit beside each form's draft (`installment-form.test.ts`, …); this file holds
 * the comparison itself.
 */
describe('sameFields', () => {
  it('Scenario: An untouched form closes at once — the opened fields are the same fields', () => {
    const opened = { merchant: '', mcc: '', target: 'category', categoryId: undefined };
    expect(sameFields({ ...opened }, opened)).toBe(true);
  });

  it('Scenario: An edited form asks first — one typed field is a change', () => {
    const opened = { merchant: '', mcc: '', target: 'category' };
    expect(sameFields({ ...opened, merchant: 'zzqa' }, opened)).toBe(false);
  });

  it('a field typed and then erased again is no change', () => {
    const opened = { name: 'Кафе', amount: '' };
    const typed = { ...opened, amount: '25' };
    expect(sameFields({ ...typed, amount: '' }, opened)).toBe(true);
  });

  it('a field left absent and a field set to undefined are the same empty field', () => {
    expect(sameFields({ merchant: '', categoryId: undefined }, { merchant: '' })).toBe(true);
    expect(sameFields({ merchant: '' }, { merchant: '', categoryId: 'food' })).toBe(false);
  });

  it('a list of ticked ids is compared as a set — ticking and unticking in any order is no change', () => {
    const opened = { accountIds: ['a', 'b'] };
    expect(sameFields({ accountIds: ['b', 'a'] }, opened)).toBe(true);
    expect(sameFields({ accountIds: ['a'] }, opened)).toBe(false);
    expect(sameFields({ accountIds: ['a', 'b', 'c'] }, opened)).toBe(false);
  });
});
