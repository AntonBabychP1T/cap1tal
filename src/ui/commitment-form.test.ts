import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import type { Commitment } from '../domain/commitments';
import { isRefusal } from '../domain/refusal';
import {
  COMMITMENT_FIELD_LABELS,
  FIRST_DUE_HINT,
  PERIODICITY_CHOICES,
  commitmentAccountChoices,
  commitmentDraftOf,
  commitmentDraftProblems,
  commitmentFromDraft,
  draftCurrency,
  editCommitmentDraft,
  newCommitmentDraft,
  type CommitmentDraft,
} from './commitment-form';

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
