import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { accountFromDraft, blankDraft, draftFrom } from './account-form';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });

describe('blankDraft', () => {
  it('A new рахунок starts empty, in the owner"s own currency', () => {
    expect(blankDraft()).toEqual({ name: '', kind: 'spending', currency: 'UAH', opening: '' });
  });
});

describe('draftFrom', () => {
  it('An existing рахунок edits what it shows', () => {
    expect(draftFrom(card)).toEqual({
      editing: card,
      name: 'mono black',
      kind: 'spending',
      currency: 'UAH',
      // Zero is an empty field, not a typed «0,00».
      opening: '',
    });
  });

  it('A non-zero opening balance is shown in major units', () => {
    const opened = account({ ...card, openingBalance: money(125500, 'UAH') });

    expect(draftFrom(opened).opening).toBe('1255,00');
  });

  it('A negative opening balance keeps its sign and parses back', () => {
    const overdrawn = account({ ...card, openingBalance: money(-5000, 'UAH') });

    const draft = draftFrom(overdrawn);

    expect(draft.opening).toBe('-50,00');
    expect(accountFromDraft(draft, 'unused').openingBalance).toEqual(money(-5000, 'UAH'));
  });
});

describe('accountFromDraft', () => {
  it('Scenario: Renaming is immediately visible', () => {
    const renamed = accountFromDraft({ ...draftFrom(card), name: 'mono чорна' }, 'unused');

    expect(renamed.id).toBe('card');
    expect(renamed.name).toBe('mono чорна');
    // The balance is unchanged because nothing about it moved: same opening balance, same currency.
    expect(renamed.openingBalance).toEqual(card.openingBalance);
    expect(renamed.kind).toBe('spending');
  });

  it('A рахунок needs a назва', () => {
    expect(() => accountFromDraft({ ...blankDraft(), name: '   ' }, 'new')).toThrow(
      'рахунок потребує назви',
    );
  });

  it('A new рахунок takes the id it is given', () => {
    const created = accountFromDraft({ ...blankDraft(), name: 'гаманець', kind: 'cash' }, 'new');

    expect(created.id).toBe('new');
    expect(created.kind).toBe('cash');
    expect(created.archived).toBe(false);
  });

  it('The назва is stored trimmed', () => {
    expect(accountFromDraft({ ...blankDraft(), name: '  гаманець  ' }, 'new').name).toBe(
      'гаманець',
    );
  });

  it('An archived рахунок stays archived through an edit', () => {
    const retired = account({ ...card, archived: true });

    expect(accountFromDraft(draftFrom(retired), 'unused').archived).toBe(true);
  });

  it('An empty opening balance is zero in the рахунок"s own currency', () => {
    const created = accountFromDraft({ ...blankDraft(), name: 'гаманець' }, 'new');

    expect(created.openingBalance).toEqual(money(0, 'UAH'));
  });

  it('What is not a сума is refused before anything is stored', () => {
    expect(() =>
      accountFromDraft({ ...blankDraft(), name: 'гаманець', opening: 'abc' }, 'new'),
    ).toThrow(/це не сума/);
  });
});
