import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import type { Rule } from '../domain/rules';
import {
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type IsoDate,
} from '../domain/transaction';
import { fingerprintOf, type CapturedNotification } from './capture';
import {
  addWatch,
  confirmDraft,
  dismissDraft,
  processCapture,
  watchFor,
  type CaptureOutcome,
  type Draft,
  type ProcessContext,
  type Watch,
  type WatchableAccount,
} from './draft';

const PRIVAT = 'ua.privatbank.ap24';
const POSTED_AT = Date.UTC(2026, 7, 26, 9, 30, 0);

/** The one real date port lives in the app layer; the engine never touches `Date` (design D9). */
const dateOf = (): IsoDate => '2026-08-26';

/** Ids that say which call made them, so a failure message reads. */
function ids(): () => string {
  let n = 0;
  return () => `n${++n}`;
}

const capture = (over: Partial<CapturedNotification> = {}): CapturedNotification => ({
  packageName: PRIVAT,
  postedAt: POSTED_AT,
  title: 'Оплата',
  text: '250.00 грн. НОВИЙ ЗАКЛАД',
  ...over,
});

const privat: Watch = { packageName: PRIVAT, accountId: 'privat', currency: 'UAH' };

/** The owner's рахунки, as the screen change will hand them in: only id and currency are read. */
const ACCOUNTS: readonly WatchableAccount[] = [
  { id: 'privat', currency: 'UAH' },
  { id: 'euro', currency: 'EUR' },
];

const groceries: Rule = {
  id: 'r1',
  merchant: 'сільпо',
  categoryId: 'groceries',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const context = (over: Partial<ProcessContext> = {}): ProcessContext => ({
  watches: [privat],
  seenFingerprints: new Set<string>(),
  rules: [],
  newId: ids(),
  dateOf,
  ...over,
});

const drafted = (outcome: CaptureOutcome): Draft => {
  expect(outcome.kind).toBe('drafted');
  if (outcome.kind !== 'drafted') throw new Error('unreachable');
  return outcome.draft;
};

const confirmed = (draft: Draft, rules: readonly Rule[] = [], supplied?: number) => {
  const result = confirmDraft(draft, { rules, newId: ids() }, supplied);
  expect(result.kind).toBe('confirmed');
  if (result.kind !== 'confirmed') throw new Error('unreachable');
  // "…and the чернетка is settled": every confirmation names the чернетка it spent.
  expect(result.draftId).toBe(draft.id);
  return result.transaction;
};

describe('watches', () => {
  it('Scenario: A watched app maps to its рахунок', () => {
    const added = addWatch([], { packageName: PRIVAT, accountId: 'privat' }, ACCOUNTS);

    expect(added.kind).toBe('watched');
    if (added.kind !== 'watched') throw new Error('unreachable');
    expect(watchFor(added.watches, PRIVAT)).toEqual(privat);
    expect(drafted(processCapture(capture(), context({ watches: added.watches }))).accountId).toBe(
      'privat',
    );
  });

  it('Scenario: A second watch on the same package is rejected', () => {
    const result = addWatch([privat], { packageName: PRIVAT, accountId: 'euro' }, ACCOUNTS);

    expect(result).toEqual({ kind: 'already-watched', watch: privat });
    expect(watchFor([privat], PRIVAT)?.accountId).toBe('privat');
  });

  it('Scenario: A watch on a рахунок that does not exist is rejected', () => {
    const result = addWatch([], { packageName: PRIVAT, accountId: 'nowhere' }, ACCOUNTS);

    expect(result).toEqual({ kind: 'no-such-account' });
    // Nothing is watched, so the app's notifications are still read by nobody.
    expect(processCapture(capture(), context({ watches: [] }))).toEqual({ kind: 'ignored' });
  });

  it('Scenario: A watch takes its рахунок’s currency', () => {
    const uah = addWatch([], { packageName: PRIVAT, accountId: 'privat' }, ACCOUNTS);
    const eur = addWatch([], { packageName: 'ua.other.bank', accountId: 'euro' }, ACCOUNTS);

    expect(uah.kind === 'watched' && uah.watch.currency).toBe('UAH');
    expect(eur.kind === 'watched' && eur.watch.currency).toBe('EUR');
  });

  it('lets two packages map to the same рахунок', () => {
    const result = addWatch(
      [privat],
      { packageName: 'ua.privatbank.ap24.lite', accountId: 'privat' },
      ACCOUNTS,
    );

    expect(result.kind === 'watched' && result.watches).toEqual([
      privat,
      { packageName: 'ua.privatbank.ap24.lite', accountId: 'privat', currency: 'UAH' },
    ]);
  });
});

describe('processCapture — what is read at all', () => {
  it('Scenario: An unwatched app’s notification yields nothing', () => {
    const ctx = context({ watches: [] });

    expect(processCapture(capture(), ctx)).toEqual({ kind: 'ignored' });
    // Nothing to remember either: the outcome carries no fingerprint at all.
    expect(processCapture(capture(), ctx)).toEqual({ kind: 'ignored' });
  });

  it('Scenario: The same notification does not draft twice', () => {
    const notification = capture();
    const first = processCapture(notification, context());
    expect(first.kind).toBe('drafted');
    if (first.kind !== 'drafted') throw new Error('unreachable');

    const second = processCapture(
      notification,
      context({ seenFingerprints: new Set([first.fingerprint]) }),
    );

    expect(second).toEqual({ kind: 'duplicate' });
    expect(first.fingerprint).toBe(fingerprintOf(notification));
  });

  it('Scenario: A dismissed чернетка stays dismissed', () => {
    const notification = capture();
    const first = drafted(processCapture(notification, context()));
    expect(dismissDraft(first)).toEqual({ kind: 'dismissed', draftId: first.id });

    // The чернетка is gone; the fingerprint is not.
    expect(
      processCapture(notification, context({ seenFingerprints: new Set([fingerprintOf(notification)]) })),
    ).toEqual({ kind: 'duplicate' });
  });

  it('Scenario: A deleted транзакція stays deleted', () => {
    const notification = capture({ text: '250.00 грн. СІЛЬПО' });
    const auto = processCapture(notification, context({ rules: [groceries] }));
    expect(auto.kind).toBe('auto-confirmed');

    // Whatever became of the транзакція afterwards, the fingerprint keeps the notification out.
    expect(
      processCapture(notification, context({ rules: [groceries], seenFingerprints: new Set([fingerprintOf(notification)]) })),
    ).toEqual({ kind: 'duplicate' });
  });
});

describe('processCapture — what a notification proposes', () => {
  it('Scenario: Money out proposes a витрата', () => {
    const draft = drafted(processCapture(capture(), context()));

    expect(draft.accountId).toBe('privat');
    expect(draft.currency).toBe('UAH');
    expect(draft.date).toBe('2026-08-26');
    expect(draft.text).toBe('Оплата 250.00 грн. НОВИЙ ЗАКЛАД');
    expect(draft.proposal).toEqual({ kind: 'expense', amount: money(25000, 'UAH') });
  });

  it('Scenario: Money in proposes a дохід «Без джерела»', () => {
    const draft = drafted(
      processCapture(capture({ title: 'Поповнення', text: 'на 500.00 грн' }), context()),
    );

    expect(draft.proposal).toEqual({ kind: 'income', amount: money(50000, 'UAH') });
    expect(confirmed(draft)).toMatchObject({ type: 'income', sourceId: UNSOURCED_SOURCE_ID });
  });

  it('Scenario: An unparsed watched notification is kept raw', () => {
    const draft = drafted(
      processCapture(capture({ title: 'Банк', text: 'Ваш пароль підтверджено' }), context()),
    );

    expect(draft.proposal).toEqual({ kind: 'raw' });
    expect(draft.text).toBe('Банк Ваш пароль підтверджено');
    expect(draft.accountId).toBe('privat');
  });

  it('Scenario: A foreign-currency parse becomes a raw чернетка keeping the reference', () => {
    const draft = drafted(
      processCapture(capture({ title: 'Оплата', text: '10.00 USD, AMAZON' }), context()),
    );

    expect(draft.proposal).toEqual({ kind: 'raw', original: money(1000, 'USD') });
    expect(draft.currency).toBe('UAH');
  });

  it('Scenario: A чернетка moves no money', () => {
    const outcome = processCapture(capture(), context());

    expect(outcome.kind).toBe('drafted');
    expect(outcome).not.toHaveProperty('transaction');
  });
});

describe('processCapture — auto-confirmation за правилом', () => {
  it('Scenario: A recognised merchant confirms itself', () => {
    const outcome = processCapture(
      capture({ title: 'Оплата', text: '125.50 грн. СІЛЬПО' }),
      context({ rules: [groceries] }),
    );

    expect(outcome.kind).toBe('auto-confirmed');
    if (outcome.kind !== 'auto-confirmed') throw new Error('unreachable');
    expect(outcome.transaction).toMatchObject({
      type: 'expense',
      accountId: 'privat',
      date: '2026-08-26',
      amount: money(12550, 'UAH'),
      categoryId: 'groceries',
      description: 'Оплата 125.50 грн. СІЛЬПО',
    });
  });

  it('Scenario: An MCC-only правило does not auto-confirm', () => {
    const byMcc: Rule = {
      id: 'r2',
      mcc: 5411,
      categoryId: 'groceries',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    const outcome = processCapture(
      capture({ title: 'Оплата', text: '125.50 грн. СІЛЬПО' }),
      context({ rules: [byMcc] }),
    );

    expect(outcome.kind).toBe('drafted');
  });

  it('Scenario: Money in never auto-confirms', () => {
    const outcome = processCapture(
      capture({ title: 'Поповнення', text: '500.00 грн від СІЛЬПО' }),
      context({ rules: [groceries] }),
    );

    expect(outcome.kind).toBe('drafted');
    expect(drafted(outcome).proposal.kind).toBe('income');
  });

  it('Scenario: A raw чернетка never auto-confirms', () => {
    const outcome = processCapture(
      capture({ title: 'СІЛЬПО', text: 'дякуємо за покупку' }),
      context({ rules: [groceries] }),
    );

    expect(outcome.kind).toBe('drafted');
    expect(drafted(outcome).proposal.kind).toBe('raw');
  });
});

describe('confirmDraft', () => {
  it('Scenario: Confirming an unmatched витрата lands in «Без категорії»', () => {
    const draft = drafted(
      processCapture(capture({ title: 'Оплата', text: '250.00UAH. НОВИЙ ЗАКЛАД' }), context()),
    );

    const transaction = confirmed(draft, [groceries]);

    expect(transaction).toMatchObject({
      type: 'expense',
      amount: money(25000, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
      description: 'Оплата 250.00UAH. НОВИЙ ЗАКЛАД',
      date: '2026-08-26',
      accountId: 'privat',
    });
  });

  it('Scenario: A правило added after drafting is honoured at confirmation', () => {
    // Drafted while no правило existed, so nothing auto-confirmed.
    const outcome = processCapture(capture({ title: 'Оплата', text: '125.50 грн. СІЛЬПО' }), context());
    expect(outcome.kind).toBe('drafted');

    const transaction = confirmed(drafted(outcome), [groceries]);

    expect(transaction).toMatchObject({ type: 'expense', categoryId: 'groceries' });
  });

  it('Scenario: Confirming a дохід-чернетка keeps «Без джерела»', () => {
    const draft = drafted(
      processCapture(capture({ title: 'Зарахування', text: '500.00 грн' }), context()),
    );

    expect(confirmed(draft, [groceries])).toEqual({
      type: 'income',
      id: 'n1',
      date: '2026-08-26',
      accountId: 'privat',
      amount: money(50000, 'UAH'),
      sourceId: UNSOURCED_SOURCE_ID,
      description: 'Зарахування 500.00 грн',
    });
  });

  it('Scenario: A raw чернетка needs the owner’s сума', () => {
    const draft = drafted(
      processCapture(capture({ title: 'Банк', text: 'Операція виконана' }), context()),
    );

    expect(confirmDraft(draft, { rules: [], newId: ids() })).toEqual({
      kind: 'amount-required',
      draftId: draft.id,
    });
    // A сума that is not a positive whole number of minor units is no сума at all.
    expect(confirmDraft(draft, { rules: [], newId: ids() }, 0).kind).toBe('amount-required');
    expect(confirmDraft(draft, { rules: [], newId: ids() }, -100).kind).toBe('amount-required');
    expect(confirmDraft(draft, { rules: [], newId: ids() }, 12.5).kind).toBe('amount-required');
  });

  it('Scenario: A raw чернетка confirms with the owner’s сума', () => {
    const draft = drafted(
      processCapture(capture({ title: 'Банк', text: 'Операція виконана' }), context()),
    );

    const transaction = confirmed(draft, [], 30000);

    expect(transaction).toMatchObject({
      type: 'expense',
      amount: money(30000, 'UAH'),
      description: 'Банк Операція виконана',
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
    expect(transaction).not.toHaveProperty('originalAmount');
  });

  it('Scenario: A foreign reference rides the confirmed витрата as information', () => {
    const draft = drafted(
      processCapture(capture({ title: 'Оплата', text: '10.00 USD, AMAZON' }), context()),
    );

    const transaction = confirmed(draft, [], 42000);

    expect(transaction).toMatchObject({
      type: 'expense',
      amount: money(42000, 'UAH'),
      originalAmount: money(1000, 'USD'),
    });
  });

  it('refuses a чернетка proposing money in a currency its рахунок does not hold', () => {
    // Unreachable through `processCapture`; reachable through storage, and silence would relabel.
    const draft = drafted(processCapture(capture(), context()));
    const mislabelled: Draft = {
      ...draft,
      proposal: { kind: 'expense', amount: money(25000, 'USD') },
    };

    expect(() => confirmDraft(mislabelled, { rules: [], newId: ids() })).toThrow(/cannot propose/u);
  });

  it('ignores a supplied сума for a чернетка the bank already put one on', () => {
    const draft = drafted(processCapture(capture(), context()));

    expect(confirmed(draft, [], 999)).toMatchObject({ amount: money(25000, 'UAH') });
  });
});

describe('dismissDraft and the defaults-only invariant', () => {
  it('Scenario: Dismissal creates nothing', () => {
    const draft = drafted(processCapture(capture(), context()));

    const result = dismissDraft(draft);

    expect(result).toEqual({ kind: 'dismissed', draftId: draft.id });
    expect(result).not.toHaveProperty('transaction');
  });

  it('Scenario: An ATM withdrawal is a витрата until retyped', () => {
    const draft = drafted(
      processCapture(capture({ title: 'Зняття готівки', text: '1000.00 грн' }), context()),
    );

    expect(confirmed(draft)).toMatchObject({
      type: 'expense',
      amount: money(100000, 'UAH'),
      accountId: 'privat',
    });
  });

  it('Scenario: A «повернення» notification is money in, never a повернення verdict', () => {
    const draft = drafted(
      processCapture(capture({ title: 'Повернення', text: '250.00 грн від НОВИЙ ЗАКЛАД' }), context()),
    );

    expect(draft.proposal).toEqual({ kind: 'income', amount: money(25000, 'UAH') });
    expect(confirmed(draft)).toMatchObject({ type: 'income', sourceId: UNSOURCED_SOURCE_ID });
  });

  it('yields no транзакція type but витрата and дохід «Без джерела», whatever the text says', () => {
    const texts = [
      'Переказ на картку 500.00 грн',
      'Інвестиція 1000.00 грн',
      'Коригування 10.00 грн',
      'Комісія 5.00 грн',
      'Відсотки нараховано 12.00 грн',
      'Поповнення банки 300.00 грн',
    ];

    for (const text of texts) {
      const outcome = processCapture(capture({ title: 'Банк', text }), context());
      const transaction = confirmed(drafted(outcome), [], 100);
      expect(['expense', 'income']).toContain(transaction.type);
      if (transaction.type === 'income') expect(transaction.sourceId).toBe(UNSOURCED_SOURCE_ID);
    }
  });
});

describe('determinism', () => {
  it('Scenario: Processing is offline and deterministic', () => {
    const notification = capture({ title: 'Оплата', text: '125.50 грн. СІЛЬПО' });
    const inputs = () =>
      context({ rules: [groceries], watches: [privat], seenFingerprints: new Set<string>() });

    expect(processCapture(notification, inputs())).toEqual(processCapture(notification, inputs()));

    const raw = capture({ title: 'Банк', text: 'Операція виконана' });
    expect(processCapture(raw, inputs())).toEqual(processCapture(raw, inputs()));

    const draft = drafted(processCapture(raw, inputs()));
    expect(confirmDraft(draft, { rules: [groceries], newId: ids() }, 30000)).toEqual(
      confirmDraft(draft, { rules: [groceries], newId: ids() }, 30000),
    );
  });
});
