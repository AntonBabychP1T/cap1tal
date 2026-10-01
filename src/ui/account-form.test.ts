import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import {
  accountFromDraft,
  blankDraft,
  draftFrom,
  openingDateProblem,
  showsOpeningDate,
} from './account-form';

const TODAY = '2026-10-01';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });

describe('blankDraft', () => {
  it('A new рахунок starts empty, in the owner"s own currency', () => {
    expect(blankDraft(TODAY)).toEqual({
      name: '',
      kind: 'spending',
      currency: 'UAH',
      opening: '',
      openingDate: '2026-10-01',
    });
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
      // A рахунок stored before the дата existed shows none.
      openingDate: '',
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
    expect(accountFromDraft(draft, 'unused', TODAY).openingBalance).toEqual(money(-5000, 'UAH'));
  });
});

describe('accountFromDraft', () => {
  it('Scenario: Renaming is immediately visible', () => {
    const renamed = accountFromDraft({ ...draftFrom(card), name: 'mono чорна' }, 'unused', TODAY);

    expect(renamed.id).toBe('card');
    expect(renamed.name).toBe('mono чорна');
    // The balance is unchanged because nothing about it moved: same opening balance, same currency.
    expect(renamed.openingBalance).toEqual(card.openingBalance);
    expect(renamed.kind).toBe('spending');
  });

  it('A рахунок needs a назва', () => {
    expect(() => accountFromDraft({ ...blankDraft(TODAY), name: '   ' }, 'new', TODAY)).toThrow(
      'рахунок потребує назви',
    );
  });

  it('A new рахунок takes the id it is given', () => {
    const created = accountFromDraft({ ...blankDraft(TODAY), name: 'гаманець', kind: 'cash' }, 'new', TODAY);

    expect(created.id).toBe('new');
    expect(created.kind).toBe('cash');
    expect(created.archived).toBe(false);
  });

  it('The назва is stored trimmed', () => {
    expect(accountFromDraft({ ...blankDraft(TODAY), name: '  гаманець  ' }, 'new', TODAY).name).toBe(
      'гаманець',
    );
  });

  it('An archived рахунок stays archived through an edit', () => {
    const retired = account({ ...card, archived: true });

    expect(accountFromDraft(draftFrom(retired), 'unused', TODAY).archived).toBe(true);
  });

  it('An empty opening balance is zero in the рахунок"s own currency', () => {
    const created = accountFromDraft({ ...blankDraft(TODAY), name: 'гаманець' }, 'new', TODAY);

    expect(created.openingBalance).toEqual(money(0, 'UAH'));
  });

  it('What is not a сума is refused before anything is stored', () => {
    expect(() =>
      accountFromDraft({ ...blankDraft(TODAY), name: 'гаманець', opening: 'abc' }, 'new', TODAY),
    ).toThrow(/це не сума/);
  });
});

describe('«станом на»', () => {
  const cash = account({ id: 'cash', name: 'готівка EUR', kind: 'cash', currency: 'EUR', openingBalance: money(30000, 'EUR') });

  it('Scenario: The owner dates an old balance', () => {
    const draft = { ...draftFrom(cash), openingDate: '08.06.2026' };
    expect(showsOpeningDate(draft)).toBe(true);
    expect(openingDateProblem(draft, TODAY)).toBeUndefined();
    expect(accountFromDraft(draft, 'unused', TODAY).openingDate).toBe('2026-06-08');
  });

  it('Scenario: A future date is explained in the form', () => {
    const draft = { ...blankDraft(TODAY), name: 'нова', opening: '500', openingDate: '2026-10-05' };
    expect(openingDateProblem(draft, TODAY)).toBe('дата початкового залишку не може бути в майбутньому');
    expect(() => accountFromDraft(draft, 'new', TODAY)).toThrow(
      'дата початкового залишку не може бути в майбутньому',
    );
    // What was typed stays in the draft: the refusal changed nothing.
    expect(draft).toMatchObject({ name: 'нова', opening: '500' });
  });

  it('Scenario: A zero opening asks for no date', () => {
    const draft = { ...blankDraft(TODAY), name: 'гаманець' };
    expect(showsOpeningDate(draft)).toBe(false);
    expect(showsOpeningDate({ ...draft, opening: '0,00' })).toBe(false);
    // No дата of its own: the repository records the day it was created.
    expect(accountFromDraft(draft, 'new', TODAY).openingDate).toBeUndefined();
  });

  it('defaults to today on a new рахунок and keeps the stored дата on an edit', () => {
    expect(accountFromDraft({ ...blankDraft(TODAY), name: 'нова', opening: '100' }, 'new', TODAY).openingDate).toBe(TODAY);
    const dated = account({ ...cash, openingDate: '2026-06-08' });
    expect(accountFromDraft({ ...draftFrom(dated), name: 'EUR' }, 'unused', TODAY).openingDate).toBe('2026-06-08');
    // Cleared beside a zeroed opening: the stored дата is kept, not lost.
    expect(accountFromDraft({ ...draftFrom(dated), opening: '' }, 'unused', TODAY).openingDate).toBe('2026-06-08');
  });

  it('explains a дата that is not one', () => {
    expect(openingDateProblem({ ...draftFrom(cash), openingDate: '31.02.2026' }, TODAY)).toMatch(/такого дня немає/);
  });
});
