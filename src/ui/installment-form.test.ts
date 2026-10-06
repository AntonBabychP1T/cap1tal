import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { isRefusal } from '../domain/refusal';
import {
  debitAccountChoices,
  editInstallmentDraft,
  installmentAccountRows,
  installmentCategoryRows,
  installmentDraftOf,
  installmentDraftProblems,
  installmentFromDraft,
  lastPartOf,
  newInstallmentDraft,
  sameInstallmentFields,
  type InstallmentDraft,
} from './installment-form';
import { allOffer, narrow, shortlist } from './shortlist';

const TODAY = '2026-10-01';
const black = account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH' });
const usd = account({ id: 'usd', name: 'USD', kind: 'spending', currency: 'USD' });
const old = account({ id: 'old', name: 'Стара', kind: 'spending', currency: 'UAH', archived: true });
const tech = { id: 'tech', name: 'Техніка', archived: false };
const context = { accounts: [black, usd, old], categories: [tech] };

function typed(draft: InstallmentDraft, ...changes: Parameters<typeof editInstallmentDraft>[1][]): InstallmentDraft {
  return changes.reduce<InstallmentDraft>((d, change) => editInstallmentDraft(d, change, TODAY), draft);
}

const fresh = () => newInstallmentDraft(TODAY, debitAccountChoices(context.accounts));

describe('the розстрочка form', () => {
  it('starts on today, offers only unarchived UAH рахунки, and picks the only one', () => {
    expect(debitAccountChoices(context.accounts).map((a) => a.id)).toEqual(['black']);
    const draft = fresh();
    expect(draft.firstDue).toBe(TODAY);
    expect(draft.debitAccountId).toBe('black');
    expect(draft.paidBefore).toBe('0');
  });

  it('Scenario: Ten thousand over ten months', () => {
    const draft = typed(fresh(), { total: '10000' }, { partsCount: '10' });
    expect(draft.part).toBe('1000,00');
    expect(lastPartOf(draft)).toBeUndefined();
  });

  it('Scenario: The remainder is shown', () => {
    const draft = typed(fresh(), { total: '1000' }, { partsCount: '3' });
    expect(draft.part).toBe('333,33');
    expect(lastPartOf(draft)).toBe('333,34');
  });

  it('Scenario: A typed платіж is not overwritten', () => {
    const draft = typed(fresh(), { total: '10000' }, { partsCount: '10' }, { part: '1050' }, { partsCount: '9' });
    expect(draft.part).toBe('1050,00');
    expect(draft.partTyped).toBe(true);
  });

  it('Scenario: An existing розстрочка counts its past платежі', () => {
    const draft = typed(fresh(), { partsCount: '10' }, { firstDue: '2026-06-05' });
    expect(draft.paidBefore).toBe('4');
    // Set by hand, it stays where the owner put it.
    const set = typed(draft, { paidBefore: '3' }, { firstDue: '2026-05-05' });
    expect(set.paidBefore).toBe('3');
  });

  it('refuses beside each field, in Ukrainian, and stores nothing while any stands', () => {
    const draft = typed(fresh(), { name: '   ' }, { total: '1000' }, { partsCount: '1' }, { debitAccountId: 'usd' });
    const { problems } = installmentDraftProblems(draft, context);
    expect(problems.name).toBe('Назвіть, що куплено.');
    expect(problems.partsCount).toBe('Кількість платежів — від 2 до 60.');
    expect(problems.debitAccount).toBe('Рахунок списання має бути в гривнях.');

    let thrown: unknown;
    try {
      installmentFromDraft(draft, { ...context, id: 'i', now: new Date(2026, 9, 1) });
    } catch (error) {
      thrown = error;
    }
    expect(isRefusal(thrown)).toBe(true);
    expect((thrown as Error).message).toBe('Назвіть, що куплено.');
  });

  it('refuses a typed платіж the повна сума cannot carry, and an unparseable сума', () => {
    const tooMuch = typed(fresh(), { name: 'iPhone' }, { total: '10000' }, { partsCount: '10' }, { part: '1120' });
    expect(installmentDraftProblems(tooMuch, context).problems.part).toContain('більші за повну суму');
    const garbage = typed(fresh(), { total: 'abc' });
    expect(installmentDraftProblems(garbage, context).problems.total).toContain('це не сума');
  });

  it('builds the розстрочка from a complete form', () => {
    const draft = typed(
      fresh(),
      { name: ' iPhone ' },
      { total: '49999' },
      { partsCount: '10' },
      { categoryId: 'tech' },
    );
    const now = new Date(2026, 9, 1, 12);
    expect(installmentFromDraft(draft, { ...context, id: 'i-1', now })).toEqual({
      id: 'i-1',
      name: 'iPhone',
      total: 4_999_900,
      partsCount: 10,
      part: 499_990,
      firstDue: TODAY,
      debitAccountId: 'black',
      paidBefore: 0,
      categoryId: 'tech',
      recordedAt: now.getTime(),
    });
  });

  it('opens an existing розстрочка on its own values and keeps its moment and closing', () => {
    const stored = {
      id: 'i-1',
      name: 'iPhone',
      total: 1_000_000,
      partsCount: 10,
      part: 105_000,
      firstDue: '2026-06-05',
      debitAccountId: 'old',
      paidBefore: 4,
      recordedAt: 5,
      closedOn: '2026-09-30',
    };
    const draft = installmentDraftOf(stored);
    expect(draft.part).toBe('1050,00');
    expect(lastPartOf(draft)).toBe('550,00');
    // The archived card it already had is not refused on edit.
    const edited = installmentFromDraft(typed(draft, { name: 'iPhone 16' }), {
      ...context,
      existing: stored,
      id: stored.id,
      now: new Date(),
    });
    expect(edited).toEqual({ ...stored, name: 'iPhone 16' });
  });
});

describe('installments-screen — «Рахунок списання» is never a person', () => {
  const chorna = account({ id: 'chorna', name: 'mono чорна', kind: 'spending', currency: 'UAH' });
  const bonds = account({ id: 'bonds', name: 'військові облігації', kind: 'investment', currency: 'UAH' });
  const olya = account({ id: 'olya', name: 'Оля', kind: 'debt', currency: 'UAH' });

  it('Scenario: A розстрочка is paid from bonds but not from a person', () => {
    expect(debitAccountChoices([chorna, bonds, olya]).map((a) => a.id)).toEqual(['bonds', 'chorna']);
  });

  it('Scenario: A stored розстрочка on a рахунок-борг still shows it', () => {
    const stored = {
      id: 'i-olya',
      name: 'Ноутбук',
      total: 1_000_000,
      partsCount: 10,
      part: 100_000,
      firstDue: '2026-06-05',
      debitAccountId: 'olya',
      paidBefore: 4,
      recordedAt: 5,
    };
    const all = [chorna, bonds, olya];
    expect(debitAccountChoices(all, stored.debitAccountId).map((a) => a.id)).toEqual(['bonds', 'chorna', 'olya']);
    const saved = installmentFromDraft(installmentDraftOf(stored), {
      accounts: all,
      categories: [],
      existing: stored,
      id: stored.id,
      now: new Date(),
    });
    expect(saved).toEqual(stored);
  });
});

describe('installments-screen — what «назад» asks about', () => {
  it('Scenario: An untouched form closes at once', () => {
    expect(sameInstallmentFields(fresh(), fresh())).toBe(true);
  });

  it('Scenario: An edited form asks first', () => {
    expect(sameInstallmentFields(typed(fresh(), { name: 'Ноутбук' }), fresh())).toBe(false);
  });

  it('a щомісячний платіж typed and erased again is no change, though the form now keeps it as typed', () => {
    const erased = typed(fresh(), { part: '500' }, { part: '' });
    expect(erased.partTyped).toBe(true);
    expect(sameInstallmentFields(erased, fresh())).toBe(true);
  });
});

describe('app-shell — the розстрочка form uses the entry form\'s picker', () => {
  it('Scenario: The розстрочка form no longer scrolls through every категорія', () => {
    const names = Array.from({ length: 27 }, (_, i) => `Категорія ${String(i + 1).padStart(2, '0')}`);
    const categories = [
      ...names.map((name, i) => ({ id: `c${i}`, name, archived: false })),
      { id: 'food', name: 'Продукти', archived: false },
      { id: 'cafe', name: 'Кафе', archived: false },
    ].slice(2);
    expect(categories.filter((c) => !c.archived)).toHaveLength(27);
    const rows = installmentCategoryRows(categories);
    // «Без категорії» once and first.
    expect(rows[0]).toEqual({ id: '', name: 'Без категорії' });
    expect(rows.filter((r) => r.name === 'Без категорії')).toHaveLength(1);
    const shown = shortlist(rows, { recentIds: ['food', 'cafe'], selectedId: '' });
    expect(shown).toHaveLength(5);
    expect(shown.map((r) => r.id).slice(0, 2)).toEqual(['food', 'cafe']);
    expect(allOffer(rows, 'categories')).toBe(`Всі категорії (${rows.length})`);
  });

  it('names each рахунок with its currency, so the search finds it', () => {
    const bonds = account({ id: 'bonds', name: 'військові облігації', kind: 'investment', currency: 'UAH' });
    const rows = installmentAccountRows([black, usd, old, bonds]);
    expect(rows).toEqual([
      { id: 'bonds', name: 'військові облігації · UAH' },
      { id: 'black', name: 'mono black · UAH' },
    ]);
    expect(narrow(rows, 'облігац').map((r) => r.id)).toEqual(['bonds']);
  });
});
