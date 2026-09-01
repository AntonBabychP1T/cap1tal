import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import type { Rule } from '../domain/rules';
import {
  isoDate,
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type Expense,
} from '../domain/transaction';
import { accountsRepo } from '../db/accounts-repo';
import { notificationsRepo, type NotificationsRepo } from '../db/notifications-repo';
import { openTestDb, seedReferences, type TestStorage } from '../db/test-db';
import { transactionsRepo, type TransactionsRepo } from '../db/transactions-repo';
import { fingerprintOf, type CapturedNotification } from '../notifications/capture';
import { processCapture, type Draft } from '../notifications/draft';
import {
  confirmPendingDraft,
  dismissConfirmation,
  dismissPendingDraft,
  draftLines,
} from './drafts-section';

const card = account({ id: 'card', name: 'Приват', kind: 'spending', currency: 'UAH' });
const closed = account({
  id: 'closed',
  name: 'Закрита картка',
  kind: 'spending',
  currency: 'UAH',
  archived: true,
});

/** The owner's джерела as the screen loads them — «Без джерела» under its seeded name. */
const sourceNames = new Map([[UNSOURCED_SOURCE_ID, 'Без джерела']]);

const expenseDraft: Draft = {
  id: 'd-expense',
  accountId: 'card',
  currency: 'UAH',
  date: isoDate('2026-08-26'),
  text: 'Оплата 250.00UAH. Сільпо',
  proposal: { kind: 'expense', amount: money(25000, 'UAH') },
};

const incomeDraft: Draft = {
  id: 'd-income',
  accountId: 'card',
  currency: 'UAH',
  date: isoDate('2026-08-26'),
  text: 'Зарахування 500.00UAH',
  proposal: { kind: 'income', amount: money(50000, 'UAH') },
};

const rawDraft: Draft = {
  id: 'd-raw',
  accountId: 'card',
  currency: 'UAH',
  date: isoDate('2026-08-26'),
  text: 'FOREIGN 10.00 USD',
  proposal: { kind: 'raw', original: money(1000, 'USD') },
};

const groceries: Rule = {
  id: 'r-groceries',
  merchant: 'сільпо',
  categoryId: 'groceries',
  createdAt: new Date('2026-08-27T00:00:00.000Z'),
};

const storedAt = new Date('2026-08-27T09:00:00.000Z');

describe('the чернетки block on Головний', () => {
  const lines = (drafts: readonly Draft[], accounts = [card, closed]) =>
    draftLines({ drafts, accounts, sourceNames });

  it('Scenario: A drafted витрата shows its proposal', () => {
    const [line] = lines([expenseDraft]);

    expect(line).toEqual({
      id: 'd-expense',
      accountName: 'Приват',
      date: '2026-08-26',
      text: 'Оплата 250.00UAH. Сільпо',
      proposal: 'витрата',
      amount: '250,00 UAH',
      needsAmount: false,
      currency: 'UAH',
    });
  });

  it('A drafted дохід keeps «Без джерела» in what it proposes', () => {
    const [line] = lines([incomeDraft]);

    expect(line?.proposal).toBe('дохід · Без джерела');
    expect(line?.amount).toBe('500,00 UAH');
    expect(line?.needsAmount).toBe(false);
  });

  it('Scenario: A raw чернетка shows its text and the missing сума', () => {
    const [withReference] = lines([rawDraft]);
    const [bare] = lines([{ ...rawDraft, id: 'd-bare', proposal: { kind: 'raw' } }]);

    expect(withReference).toMatchObject({
      text: 'FOREIGN 10.00 USD',
      proposal: 'суму не прочитано',
      needsAmount: true,
      // The foreign сума the notification named is information, never a proposal.
      original: 'у сповіщенні 10,00 USD',
    });
    expect(withReference?.amount).toBeUndefined();
    // A raw чернетка with nothing foreign about it carries no reference at all.
    expect(bare?.original).toBeUndefined();
    expect(bare?.needsAmount).toBe(true);
  });

  it('Scenario: No pending чернетки, no surface', () => {
    // No rows and no placeholder: the block simply is not there.
    expect(lines([])).toEqual([]);
  });

  it('A чернетка on an archived рахунок still names it', () => {
    expect(lines([{ ...expenseDraft, accountId: 'closed' }])[0]?.accountName).toBe(
      'Закрита картка',
    );
  });
});

describe('answering a чернетка', () => {
  let storage: TestStorage;
  let repo: NotificationsRepo;
  let transactions: TransactionsRepo;
  let rules: Rule[];
  let ids: number;

  const ports = () => ({
    storage: repo,
    rules: () => rules,
    newId: () => `t-${(ids += 1)}`,
    now: () => storedAt,
  });

  /** Stores a чернетка the way the drain does, so what is answered is what storage holds. */
  const pending = (draft: Draft, fingerprint = draft.id): Draft => {
    repo.commitOutcome({ kind: 'drafted', draft, fingerprint }, new Date('2026-08-26T12:00:00.000Z'));
    return draft;
  };

  beforeEach(() => {
    ids = 0;
    rules = [];
    storage = openTestDb();
    seedReferences(storage.db, {
      categories: [UNCATEGORISED_CATEGORY_ID, 'groceries'],
      sources: [UNSOURCED_SOURCE_ID],
    });
    accountsRepo(storage.db).save(card);
    accountsRepo(storage.db).save(closed);
    repo = notificationsRepo(storage.db);
    transactions = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: The newest чернетка stands first', () => {
    repo.commitOutcome(
      { kind: 'drafted', draft: { ...expenseDraft, id: 'd-yesterday' }, fingerprint: 'f1' },
      new Date('2026-08-26T10:00:00.000Z'),
    );
    repo.commitOutcome(
      { kind: 'drafted', draft: { ...rawDraft, id: 'd-today' }, fingerprint: 'f2' },
      new Date('2026-08-27T10:00:00.000Z'),
    );

    expect(
      draftLines({ drafts: repo.pendingDrafts(), accounts: [card], sourceNames }).map((l) => l.id),
    ).toEqual(['d-today', 'd-yesterday']);
  });

  it('Scenario: An unmatched витрата confirms into «Без категорії»', () => {
    const answer = confirmPendingDraft(pending(expenseDraft), ports());

    expect(answer.kind).toBe('confirmed');
    expect(transactions.listAll()).toMatchObject([
      {
        type: 'expense',
        accountId: 'card',
        amount: money(25000, 'UAH'),
        categoryId: UNCATEGORISED_CATEGORY_ID,
        description: 'Оплата 250.00UAH. Сільпо',
        date: '2026-08-26',
      },
    ]);
    // Gone from the pending surface, and it stays gone — nothing reads a settled чернетка.
    expect(repo.pendingDrafts()).toEqual([]);
  });

  it('Scenario: A правило created after drafting is honoured', () => {
    const draft = pending(expenseDraft);
    // The чернетка was drafted with no правило matching it; the owner creates one and only then
    // confirms. The категорія is decided now, not at drafting.
    rules = [groceries];

    confirmPendingDraft(draft, ports());

    expect(transactions.listAll()[0]).toMatchObject({ categoryId: 'groceries' });
  });

  it('Scenario: A чернетка on an archived рахунок still confirms', () => {
    const draft = pending({ ...expenseDraft, accountId: 'closed' });

    const answer = confirmPendingDraft(draft, ports());

    expect(answer.kind).toBe('confirmed');
    // The money moved on the real account; archiving hides a рахунок from pickers, never from
    // its own history.
    expect(transactions.listAll()[0]).toMatchObject({ accountId: 'closed' });
  });

  it('Scenario: A confirmed дохід keeps «Без джерела»', () => {
    const answer = confirmPendingDraft(pending(incomeDraft), ports());

    expect(answer.kind).toBe('confirmed');
    expect(transactions.listAll()).toMatchObject([
      {
        type: 'income',
        amount: money(50000, 'UAH'),
        sourceId: UNSOURCED_SOURCE_ID,
        description: 'Зарахування 500.00UAH',
      },
    ]);
  });

  it('Scenario: A raw чернетка without a сума stays pending', () => {
    const draft = pending(rawDraft);

    for (const typed of [undefined, '', '   ', '0', '-5', 'абищо']) {
      const answer = confirmPendingDraft(draft, ports(), typed);
      expect(answer.kind === 'amount-required' || answer.kind === 'rejected').toBe(true);
    }

    expect(transactions.listAll()).toEqual([]);
    expect(repo.pendingDrafts().map((d) => d.id)).toEqual(['d-raw']);
  });

  it('Scenario: The supplied сума becomes the витрата', () => {
    const draft = pending({ ...rawDraft, id: 'd-plain', proposal: { kind: 'raw' } });

    const answer = confirmPendingDraft(draft, ports(), '300');

    expect(answer.kind).toBe('confirmed');
    expect(transactions.listAll()).toMatchObject([
      {
        type: 'expense',
        amount: money(30000, 'UAH'),
        description: 'FOREIGN 10.00 USD',
      },
    ]);
    expect(repo.pendingDrafts()).toEqual([]);
  });

  it('Scenario: A foreign reference rides the confirmed витрата', () => {
    const draft = pending(rawDraft);

    confirmPendingDraft(draft, ports(), '420');

    const [stored] = transactions.listAll();
    expect(stored).toMatchObject({ type: 'expense', amount: money(42000, 'UAH') });
    expect((stored as Expense).originalAmount).toEqual(money(1000, 'USD'));
  });

  it('Scenario: A dismissed чернетка is gone for good', () => {
    const draft = pending(expenseDraft);

    const answer = dismissPendingDraft(draft, ports());

    expect(answer).toEqual({ kind: 'dismissed' });
    // No транзакція, so no розрахунковий баланс and no monthly number moved.
    expect(transactions.listAll()).toEqual([]);
    expect(repo.pendingDrafts()).toEqual([]);
    expect(dismissConfirmation(draftLines({ drafts: [draft], accounts: [card], sourceNames })[0]!))
      .toContain('не створиться');
  });

  it('Scenario: The dismissed notification does not come back', () => {
    const notification: CapturedNotification = {
      packageName: 'ua.privatbank.ap24',
      postedAt: new Date(2026, 7, 26, 9, 30).getTime(),
      title: 'Оплата',
      text: 'Оплата 250.00UAH. Сільпо',
    };
    repo.addWatch({ packageName: 'ua.privatbank.ap24', accountId: 'card' });
    const draft = pending(expenseDraft, fingerprintOf(notification));
    dismissPendingDraft(draft, ports());

    // The capture layer hands the very same notification over again.
    const outcome = processCapture(notification, {
      watches: repo.watches(),
      seenFingerprints: repo.seenFingerprints(),
      rules,
      newId: () => 'never',
      dateOf: () => isoDate('2026-08-26'),
    });

    expect(outcome.kind).toBe('duplicate');
    expect(repo.pendingDrafts()).toEqual([]);
  });
});
