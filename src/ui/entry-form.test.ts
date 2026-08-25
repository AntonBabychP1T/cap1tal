import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import {
  monthOf,
  proposeFee,
  UNCATEGORISED_CATEGORY_ID,
  type Transaction,
  type Transfer,
} from '../domain/transaction';
import { buildEntry, type EntryDraft } from './entry-form';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
const dollars = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });
const accounts = [card, jar, dollars];

/** The date the screen fills in from the device clock; a draft overrides it like the owner does. */
const TODAY = '2026-08-24';

function draft(fields: Partial<EntryDraft> = {}): EntryDraft {
  return { type: 'expense', accountId: 'card', amount: '125.50', date: TODAY, ...fields };
}

/**
 * What the screen sees: either the transaction to store, or the refusal — never both. Recording
 * stores exactly what `buildEntry` returned, so "nothing is stored" is `stored` staying absent.
 */
function record(d: EntryDraft): { stored?: Transaction; refused?: string } {
  try {
    return { stored: buildEntry(d, { id: 'new', accounts }) };
  } catch (error) {
    return { refused: error instanceof Error ? error.message : String(error) };
  }
}

describe('витрата', () => {
  it('Scenario: Typed amount becomes exact minor units', () => {
    expect(record(draft({ amount: '125.50' })).stored).toEqual({
      type: 'expense',
      id: 'new',
      date: TODAY,
      accountId: 'card',
      amount: money(12550, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
    // The Ukrainian decimal separator records the same amount.
    expect(record(draft({ amount: '125,50' })).stored).toMatchObject({
      amount: money(12550, 'UAH'),
    });
  });

  it('Scenario: A whole amount needs no fractional part', () => {
    expect(record(draft({ amount: '200' })).stored).toMatchObject({
      type: 'expense',
      amount: money(20000, 'UAH'),
    });
  });

  it('Scenario: Too many fractional digits are rejected', () => {
    const { stored, refused } = record(draft({ amount: '12.345' }));
    expect(stored).toBeUndefined();
    expect(refused).toBeTruthy();
  });

  it('Scenario: A non-positive amount is rejected', () => {
    for (const amount of ['0', '-5']) {
      const { stored, refused } = record(draft({ amount }));
      expect(stored, `"${amount}" was accepted`).toBeUndefined();
      expect(refused).toBeTruthy();
    }
  });

  it('Scenario: A date other than today can be chosen when recording', () => {
    const { stored } = record(draft({ amount: '125.50', date: '2026-07-31' }));
    expect(stored).toMatchObject({ date: '2026-07-31', amount: money(12550, 'UAH') });
    expect(monthOf(stored!.date)).toBe('2026-07');
  });

  it('Scenario: A picked category is stored', () => {
    expect(record(draft({ amount: '80', categoryId: 'groceries' })).stored).toMatchObject({
      type: 'expense',
      amount: money(8000, 'UAH'),
      categoryId: 'groceries',
    });
  });

  it('A сума is entered in its account own currency', () => {
    // Nothing is converted: "5.00" from the USD account is 500 cents, not 5 UAH.
    expect(record(draft({ accountId: 'usd', amount: '5.00' })).stored).toMatchObject({
      accountId: 'usd',
      amount: money(500, 'USD'),
    });
  });

  it('Without a рахунок nothing is stored', () => {
    const { stored, refused } = record(draft({ accountId: undefined }));
    expect(stored).toBeUndefined();
    expect(refused).toBe('оберіть рахунок');
  });

  it('A date that is not a calendar date is rejected by the domain', () => {
    const { stored, refused } = record(draft({ date: '2026-02-30' }));
    expect(stored).toBeUndefined();
    expect(refused).toContain('2026-02-30');
  });
});

describe('дохід', () => {
  it('Scenario: An income is stored with its source', () => {
    expect(record(draft({ type: 'income', amount: '50000', sourceId: 'salary' })).stored).toEqual({
      type: 'income',
      id: 'new',
      date: TODAY,
      accountId: 'card',
      amount: money(5000000, 'UAH'),
      sourceId: 'salary',
    });
  });

  it('Scenario: An income without a source is not stored', () => {
    const { stored, refused } = record(draft({ type: 'income', amount: '50000' }));
    expect(stored).toBeUndefined();
    expect(refused).toBe('оберіть джерело');
  });

  it("A дохід's amount obeys the same rules as a витрата's", () => {
    const { stored, refused } = record(
      draft({ type: 'income', amount: '12.345', sourceId: 'salary' }),
    );
    expect(stored).toBeUndefined();
    expect(refused).toBeTruthy();
  });
});

describe('повернення', () => {
  it('Scenario: A refund is stored in its category', () => {
    // Entered positive, exactly like a витрата's: the повернення itself is the negative expense.
    expect(record(draft({ type: 'refund', amount: '800', categoryId: 'clothing' })).stored).toEqual(
      {
        type: 'refund',
        id: 'new',
        date: TODAY,
        accountId: 'card',
        amount: money(80000, 'UAH'),
        categoryId: 'clothing',
      },
    );
  });

  it('Scenario: A refund without a category is not stored', () => {
    const { stored, refused } = record(draft({ type: 'refund', amount: '800' }));
    expect(stored).toBeUndefined();
    expect(refused).toBe('оберіть категорію');
  });

  it('Scenario: A back-dated refund belongs to the month of its date', () => {
    const { stored } = record(
      draft({ type: 'refund', amount: '800', categoryId: 'clothing', date: '2026-07-31' }),
    );
    expect(stored).toMatchObject({
      type: 'refund',
      date: '2026-07-31',
      amount: money(80000, 'UAH'),
      categoryId: 'clothing',
    });
    expect(monthOf(stored!.date)).toBe('2026-07');
  });
});

describe('переказ', () => {
  it('Scenario: Same-currency transfer needs one amount', () => {
    // «скільки прийшло» untouched: the same сума lands on both legs, so `proposeFee` — the
    // screen's question, not this module's — finds no shortfall to ask about.
    expect(
      record(draft({ type: 'transfer', toAccountId: 'jar', amount: '1000', arrived: '' })).stored,
    ).toEqual({
      type: 'transfer',
      id: 'new',
      date: TODAY,
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(100000, 'UAH'),
      arrived: money(100000, 'UAH'),
    });
  });

  it('Scenario: Cross-currency transfer asks both legs', () => {
    const { stored } = record(
      draft({
        type: 'transfer',
        toAccountId: 'usd',
        amount: '4100',
        arrived: '100.00',
      }),
    );
    expect(stored).toMatchObject({
      left: money(410000, 'UAH'),
      arrived: money(10000, 'USD'),
    });

    // Each leg in its own currency means the arrived leg cannot be left to the сума that left.
    const blank = record(
      draft({ type: 'transfer', toAccountId: 'usd', amount: '4100', arrived: '' }),
    );
    expect(blank.stored).toBeUndefined();
    // Refused for the missing leg by name — not by `parseAmount` tripping over an empty string,
    // which is the same rejection wearing a message the owner cannot act on.
    expect(blank.refused).toContain('скільки прийшло');
  });

  it('Scenario: Same-currency transfer needs one amount — and proposes no комісія', () => {
    // The scenario's second clause: equal legs are what makes `proposeFee` find no shortfall.
    const { stored } = record(
      draft({ type: 'transfer', toAccountId: 'jar', amount: '1000', arrived: '' }),
    );
    expect(stored?.type).toBe('transfer');
    expect(proposeFee(stored as Transfer)).toBeNull();
  });

  it('A short arrival is returned as typed, for the screen to ask about', () => {
    expect(
      record(draft({ type: 'transfer', toAccountId: 'jar', amount: '1000', arrived: '995' }))
        .stored,
    ).toMatchObject({ left: money(100000, 'UAH'), arrived: money(99500, 'UAH') });
  });

  it('Scenario: The same account on both legs is rejected', () => {
    const { stored, refused } = record(
      draft({ type: 'transfer', toAccountId: 'card', amount: '1000' }),
    );
    expect(stored).toBeUndefined();
    expect(refused).toBe('a transfer connects two distinct accounts');
  });

  it('Without the рахунок the money arrived at nothing is stored', () => {
    const { stored, refused } = record(draft({ type: 'transfer', amount: '1000' }));
    expect(stored).toBeUndefined();
    expect(refused).toBe('оберіть рахунок, куди прийшли гроші');
  });
});

/**
 * Editing is this same function under the stored transaction's own id — that is the whole of what
 * `src/app/transaction/[id].tsx` does with a filled form. So the two "fixed from editing"
 * scenarios of the MODIFIED edit requirement are decided here, where `verify` can see them; the
 * screen's part is seeding the pickers from the stored transaction, which task 8.1 smokes.
 */
describe('editing a stored transaction', () => {
  const edit = (d: EntryDraft, id: string) => buildEntry(d, { id, accounts });

  it('Scenario: A wrongly picked category is fixed from editing', () => {
    const stored = edit(draft({ amount: '80', categoryId: 'groceries' }), 'e1');
    expect(stored).toMatchObject({ id: 'e1', categoryId: 'groceries' });

    const fixed = edit(draft({ amount: '80', categoryId: 'eating-out' }), 'e1');

    // The same transaction — same id, same amount, same рахунок, same date — now carrying the
    // category the owner picked instead.
    expect(fixed).toEqual({ ...stored, categoryId: 'eating-out' });
  });

  it('Scenario: A wrongly picked source is fixed from editing', () => {
    const income = draft({ type: 'income', amount: '50000', sourceId: 'salary' });
    const stored = edit(income, 'i1');
    expect(stored).toMatchObject({ id: 'i1', sourceId: 'salary' });

    const fixed = edit({ ...income, sourceId: 'freelance' }, 'i1');

    expect(fixed).toEqual({ ...stored, sourceId: 'freelance' });
  });

  it("A повернення's category is fixed the same way", () => {
    const stored = edit(draft({ type: 'refund', amount: '800', categoryId: 'clothing' }), 'r1');

    const fixed = edit(draft({ type: 'refund', amount: '800', categoryId: 'groceries' }), 'r1');

    expect(fixed).toEqual({ ...stored, categoryId: 'groceries' });
  });

  it('An edit that empties a required pick stores nothing', () => {
    // What an unanswered picker hands back; the transaction must stay as it was rather than lose
    // its джерело to an empty string the foreign key would then reject.
    expect(() => edit(draft({ type: 'income', amount: '50000', sourceId: '' }), 'i1')).toThrow(
      'оберіть джерело',
    );
    expect(() => edit(draft({ type: 'refund', amount: '800', categoryId: '' }), 'r1')).toThrow(
      'оберіть категорію',
    );
  });
});
