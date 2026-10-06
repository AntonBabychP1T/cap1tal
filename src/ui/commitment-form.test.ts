import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import type { Commitment } from '../domain/commitments';
import { isRefusal } from '../domain/refusal';
import { CORRECTION_CATEGORY_ID, FEES_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import {
  COMMITMENT_FIELD_LABELS,
  FIRST_DUE_HINT,
  PERIODICITY_CHOICES,
  commitmentAccountChoices,
  commitmentAccountRows,
  commitmentCategoryRows,
  commitmentDraftOf,
  commitmentDraftProblems,
  commitmentFromDraft,
  draftCurrency,
  editCommitmentDraft,
  newCommitmentDraft,
  type CommitmentDraft,
} from './commitment-form';
import { allOffer, narrow, shortlist } from './shortlist';

const TODAY = '2026-10-02';
const black = account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH' });
const usd = account({ id: 'usd', name: 'mono USD', kind: 'spending', currency: 'USD' });
const old = account({ id: 'old', name: 'Стара', kind: 'spending', currency: 'UAH', archived: true });
const subscriptions = { id: 'subscriptions', name: 'Підписки', archived: false };
const accounts = [black, usd, old];
const context = { accounts, categories: [subscriptions] };

function typed(draft: CommitmentDraft, ...changes: Partial<CommitmentDraft>[]): CommitmentDraft {
  return changes.reduce<CommitmentDraft>((d, change) => editCommitmentDraft(d, change, accounts), draft);
}

const fresh = () => newCommitmentDraft(TODAY, commitmentAccountChoices(accounts));

describe('commitments-screen — the form', () => {
  it('Scenario: Monthly unless told otherwise', () => {
    const draft = fresh();
    expect(draft.periodicity).toBe('monthly');
    expect(PERIODICITY_CHOICES.find((c) => c.value === draft.periodicity)?.label).toBe('Щомісяця');
    expect(PERIODICITY_CHOICES.map((c) => c.label)).toEqual(['Щомісяця', 'Щокварталу', 'Щопівроку', 'Щороку']);
    expect(draft.firstDue).toBe(TODAY);
    expect(FIRST_DUE_HINT).toContain('уже записаних витрат');
  });

  it('offers every unarchived рахунок, of any currency', () => {
    expect(commitmentAccountChoices(accounts).map((a) => a.id)).toEqual(['black', 'usd']);
    // Each wears its currency, as in the entry form, so a search for «USD» finds the USD one.
    expect(commitmentAccountRows(accounts)).toEqual([
      { id: 'black', name: 'mono black · UAH' },
      { id: 'usd', name: 'mono USD · USD' },
    ]);
    expect(narrow(commitmentAccountRows(accounts), 'usd').map((r) => r.id)).toEqual(['usd']);
  });

  it('Scenario: The pickers offer five and the rest behind one offer', () => {
    const nine = Array.from({ length: 9 }, (_, i) =>
      account({ id: `a${i}`, name: `Рахунок ${i + 1}`, kind: 'spending', currency: i === 0 ? 'USD' : 'UAH' }),
    );
    const own = Array.from({ length: 27 }, (_, i) => ({ id: `c${i}`, name: `Категорія ${i + 1}`, archived: false }));
    const categories = [
      ...own,
      { id: UNCATEGORISED_CATEGORY_ID, name: 'Без категорії', archived: false },
      { id: FEES_CATEGORY_ID, name: 'Комісія', archived: false },
      { id: CORRECTION_CATEGORY_ID, name: 'Коригування', archived: false },
      { id: 'gone', name: 'Стара категорія', archived: true },
    ];
    const draft = newCommitmentDraft(TODAY, commitmentAccountChoices([...nine, old]));

    const accountRows = commitmentAccountRows([...nine, old]);
    const shownAccounts = shortlist(accountRows, { recentIds: [], selectedId: draft.debitAccountId });
    expect(shownAccounts).toHaveLength(5);
    expect(allOffer(accountRows, 'accounts')).toBe('Всі рахунки (9)');
    expect(narrow(accountRows, '')).toHaveLength(9);
    expect(narrow(accountRows, 'рахунок 9').map((r) => r.id)).toEqual(['a8']);

    const categoryRows = commitmentCategoryRows(categories);
    const shownCategories = shortlist(categoryRows, { recentIds: [], selectedId: draft.categoryId });
    expect(shownCategories).toHaveLength(5);
    expect(allOffer(categoryRows, 'categories')).toBe('Всі категорії (28)');
    // «Без категорії» once — as having none — and never «Комісія» or «Коригування».
    const names = (rows: readonly { name: string }[]) => rows.map((r) => r.name);
    for (const list of [shownCategories, narrow(categoryRows, '')]) {
      expect(names(list).filter((name) => name === 'Без категорії')).toHaveLength(1);
      expect(names(list)).not.toContain('Комісія');
      expect(names(list)).not.toContain('Коригування');
    }
    expect(categoryRows.find((r) => r.name === 'Без категорії')?.id).toBe('');
    expect(categoryRows.map((r) => r.id)).not.toContain(UNCATEGORISED_CATEGORY_ID);
    expect(narrow(categoryRows, 'коміс')).toEqual([]);
    // The last reached for come first; the short list stays five.
    const recent = shortlist(categoryRows, { recentIds: ['c26', FEES_CATEGORY_ID], selectedId: '' });
    expect(recent.map((r) => r.id)).toEqual(['c26', '', 'c0', 'c9', 'c10']);
  });

  it('Scenario: A USD card makes a USD сума', () => {
    const draft = typed(fresh(), { name: 'ChatGPT' }, { debitAccountId: 'usd' }, { amount: '20' }, { name: 'ChatGPT ' });
    expect(draftCurrency(draft, accounts)).toBe('USD');
    expect(draft.amount).toBe('20,00');
    const stored = commitmentFromDraft(draft, { ...context, id: 'c1', now: new Date(1) });
    expect(stored).toMatchObject({ name: 'ChatGPT', amount: 2_000, currency: 'USD', debitAccountId: 'usd' });
  });

  it('Scenario: A refusal sits next to its field', () => {
    const draft = typed(fresh(), { name: 'Netflix' }, { amount: '299' }, { debitAccountId: 'black' }, { marker: 'tv' });
    const { problems } = commitmentDraftProblems(draft, context);
    expect(problems).toEqual({ marker: 'Текст в описі списання — щонайменше 3 символи.' });
    expect(COMMITMENT_FIELD_LABELS.marker).toBe('Текст в описі списання');
    let thrown: unknown;
    try {
      commitmentFromDraft(draft, { ...context, id: 'c1', now: new Date(1) });
    } catch (error) {
      thrown = error;
    }
    expect(isRefusal(thrown)).toBe(true);
  });

  it('says every missing value beside its own field', () => {
    const { problems } = commitmentDraftProblems({ ...fresh(), firstDue: '31.02.2026', debitAccountId: '' }, context);
    expect(Object.keys(problems).sort()).toEqual(['amount', 'debitAccount', 'firstDue', 'name']);
    expect(problems.amount).toBe('Вкажіть суму одного платежу.');
  });

  it('refuses an archived рахунок when chosen, and keeps one already stored', () => {
    const draft = typed(fresh(), { name: 'Оренда' }, { amount: '15000' }, { debitAccountId: 'old' });
    expect(commitmentDraftProblems(draft, context).problems.debitAccount).toContain('в архіві');
    const existing: Commitment = {
      id: 'c-rent',
      name: 'Оренда',
      amount: 1_500_000,
      currency: 'UAH',
      periodicity: 'monthly',
      firstDue: '2026-10-10',
      debitAccountId: 'old',
      recordedAt: 5,
      stoppedOn: '2026-12-01',
    };
    const edit = commitmentDraftOf(existing);
    expect(commitmentDraftProblems(edit, { ...context, existing }).problems).toEqual({});
    // An edit keeps the id, the moment and the дата припинення.
    expect(commitmentFromDraft(edit, { ...context, existing, id: existing.id, now: new Date(99) })).toEqual(existing);
  });

  it('opens «Редагувати» on the current values', () => {
    const netflix: Commitment = {
      id: 'c-netflix',
      name: 'Netflix',
      amount: 29_900,
      currency: 'UAH',
      periodicity: 'quarterly',
      firstDue: '2026-10-15',
      debitAccountId: 'black',
      categoryId: 'subscriptions',
      marker: 'netflix',
      recordedAt: 1,
    };
    expect(commitmentDraftOf(netflix)).toEqual({
      name: 'Netflix',
      amount: '299,00',
      periodicity: 'quarterly',
      firstDue: '2026-10-15',
      debitAccountId: 'black',
      categoryId: 'subscriptions',
      marker: 'netflix',
    });
  });

  describe('«Рахунок списання» is never a person', () => {
    const chorna = account({ id: 'chorna', name: 'mono чорна', kind: 'spending', currency: 'UAH' });
    const ibkr = account({ id: 'ibkr', name: 'IBKR', kind: 'investment', currency: 'USD' });
    const yaroslav = account({ id: 'yaroslav', name: 'Ярослав', kind: 'debt', currency: 'UAH' });
    const olya = account({ id: 'olya', name: 'Оля', kind: 'debt', currency: 'UAH' });

    it('Scenario: A зобов\'язання is not paid from a person', () => {
      const rows = commitmentAccountRows([chorna, ibkr, yaroslav]);
      expect(rows.map((r) => r.id)).toEqual(['ibkr', 'chorna']);
      expect(allOffer(rows, 'accounts')).toBeUndefined();
    });

    it('Scenario: A stored зобов\'язання on a рахунок-борг still shows it', () => {
      const existing: Commitment = {
        id: 'c-loan',
        name: 'Позика',
        amount: 29_900,
        currency: 'UAH',
        periodicity: 'monthly',
        firstDue: '2026-10-10',
        debitAccountId: 'yaroslav',
        recordedAt: 7,
      };
      const all = [chorna, ibkr, yaroslav];
      const rows = commitmentAccountRows(all, existing.debitAccountId);
      expect(rows.map((r) => r.id)).toEqual(['ibkr', 'chorna', 'yaroslav']);
      const draft = commitmentDraftOf(existing);
      expect(shortlist(rows, { recentIds: [], selectedId: draft.debitAccountId }).map((r) => r.id)).toContain(
        'yaroslav',
      );
      const ctx = { accounts: all, categories: [subscriptions], existing };
      expect(commitmentFromDraft(draft, { ...ctx, id: existing.id, now: new Date(99) })).toEqual(existing);
    });

    it('Scenario: Only рахунки-борги leave nothing to pay from', () => {
      const all = [yaroslav, olya];
      expect(commitmentAccountRows(all)).toEqual([]);
      const draft = typed(
        newCommitmentDraft(TODAY, commitmentAccountChoices(all)),
        { name: 'Оренда' },
        { amount: '15000' },
      );
      expect(draft.debitAccountId).toBe('');
      const { problems } = commitmentDraftProblems(draft, { accounts: all, categories: [] });
      expect(problems.debitAccount).toBeDefined();
      expect(() =>
        commitmentFromDraft(draft, { accounts: all, categories: [], id: 'c', now: new Date(1) }),
      ).toThrow(problems.debitAccount);
    });
  });

  it('stores a trimmed ознака, and none for blank', () => {
    const draft = typed(fresh(), { name: 'Netflix' }, { amount: '299' }, { debitAccountId: 'black' });
    expect(commitmentFromDraft({ ...draft, marker: '  NETFLIX ' }, { ...context, id: 'c', now: new Date(1) }).marker).toBe(
      'NETFLIX',
    );
    expect(commitmentFromDraft({ ...draft, marker: '   ' }, { ...context, id: 'c', now: new Date(1) })).not.toHaveProperty(
      'marker',
    );
  });
});
