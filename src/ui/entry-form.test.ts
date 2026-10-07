import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { NO_MERCHANTS, merchant, merchantIndex } from '../domain/merchants';

import { account, computeBalance } from '../domain/account';
import { money } from '../domain/money';
import {
  monthOf,
  proposeFee,
  transfer,
  INTEREST_SOURCE_ID,
  UNCATEGORISED_CATEGORY_ID,
  type Correction,
  type Transaction,
  type Transfer,
} from '../domain/transaction';
import { templateRules, type Rule } from '../domain/rules';
import {
  entryFromRoute,
  buildEntry,
  defaultAccountId,
  draftAfterStore,
  entryDateCheck,
  entrySingularId,
  entryHoldsEdits,
  normaliseDescription,
  proposeForTransfer,
  proposedCategoryId,
  recordedConfirmation,
  tapAfterStore,
  type EntryDraft,
} from './entry-form';
import { initialForm } from './retype';
import { accountsById } from './transaction-line';

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

  it('Scenario: A переказ onto the same рахунок is refused in Ukrainian', () => {
    const { stored, refused } = record(
      draft({ type: 'transfer', toAccountId: 'card', amount: '1000' }),
    );
    expect(stored).toBeUndefined();
    // The domain refuses this too, in the English of an invariant; the form names it first,
    // because this sentence is put into an Alert the owner reads.
    expect(refused).toBe('переказ зʼєднує два різні рахунки — оберіть інший рахунок');
    expect(refused).not.toMatch(/[A-Za-z]/);
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

/**
 * FR-T9. A рахунок-борг's розрахунковий баланс is what that person still owes, so a переказ back
 * that exceeds it is a repayment plus interest — the one place «Відсотки» comes from by hand.
 */
describe('proposeForTransfer — a repayment above the principal', () => {
  const yaroslav = account({ id: 'debt-y', name: 'Ярослав', kind: 'debt', currency: 'UAH' });
  const olya = account({ id: 'debt-o', name: 'Оля', kind: 'debt', currency: 'UAH' });
  const debtAccounts = [card, jar, dollars, yaroslav, olya];

  /** What put 100000 minor units onto Ярослав's рахунок-борг: the owner lent it. */
  const lent: Transfer = transfer({
    id: 'lend',
    date: '2026-07-01',
    fromAccountId: 'card',
    toAccountId: 'debt-y',
    left: money(100000, 'UAH'),
    arrived: money(100000, 'UAH'),
  });

  const repayment = (input: {
    id?: string;
    left: number;
    arrived?: number;
    to?: string;
    from?: string;
  }): Transfer =>
    transfer({
      id: input.id ?? 'repay',
      date: '2026-08-24',
      fromAccountId: input.from ?? 'debt-y',
      toAccountId: input.to ?? 'card',
      left: money(input.left, 'UAH'),
      arrived: money(input.arrived ?? input.left, 'UAH'),
    });

  const propose = (candidate: Transfer, stored: readonly Transaction[] = [lent]) =>
    proposeForTransfer(candidate, { accounts: debtAccounts, sourceTransactions: stored });

  it('Scenario: Repaying more than owed proposes the interest', () => {
    const proposal = propose(repayment({ left: 110000 }));

    expect(proposal?.kind).toBe('interest');
    expect(proposal!.kind === 'interest' && proposal!.income).toEqual({
      type: 'income',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(10000, 'UAH'),
      sourceId: INTEREST_SOURCE_ID,
    });
  });

  it('Scenario: Accepting leaves the debt at nothing and the excess as income', () => {
    const proposal = propose(repayment({ left: 110000 }))!;

    // What the screen stores on «Так»: the переказ carries only the principal on both legs…
    expect(proposal.transfer.left).toEqual(money(100000, 'UAH'));
    expect(proposal.transfer.arrived).toEqual(money(100000, 'UAH'));
    // …so the person owes exactly nothing afterwards…
    expect(computeBalance(yaroslav, [lent, proposal.transfer])).toEqual(money(0, 'UAH'));
    // …and the excess is a дохід, never a повернення and never a коригування.
    const income = proposal.kind === 'interest' ? proposal.income : undefined;
    expect(income?.type).toBe('income');
    expect(income?.amount).toEqual(money(10000, 'UAH'));
    expect(computeBalance(card, [lent, proposal.transfer, { ...income!, id: 'int' }])).toEqual(
      money(10000, 'UAH'),
    );
  });

  it('Scenario: Declining stores the repayment as entered', () => {
    const typed = repayment({ left: 110000 });

    // Declining is the screen storing the candidate untouched — the рахунок-борг goes below zero.
    expect(computeBalance(yaroslav, [lent, typed])).toEqual(money(-10000, 'UAH'));
  });

  it('Scenario: Repaying exactly the principal proposes nothing', () => {
    expect(propose(repayment({ left: 100000 }))).toBeNull();
  });

  it('Scenario: A переказ into a рахунок-борг proposes nothing', () => {
    const lending = transfer({
      id: 'lend-2',
      date: '2026-08-24',
      fromAccountId: 'card',
      toAccountId: 'debt-y',
      left: money(500000, 'UAH'),
      arrived: money(500000, 'UAH'),
    });

    expect(proposeForTransfer(lending, { accounts: debtAccounts, sourceTransactions: [] })).toBeNull();
  });

  it('Scenario: A repayment onto another рахунок-борг proposes nothing', () => {
    expect(propose(repayment({ left: 110000, to: 'debt-o' }))).toBeNull();
  });

  it('Scenario: A cross-currency repayment proposes nothing', () => {
    const crossCurrency = transfer({
      id: 'repay',
      date: '2026-08-24',
      fromAccountId: 'debt-y',
      toAccountId: 'usd',
      left: money(110000, 'UAH'),
      arrived: money(2600, 'USD'),
    });

    expect(propose(crossCurrency)).toBeNull();
  });

  it('Scenario: A repayment arriving short proposes no комісія', () => {
    // Both proposals would otherwise fire on this one: 110000 out of a рахунок-борг owed 100000,
    // arriving 109500. A person is not a bank, and the legs are unequal, so neither does.
    expect(propose(repayment({ left: 110000, arrived: 109500 }))).toBeNull();
  });

  it('A short arrival out of an ordinary рахунок still proposes the комісія', () => {
    const short = transfer({
      id: 'move',
      date: '2026-08-24',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(100000, 'UAH'),
      arrived: money(99500, 'UAH'),
    });

    const proposal = proposeForTransfer(short, { accounts: debtAccounts, sourceTransactions: [] });

    expect(proposal?.kind).toBe('fee');
    expect(proposal!.kind === 'fee' && proposal!.expense.amount).toEqual(money(500, 'UAH'));
  });

  it('Scenario: Editing a repayment up proposes the interest', () => {
    // The stored repayment of the whole principal, now edited to 110000 on both legs. The balance
    // it is compared against is the one before it — its own effect is excluded.
    const stored = repayment({ left: 100000 });
    const edited = repayment({ left: 110000 });

    const proposal = propose(edited, [lent, stored]);

    expect(proposal?.kind).toBe('interest');
    expect(proposal!.kind === 'interest' && proposal!.income.amount).toEqual(money(10000, 'UAH'));
  });

  it('Scenario: Reopening an unchanged repayment proposes nothing', () => {
    const stored = repayment({ left: 100000 });

    expect(propose(stored, [lent, stored])).toBeNull();
  });

  it('A рахунок-борг already at nothing proposes nothing, whatever comes off it', () => {
    // Nothing was lent, so there is no principal to exceed — the owner means something else, and
    // the app does not guess what.
    expect(propose(repayment({ left: 110000 }), [])).toBeNull();
  });
});

describe('the дата a form was filled with', () => {
  it('Scenario: A дата in the wrong shape is refused in Ukrainian', () => {
    // Every вид goes through the same parser, so none of the four can show the domain's English.
    for (const type of ['expense', 'income', 'refund', 'transfer'] as const) {
      const { stored, refused } = record(
        draft({
          type,
          date: '31 грудня',
          amount: '100',
          ...(type === 'income' ? { sourceId: 'salary' } : {}),
          ...(type === 'refund' ? { categoryId: 'groceries' } : {}),
          ...(type === 'transfer' ? { toAccountId: 'jar' } : {}),
        }),
      );
      expect(stored, `a ${type} with a mistyped дата was stored`).toBeUndefined();
      expect(refused, `a ${type}'s дата was refused in English`).toBe(
        'дата пишеться як ДД.ММ.РРРР або РРРР-ММ-ДД, напр. 31.08.2026, а не «31 грудня»',
      );
    }
  });

  it('A дата typed day first with dots is stored as that calendar day', () => {
    const { stored, refused } = record(draft({ type: 'expense', date: '5.8.2026', amount: '100' }));
    expect(refused).toBeUndefined();
    expect(stored?.date).toBe('2026-08-05');
  });

  it('Scenario: A day that does not exist is refused in Ukrainian', () => {
    const { stored, refused } = record(draft({ date: '2026-02-31', amount: '100' }));
    expect(stored).toBeUndefined();
    expect(refused).toBe('такого дня немає в календарі: «2026-02-31»');
  });
});

describe('normaliseDescription', () => {
  it('Scenario: An empty опис stores none', () => {
    expect(normaliseDescription('')).toBeUndefined();
    expect(normaliseDescription('   ')).toBeUndefined();
    expect(normaliseDescription(undefined)).toBeUndefined();
  });

  it('What the owner typed is stored trimmed', () => {
    expect(normaliseDescription('  шини на зиму ')).toBe('шини на зиму');
  });
});

describe('the опис the owner writes', () => {
  const base = { amount: '1200', date: '2026-09-01' } as const;

  it('Scenario: A typed опис is stored', () => {
    const draft: EntryDraft = {
      ...base,
      type: 'expense',
      accountId: 'card',
      description: normaliseDescription('шини на зиму'),
    };

    const built = buildEntry(draft, { id: 'e1', accounts });

    expect(built).toMatchObject({
      type: 'expense',
      amount: money(120000, 'UAH'),
      description: 'шини на зиму',
    });
  });

  it('Scenario: The owner"s own опис is an опис like any other', () => {
    const built = buildEntry(
      { ...base, type: 'expense', accountId: 'card', description: 'шини на зиму' },
      { id: 'e1', accounts },
    );

    expect(built.type).toBe('expense');
    if (built.type !== 'expense') return;
    // The сума is untouched by it, and the опис took no part in choosing the категорія.
    expect(built.amount).toEqual(money(120000, 'UAH'));
    expect(built.categoryId).toBe(UNCATEGORISED_CATEGORY_ID);
  });

  it('Scenario: An empty опис stores none — through the form', () => {
    const built = buildEntry(
      {
        ...base,
        type: 'expense',
        accountId: 'card',
        description: normaliseDescription('  '),
      },
      { id: 'e1', accounts },
    );

    expect(built).not.toHaveProperty('description');
  });

  it('Scenario: A переказ can be explained too', () => {
    const built = buildEntry(
      {
        ...base,
        type: 'transfer',
        accountId: 'card',
        toAccountId: 'jar',
        description: 'на ремонт',
      },
      { id: 't1', accounts },
    );

    expect(built.type).toBe('transfer');
    if (built.type !== 'transfer') return;
    expect(built.description).toBe('на ремонт');
    // Both legs are exactly what was typed; nothing about the опис touched them.
    expect(built.left).toEqual(money(120000, 'UAH'));
    expect(built.arrived).toEqual(money(120000, 'UAH'));
  });

  it('A дохід and a повернення carry one too', () => {
    const income = buildEntry(
      { ...base, type: 'income', accountId: 'card', sourceId: 'salary', description: 'аванс' },
      { id: 'i1', accounts },
    );
    const refunded = buildEntry(
      {
        ...base,
        type: 'refund',
        accountId: 'card',
        categoryId: 'groceries',
        description: 'повернули за каву',
      },
      { id: 'r1', accounts },
    );

    expect(income).toMatchObject({ type: 'income', description: 'аванс' });
    expect(refunded).toMatchObject({ type: 'refund', description: 'повернули за каву' });
  });

  it('Scenario: A cleared опис changes no number', () => {
    const carrying = buildEntry(
      { ...base, type: 'expense', accountId: 'card', description: 'шини на зиму' },
      { id: 'e1', accounts },
    );
    const cleared = buildEntry(
      { ...base, type: 'expense', accountId: 'card', description: normaliseDescription('') },
      { id: 'e1', accounts },
    );

    expect(cleared).not.toHaveProperty('description');
    expect(cleared.type).toBe('expense');
    if (cleared.type !== 'expense' || carrying.type !== 'expense') return;
    expect(cleared.amount).toEqual(carrying.amount);
    expect(cleared.categoryId).toBe(carrying.categoryId);
    expect(cleared.accountId).toBe(carrying.accountId);
    expect(cleared.date).toBe(carrying.date);
  });

  it('Scenario: Changing another field leaves the опис alone', () => {
    const stored = buildEntry(
      { ...base, type: 'expense', accountId: 'card', description: 'СІЛЬПО Київ' },
      { id: 'e1', accounts },
    );
    const changed = buildEntry(
      { ...base, amount: '130', type: 'expense', accountId: 'card', description: 'СІЛЬПО Київ' },
      { id: 'e1', accounts },
    );

    expect(changed).toMatchObject({ amount: money(13000, 'UAH'), description: 'СІЛЬПО Київ' });
    expect(stored.id).toBe(changed.id);
  });

  it('Scenario: Editing another field leaves the опис alone', () => {
    // The editing screen hands the опис it holds back untouched; changing the сума alone keeps the
    // imported text exactly, and the MCC beside it.
    const imported = 'Оплата послуг АТБ-Маркет 1234 Київ';
    const changed = buildEntry(
      { ...base, amount: '130', type: 'expense', accountId: 'card', description: imported, mcc: 5411 },
      { id: 'e1', accounts },
    );
    expect(changed).toMatchObject({ amount: money(13000, 'UAH'), description: imported, mcc: 5411 });
  });
});

describe('the опис corrected from editing', () => {
  const base = { amount: '1200', date: '2026-09-01' } as const;
  /** Editing is `buildEntry` under the original's id — the same function recording uses. */
  const edit = (draft: Omit<EntryDraft, 'type'> & { type: EntryDraft['type'] }) =>
    buildEntry(draft, { id: 'e1', accounts });

  it('Scenario: A wrong опис is corrected from editing', () => {
    const corrected = edit({
      ...base,
      type: 'expense',
      accountId: 'card',
      categoryId: 'groceries',
      description: normaliseDescription('шини на літо'),
    });

    expect(corrected).toMatchObject({
      id: 'e1',
      type: 'expense',
      description: 'шини на літо',
      amount: money(120000, 'UAH'),
      accountId: 'card',
      categoryId: 'groceries',
      date: '2026-09-01',
    });
  });

  it('Scenario: An опис can be cleared', () => {
    const cleared = edit({
      ...base,
      type: 'expense',
      accountId: 'card',
      categoryId: 'groceries',
      description: normaliseDescription(''),
    });

    // No опис at all — not an empty one — so the feed has no description row to show.
    expect(cleared).not.toHaveProperty('description');
  });

  it('Scenario: A manual transaction stays compact', () => {
    const manual = edit({ ...base, type: 'expense', accountId: 'card' });

    // Nothing is stored for the опис, so neither the feed nor the editor has one to show.
    expect(manual).not.toHaveProperty('description');
    expect(normaliseDescription(undefined)).toBeUndefined();
  });

  it('A retype keeps whatever the опис says', () => {
    const retyped = edit({
      ...base,
      type: 'transfer',
      accountId: 'card',
      toAccountId: 'jar',
      description: 'Переказ на банку',
    });

    expect(retyped).toMatchObject({ type: 'transfer', description: 'Переказ на банку' });
  });
});

describe('defaultAccountId', () => {
  const offered = [card, jar];

  it('Scenario: The next витрата opens on the same рахунок', () => {
    expect(defaultAccountId('card', offered)).toBe('card');
  });

  it('Scenario: An archived рахунок is not offered as the default', () => {
    // `offered` is the list the pickers show, and an archived рахунок is already out of it.
    expect(defaultAccountId('card', [jar])).toBeUndefined();
    // Recording without picking one is refused exactly as it is on a device that never recorded.
    expect(() =>
      buildEntry({ type: 'expense', amount: '1200', date: '2026-09-01' }, { id: 'e1', accounts }),
    ).toThrow('оберіть рахунок');
  });

  it('A device that has never recorded by hand pre-chooses nothing', () => {
    expect(defaultAccountId(undefined, offered)).toBeUndefined();
  });

  it('A рахунок that no longer exists pre-chooses nothing', () => {
    expect(defaultAccountId('gone', offered)).toBeUndefined();
  });

  it('The рахунок the route names wins over the remembered one', () => {
    expect(defaultAccountId('card', offered, 'jar')).toBe('jar');
    expect(defaultAccountId(undefined, offered, 'jar')).toBe('jar');
  });

  it('A named рахунок that is not offered falls back to the remembered one', () => {
    expect(defaultAccountId('card', [card], 'jar')).toBe('card');
    expect(defaultAccountId('card', offered, 'gone')).toBe('card');
  });
});

/**
 * Whether «Нова транзакція» actually follows the опис — `proposedCategoryId` itself is proven
 * above, but the screen's own wiring (what it feeds the function, what it shows, what it stores)
 * is JSX `verify` never runs, so the assertions here are structural (rules-everywhere design D4).
 */
describe('the entry screen follows the опис', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const entryScreen = source('../app/transaction/new.tsx');

  it('Scenario: Typing a known merchant chooses its категорія / Clearing the опис gives it back', () => {
    // Recomputed from the current description on every render — not a snapshot taken once — so
    // typing and clearing both move it, and `stored.categorisation` is re-read with the rest of
    // the form.
    expect(entryScreen).toMatch(
      /proposedCategoryId\(\s*\{ type: entry, description: normaliseDescription\(description\), categoryId, pickedByOwner \},\s*stored\.categorisation,\s*\)/,
    );
    // What the picker shows for a витрата is exactly that computation — falling back to «Без
    // категорії», never to the raw `categoryId` the owner has not touched.
    expect(entryScreen).toContain(
      "entry === 'expense'\n                  ? (displayedCategoryId ?? UNCATEGORISED_CATEGORY_ID)",
    );
  });

  it('Scenario: The шаблон reaches the entry form — the form reads both tiers, not the правила alone', () => {
    expect(entryScreen).toContain('categorisation: categorisationContext(),');
    expect(entryScreen).not.toMatch(/rulesRepo\.list\(\)/);
  });

  it('Scenario: A picked категорія stops following the опис / one tap from being changed', () => {
    const chooseCategory = entryScreen.slice(entryScreen.indexOf('const chooseCategory = useCallback'));
    const body = chooseCategory.slice(0, chooseCategory.indexOf('const store = useCallback'));
    expect(body).toContain('setPickedByOwner(true)');
    expect(body).toContain('setCategoryId(picked)');
    // The category picker for a витрата is this same handler — one tap replaces the proposal.
    expect(entryScreen).toContain("onSelect={entry === 'expense' ? chooseCategory : setCategoryId}");
  });

  it('Recording stores exactly the категорія shown, and pickedByOwner resets per recording', () => {
    expect(entryScreen).toContain('categoryId: displayedCategoryId,');
    // Switching type drops the flag. A store leaves the screen (below), so the next витрата opens
    // a fresh form that follows its own опис from nothing.
    const chooseEntry = entryScreen.slice(
      entryScreen.indexOf('const chooseEntry = useCallback'),
      entryScreen.indexOf('const displayedCategoryId'),
    );
    expect(chooseEntry).toContain('setPickedByOwner(false)');
  });
});

/**
 * The memory itself is one line of wiring on Головний, which `verify` never runs. What can be
 * proven here is the part that would be easy to break: that exactly one place in the app writes
 * it, so an import, a sync and a confirmed чернетка leave it alone.
 */
describe('who may remember a рахунок', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const entryScreen = source('../app/transaction/new.tsx');

  it('Scenario: An import does not move the memory', () => {
    // Every screen in the app, walked rather than listed — a list goes stale the next time a
    // screen is added, and this assertion is only worth having if it asks all of them. Only the
    // hand-entry screen may name `remember`, so nothing that stores транзакції on the owner's
    // behalf can move it.
    const dir = fileURLToPath(new URL('../app/', import.meta.url));
    const screens = readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith('.tsx'))
      .sort();
    const callers = screens.filter((name) =>
      /entryDefaultsRepo\.remember\(/.test(readFileSync(join(dir, name), 'utf8')),
    );

    // The walk found the app and not an empty directory.
    expect(screens).toContain(join('(tabs)', 'index.tsx'));
    expect(screens.length).toBeGreaterThan(15);
    expect(callers).toEqual([join('transaction', 'new.tsx')]);
  });

  it('The form opens on what was remembered, resolved against what is offered', () => {
    expect(entryScreen).toMatch(/defaultAccountId\(\s*stored\.rememberedAccountId/);
    expect(entryScreen).toContain('entryDefaultsRepo.remembered()');
  });

  it('The «+» on a рахунок opens the form on that рахунок', () => {
    expect(entryScreen).toContain('asked.account,');
    const accountScreen = source('../app/account/[id].tsx');
    expect(accountScreen).toContain("params: { account: a.id }");
  });
});

/**
 * Where Головний starts when the tab is opened again. It is wiring `verify` never runs — the
 * assertion is structural, like the one above: the ref is lent by `Screen`, held here, and moved
 * on focus and on nothing else.
 */
describe('Головний shows itself from its top', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const main = source('../app/(tabs)/index.tsx');

  it("Scenario: Coming back lands on the month's status", () => {
    // The column is scrolled by the screen that owns it, from a navigation focus. The ref is
    // still Головний's own — the «+» rides the same `Screen` in its overlay slot, outside the
    // column, which is why it does not scroll away with it.
    expect(main).toMatch(/<Screen\s+scrollRef=\{scrollRef\}/);
    expect(main).toContain('overlay={<Fab');
    expect(main).toContain('useFocusEffect');
    expect(main).toMatch(/scrollRef\.current\?\.scrollTo\(\{ y: 0, animated: false \}\)/);
  });

  it('Scenario: Scrolling within Головний is untouched', () => {
    // Nothing binds the reset to scrolling itself, and the feed is read exactly as before.
    expect(main).not.toContain('onScroll');
    expect(main).not.toContain('scrollEnabled');
    expect(main).toContain('feed: latest.slice(0, FEED_SIZE)');
  });

  it('Only Головний asks to be scrolled back', () => {
    // `Screen` lends the ref; teaching every tab to reset would be a policy nobody asked for.
    const askers = [
      '../app/(tabs)/index.tsx',
      '../app/(tabs)/accounts.tsx',
      '../app/(tabs)/month.tsx',
      '../app/(tabs)/settings.tsx',
      '../app/(tabs)/reports.tsx',
    ].filter((path) => /scrollRef=/.test(source(path)));

    expect(askers).toEqual(['../app/(tabs)/index.tsx']);
  });
});

/**
 * What a store does to the entry screen. Wiring `verify` never runs, so the assertion is
 * structural like the ones above.
 *
 * It used to clear the form and stay, with a confirmation above «Записати», so the next
 * транзакція of the day cost no navigation. The owner reported that as a bug (2026-09-23): after
 * «Записати» they expect Головний back, whose стрічка then opens on what was just recorded.
 */
describe('the entry screen after a store', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const entryScreen = source('../app/transaction/new.tsx');

  const storeBody = () => {
    const store = entryScreen.slice(entryScreen.indexOf('const store = useCallback'));
    return store.slice(0, store.indexOf('const record = useCallback'));
  };
  const recordBody = () => {
    const record = entryScreen.slice(entryScreen.indexOf('const record = useCallback'));
    return record.slice(0, record.indexOf('const insets = useSafeAreaInsets()'));
  };

  it('Scenario: «Записати» returns with what was recorded', () => {
    const body = storeBody();
    const saved = body.indexOf('transactionsRepo.save(t, now)');
    const remembered = body.indexOf('entryDefaultsRepo.remember(fromId)');
    const back = body.indexOf("if (then === 'leave') {\n        router.back();");
    expect(saved).toBeGreaterThan(-1);
    expect(remembered).toBeGreaterThan(saved);
    expect(back).toBeGreaterThan(remembered);
    // `router.back()` is the 'leave' branch only — the stay-open store never leaves.
    expect(body.match(/router\.back\(\)/g)).toHaveLength(1);
    expect(entryScreen).toContain("onPress={() => record('leave')}");
  });

  it('Scenario: The owner sees what was recorded', () => {
    const body = storeBody();
    const stay = body.slice(body.indexOf("if (then === 'leave')"));
    expect(stay).toContain('const next = draftAfterStore(fields)');
    expect(stay).toContain('setConfirmation({ text: recordedConfirmation(written, names)');
    expect(stay).toContain('setOpened(next)');
    expect(stay).toContain('setPickedByOwner(false)');
    expect(stay).toContain('amountRef.current?.focus()');
    expect(stay).toContain('reload()');
    expect(entryScreen).toContain("onPress={() => record('stay')}");
  });

  it('Scenario: A refusal is not a confirmation — the catch sets none', () => {
    const record = recordBody();
    const refuse = record.slice(record.indexOf('const refuse = '), record.indexOf('const attempt = '));
    expect(refuse).toContain('release();');
    expect(refuse).toContain('Alert.alert(');
    expect(refuse).not.toContain('setConfirmation');
    expect(refuse).not.toContain('router.');
    // Every catch — the attempt's and the переказ question's — refuses through it.
    expect(record.match(/\} catch \(error\) \{\s*refuse\(error\);/g)).toHaveLength(2);
  });

  it('Scenario: An accepted комісія is part of the confirmation — both proposals store as the tapped action', () => {
    expect(recordBody()).toMatch(/\(\.\.\.written\) => \{\s*try \{\s*store\(then, \.\.\.written\);/);
    expect(recordBody()).toContain('store(then, built);');
  });

  it('Scenario: A repeated tap stores nothing', () => {
    const record = recordBody();
    const checked = record.indexOf('if (storing.current) {');
    const tapped = record.indexOf('tapAfterStore(fields, confirmation,');
    const set = record.indexOf('storing.current = true;');
    const built = record.indexOf('buildEntry(');
    const asked = record.indexOf('Alert.alert(');
    expect(checked).toBeGreaterThan(-1);
    expect(tapped).toBeGreaterThan(checked);
    expect(set).toBeGreaterThan(tapped);
    expect(built).toBeGreaterThan(set);
    expect(asked).toBeGreaterThan(set);
    // `store` never sets the guard; the refusal and «Скасувати» release it; a stay-open store
    // releases it only once the cleared form is committed.
    expect(storeBody()).not.toContain('storing.current');
    expect(record).toContain("{ text: 'Скасувати', style: 'cancel', onPress: release }");
    expect(record.slice(record.indexOf('const refuse = '))).toContain('release();');
    expect(entryScreen).toMatch(
      /useEffect\(\(\) => \{\s*storing\.current = false;\s*\}, \[confirmation\]\);/,
    );
  });

  it('Scenario: The «+» opens on the сума with digits ready', () => {
    const amount = entryScreen.slice(
      entryScreen.indexOf("label={entry === 'transfer' ? 'Скільки пішло' : 'Сума'}"),
    );
    const props = amount.slice(0, amount.indexOf('/>'));
    expect(props).toContain('autoFocus');
    expect(props).toContain('keyboardType="decimal-pad"');
    expect(entryScreen).toContain('ref={amountRef}');
  });

  it('Scenario: Typing first and choosing after records the typed сума', () => {
    // The сума typed before the категорія is picked is the сума stored with it.
    const stored = buildEntry(
      { type: 'expense', accountId: 'card', amount: '125,50', date: TODAY, categoryId: 'coffee' },
      { id: 'e1', accounts },
    );
    expect(stored.type === 'expense' && stored.amount).toEqual(money(12550, 'UAH'));
    expect(stored.type === 'expense' && stored.categoryId).toBe('coffee');
    // And picking a категорія touches no сума on the screen.
    const chooseCategory = entryScreen.slice(
      entryScreen.indexOf('const chooseCategory = useCallback'),
      entryScreen.indexOf('/**', entryScreen.indexOf('const chooseCategory = useCallback')),
    );
    expect(chooseCategory).not.toContain('setAmount');
  });

  it('Scenario: Switching the тип keeps the typed сума', () => {
    const chooseEntry = entryScreen.slice(
      entryScreen.indexOf('const chooseEntry = useCallback'),
      entryScreen.indexOf('const displayedCategoryId'),
    );
    expect(chooseEntry).not.toContain('setAmount');
  });

  it('Scenario: A рахунок in another currency still clears the сума', () => {
    const chooseFrom = entryScreen.slice(
      entryScreen.indexOf('const chooseFrom = useCallback'),
      entryScreen.indexOf('const chooseTo = useCallback'),
    );
    expect(chooseFrom).toMatch(/next\.currency !== from\.currency\) \{\s*setAmount\(''\)/);
  });

  /** Where each field's label stands in the form, by its first appearance in the JSX. */
  const at = (needle: string) => {
    const form = entryScreen.slice(entryScreen.indexOf('<Card style={styles.form}>'));
    const index = form.indexOf(needle);
    expect(index, needle).toBeGreaterThan(-1);
    return index;
  };
  const SUMA = "label={entry === 'transfer' ? 'Скільки пішло' : 'Сума'}";
  const TYPE = 'label="Тип"';
  const ACCOUNT = "label={entry === 'transfer' ? 'Звідки' : 'Рахунок'}";
  const TO = 'label="Куди"';
  const ARRIVED = 'label="Скільки прийшло"';
  const OPYS = 'label="Опис"';
  const CATEGORY = "label={entry === 'refund' ? 'До якої категорії' : 'Категорія'}";
  const SOURCE = 'label="Джерело"';
  const DATE = '<DateField';

  it('Scenario: The сума is the first field and the дата the last', () => {
    const order = [SUMA, TYPE, ACCOUNT, OPYS, CATEGORY, DATE].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(at(SOURCE)).toBeGreaterThan(at(OPYS));
    expect(at(SOURCE)).toBeLessThan(at(DATE));
  });

  it('Scenario: A переказ keeps the сума first', () => {
    const order = [SUMA, TYPE, ACCOUNT, TO, ARRIVED, OPYS, DATE].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('Scenario: A повернення keeps the сума first', () => {
    // The same label carries «До якої категорії» for a повернення, right under the опис.
    const order = [SUMA, TYPE, ACCOUNT, OPYS, CATEGORY, DATE].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('Scenario: The proposed категорія stands right under the опис', () => {
    const between = entryScreen.slice(
      entryScreen.indexOf(OPYS),
      entryScreen.indexOf(CATEGORY),
    );
    // No other field's label stands between the two — the category picker opens right after.
    expect(between.slice(OPYS.length)).not.toContain('label=');
    expect(between).not.toContain('<DateField');
    expect(between.match(/<Picker/g)).toHaveLength(1);
  });

  /** The JSX passed as `Screen`'s `footer`. */
  const footer = () => {
    const from = entryScreen.indexOf('footer={');
    return entryScreen.slice(from, entryScreen.indexOf('<ScreenHeader', from));
  };

  it('Scenario: Both actions stand above the keyboard on opening', () => {
    expect(footer()).toContain('title="Записати"');
    expect(footer()).toContain('title="Записати і ще одну"');
    expect(footer()).toContain('variant="secondary"');
    // Only there: not in the scrolling column.
    expect(entryScreen.match(/title="Записати"/g)).toHaveLength(1);
    expect(entryScreen.match(/title="Записати і ще одну"/g)).toHaveLength(1);
    // Clear of the navigation bar while the keyboard is down, and no navigation-bar gap above the
    // keyboard while it is up (emulator, quick-entry smoke: 96 px between «Записати» and the keys).
    expect(footer()).toContain('paddingBottom: Spacing.two + (keyboardShown ? 0 : insets.bottom)');
    expect(entryScreen).toContain('const keyboardShown = useKeyboardShown();');
  });

  it('Scenario: No рахунок, no actions', () => {
    expect(footer()).toContain('offered.length === 0 ? undefined : (');
  });

  it('Scenario: The confirmation is seen where the button is', () => {
    const f = footer();
    const said = f.indexOf('{confirmation.text}');
    expect(said).toBeGreaterThan(-1);
    expect(said).toBeLessThan(f.indexOf('title="Записати"'));
    // Shown only while the form still equals what the store left.
    expect(entryScreen).toContain(
      'const confirmed = confirmation && !entryHoldsEdits(fields, confirmation.draft);',
    );
    expect(f).toContain('{confirmed ? (');
  });

  it('A refusal keeps the owner on the form with what they typed', () => {
    const record = entryScreen.slice(entryScreen.indexOf('const record = useCallback'));
    // The catch refuses through `refuse`, which shows the refusal and goes nowhere.
    const failure = record.slice(record.indexOf('const refuse = '), record.indexOf('const attempt = '));
    expect(failure).toContain('Alert.alert(');
    expect(failure).not.toContain('router.');
    expect(record.slice(record.indexOf('} catch (error) {'), record.indexOf('}, ['))).not.toContain(
      'router.',
    );
  });

  it('Scenario: With no рахунок nothing can be recorded yet', () => {
    // The whole form is inside the else of this guard: with nothing to record onto there is no
    // сума field to fill and no «Записати» to tap, only the sentence and the way to Рахунки.
    expect(entryScreen).toContain('{offered.length === 0 ? (');
    const guard = entryScreen.slice(entryScreen.indexOf('{offered.length === 0 ? ('));
    const refusal = guard.slice(0, guard.indexOf(') : ('));
    expect(refusal).toContain('Спершу створіть рахунок');
    expect(refusal).toContain('title="До Рахунків"');
    // Dismissed, not pushed over: a form that can record nothing is not left in the stack under
    // Рахунки (emulator, quick-entry smoke after `reset`).
    expect(refusal).toContain("router.dismissTo('/accounts')");
    expect(refusal).not.toContain("router.push('/accounts')");
    expect(refusal).not.toContain('title="Записати"');
    // And `offered` is the unarchived рахунки, so «every one archived» is the same case. It comes
    // from `accountChoicesFor`, whose own tests prove it offers exactly those — passing no current
    // рахунок, because nothing is being edited here and so there is no carried row to keep.
    expect(entryScreen).toContain('accountChoicesFor(stored.accounts, undefined)');
  });

});

describe('recordedConfirmation', () => {
  const names = {
    accounts: accountsById(accounts),
    categoryNames: new Map([
      ['groceries', 'Groceries'],
      [UNCATEGORISED_CATEGORY_ID, 'Без категорії'],
      ['fees', 'Комісія'],
    ]),
    sourceNames: new Map([
      ['salary', 'Salary'],
      [INTEREST_SOURCE_ID, 'Відсотки'],
    ]),
  };

  it('Scenario: The owner sees what was recorded', () => {
    const written = buildEntry(
      {
        type: 'expense',
        accountId: 'card',
        amount: '1200',
        date: '2026-09-01',
        categoryId: 'groceries',
      },
      { id: 'e1', accounts },
    );

    expect(recordedConfirmation([written], names)).toBe(
      'Записано: витрата 1 200,00 UAH — Groceries.',
    );
  });

  it('Scenario: An accepted комісія is part of the confirmation', () => {
    // «1000» UAH typed, «970» arrived, the комісія accepted.
    const short = transfer({
      id: 't1',
      date: '2026-09-01',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(100000, 'UAH'),
      arrived: money(97000, 'UAH'),
    });
    const proposal = proposeForTransfer(short, { accounts, sourceTransactions: [] });
    expect(proposal?.kind).toBe('fee');
    if (proposal?.kind !== 'fee') return;
    expect(proposal.transfer.left).toEqual(money(97000, 'UAH'));
    expect(proposal.expense.amount).toEqual(money(3000, 'UAH'));

    const said = recordedConfirmation(
      [proposal.transfer, { ...proposal.expense, id: 'f1' }],
      names,
    );

    // The переказ of 97000 and the комісія of 3000 stored with it, both named.
    expect(said).toBe(
      'Записано: переказ 970,00 UAH з «mono black» на «банка»; ' +
        'разом із цим — витрата 30,00 UAH — Комісія.',
    );
  });

  it('Scenario: A дохід is confirmed by its джерело', () => {
    const income = buildEntry(
      { type: 'income', accountId: 'card', amount: '5000', date: '2026-09-01', sourceId: 'salary' },
      { id: 'i1', accounts },
    );
    expect(recordedConfirmation([income], names)).toBe('Записано: дохід 5 000,00 UAH — Salary.');
  });

  it('A дохід is named by its джерело, a переказ by both рахунки', () => {
    const income = buildEntry(
      { type: 'income', accountId: 'card', amount: '5000', date: '2026-09-01', sourceId: 'salary' },
      { id: 'i1', accounts },
    );
    const moved = buildEntry(
      {
        type: 'transfer',
        accountId: 'card',
        toAccountId: 'jar',
        amount: '1000',
        date: '2026-09-01',
      },
      { id: 't1', accounts },
    );

    expect(recordedConfirmation([income], names)).toBe('Записано: дохід 5 000,00 UAH — Salary.');
    expect(recordedConfirmation([moved], names)).toBe(
      'Записано: переказ 1 000,00 UAH з «mono black» на «банка».',
    );
  });

  it('Scenario: A refusal is not a confirmation', () => {
    // Nothing was stored, so there is nothing to confirm — the refusal is shown on its own.
    expect(recordedConfirmation([], names)).toBeUndefined();
  });
});

describe('main-screen: the form after «Записати і ще одну»', () => {
  const YESTERDAY = '2026-08-23';

  it('Scenario: The form is ready for the next транзакція', () => {
    const stored = draft({
      accountId: 'card',
      amount: '1200',
      date: YESTERDAY,
      categoryId: 'groceries',
      description: 'АТБ',
    });

    expect(draftAfterStore(stored)).toEqual({
      type: 'expense',
      accountId: 'card',
      toAccountId: undefined,
      amount: '',
      arrived: '',
      date: YESTERDAY,
      categoryId: undefined,
      sourceId: undefined,
      description: '',
    });
  });

  it('Scenario: A переказ keeps both рахунки for the next one', () => {
    const next = draftAfterStore(
      draft({ type: 'transfer', accountId: 'card', toAccountId: 'usd', amount: '1000', arrived: '24' }),
    );

    expect(next.type).toBe('transfer');
    expect(next.accountId).toBe('card');
    expect(next.toAccountId).toBe('usd');
    expect(next.amount).toBe('');
    expect(next.arrived).toBe('');
  });

  it('A дохід drops its джерело for the next one', () => {
    const next = draftAfterStore(draft({ type: 'income', sourceId: 'salary', amount: '5000' }));
    expect(next.type).toBe('income');
    expect(next.sourceId).toBeUndefined();
  });

  it('A повернення drops its категорія, so the next one is refused until one is picked', () => {
    const next = draftAfterStore(draft({ type: 'refund', categoryId: 'groceries', amount: '300' }));
    expect(next.type).toBe('refund');
    expect(next.categoryId).toBeUndefined();
    expect(record({ ...next, amount: '100' }).refused).toBe('оберіть категорію');
  });

  it('Scenario: Leaving after a stay-open store asks nothing', () => {
    const d = draft({ categoryId: 'groceries', description: 'АТБ' });
    // The screen resets its «Відкинути зміни?» baseline to this very draft.
    expect(entryHoldsEdits(draftAfterStore(d), draftAfterStore(d))).toBe(false);
  });

  it('Scenario: A repeated tap stores nothing', () => {
    const left = draftAfterStore(draft({ amount: '250' }));
    expect(tapAfterStore(left, { draft: left }, 'recordAndNext')).toBe('nothing');
  });

  it('Scenario: Three витрати in a row — «Записати» on the untouched form stores no fourth', () => {
    const left = draftAfterStore(draft({ amount: '80' }));
    expect(tapAfterStore(left, { draft: left }, 'record')).toBe('leave');
  });

  it('Any changed field, or no confirmation, is an ordinary recording', () => {
    const left = draftAfterStore(draft({ amount: '45' }));
    const typed = { ...left, amount: '120' };
    for (const button of ['record', 'recordAndNext'] as const) {
      expect(tapAfterStore(typed, { draft: left }, button)).toBe('record');
      expect(tapAfterStore({ ...left, date: '2026-08-20' }, { draft: left }, button)).toBe('record');
      expect(tapAfterStore(left, undefined, button)).toBe('record');
    }
  });
});

describe('app-shell: which pushes find the entry form already open', () => {
  it('Scenario: An open form is not opened twice — a push naming nothing finds it', () => {
    expect(entrySingularId({})).toBe('entry');
    // The form forgets what its route named, so any open form answers the same.
    expect(entrySingularId({ type: undefined, to: undefined, account: undefined })).toBe('entry');
  });

  it('A push naming a рахунок or a тип opens a fresh form that honours it', () => {
    expect(entrySingularId({ account: 'card' })).toBeUndefined();
    expect(entrySingularId({ type: 'transfer', to: 'jar' })).toBeUndefined();
    expect(entrySingularId({ to: 'jar' })).toBeUndefined();
  });
});

describe('the type a route may ask the form to open on', () => {
  it('opens on a витрата when the route names nothing', () => {
    expect(entryFromRoute(undefined)).toBe('expense');
    expect(entryFromRoute('')).toBe('expense');
  });

  it('opens on the переказ «Фінансова подушка» and «Інвестиційна звичка» actually name', () => {
    expect(entryFromRoute('transfer')).toBe('transfer');
  });

  it('opens on a витрата for anything that is not one of the four', () => {
    // «Anything not explicitly typed otherwise is a витрата» — a misspelt parameter names nothing.
    expect(entryFromRoute('correction')).toBe('expense');
    expect(entryFromRoute('переказ')).toBe('expense');
    expect(entryFromRoute('TRANSFER')).toBe('expense');
  });
});

describe('proposedCategoryId', () => {
  const atbToGroceries: Rule = {
    id: 'r-atb',
    merchant: 'атб',
    target: { kind: 'category', categoryId: 'groceries' },
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
  };
  const atbToEatingOut: Rule = {
    id: 'r-atb-eating-out',
    merchant: 'атб',
    target: { kind: 'category', categoryId: 'eating-out' },
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
  };

  it('Scenario: A typed опис proposes its категорія', () => {
    expect(
      proposedCategoryId(
        { type: 'expense', description: 'АТБ 421', pickedByOwner: false },
        { rules: [atbToGroceries], merchants: NO_MERCHANTS },
      ),
    ).toBe('groceries');
  });

  it('Scenario: The entry form proposes by a продавець', () => {
    const atb = merchant({
      id: 'atb',
      name: 'АТБ',
      spellings: [{ id: 's1', spelling: 'atb', addedAt: new Date(0) }],
      createdAt: new Date(0),
    });
    const byMerchant = {
      id: 'r-atb',
      merchantId: 'atb',
      target: { kind: 'category', categoryId: 'eating-out' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    } as const;
    expect(
      proposedCategoryId(
        { type: 'expense', description: 'ATB 12', pickedByOwner: false },
        { rules: [byMerchant], merchants: merchantIndex([atb]) },
      ),
    ).toBe('eating-out');
  });

  it('Scenario: The owner\'s own pick is not overridden', () => {
    expect(
      proposedCategoryId(
        {
          type: 'expense',
          description: 'АТБ 421',
          categoryId: 'eating-out',
          pickedByOwner: true,
        },
        { rules: [atbToGroceries], merchants: NO_MERCHANTS },
      ),
    ).toBe('eating-out');
  });

  it('Scenario: An опис no правило matches proposes nothing', () => {
    expect(
      proposedCategoryId(
        { type: 'expense', description: 'новий заклад', pickedByOwner: false },
        { rules: [atbToGroceries], merchants: NO_MERCHANTS },
      ),
    ).toBeUndefined();
  });

  it('Scenario: A правило takes no part in a дохід', () => {
    expect(
      proposedCategoryId(
        { type: 'income', description: 'АТБ 421', pickedByOwner: false },
        { rules: [atbToGroceries], merchants: NO_MERCHANTS },
      ),
    ).toBeUndefined();
  });

  it('Scenario: A правило takes no part in a повернення', () => {
    expect(
      proposedCategoryId(
        {
          type: 'refund',
          description: 'АТБ 421',
          categoryId: 'clothing',
          pickedByOwner: false,
        },
        { rules: [atbToGroceries], merchants: NO_MERCHANTS },
      ),
    ).toBe('clothing');
  });

  it('a переказ takes nothing either', () => {
    expect(
      proposedCategoryId(
        { type: 'transfer', description: 'АТБ 421', pickedByOwner: false },
        { rules: [atbToGroceries], merchants: NO_MERCHANTS },
      ),
    ).toBeUndefined();
  });

  it('Scenario: The шаблон reaches the entry form', () => {
    const tiers = { rules: [], merchants: NO_MERCHANTS, templateRules: templateRules(new Map([['groceries', 'groceries']])) };
    expect(
      proposedCategoryId({ type: 'expense', description: 'АТБ 421', pickedByOwner: false }, tiers),
    ).toBe('groceries');
    // A правило still decides first, and the owner's own pick still stands.
    expect(
      proposedCategoryId(
        { type: 'expense', description: 'АТБ 421', pickedByOwner: false },
        { ...tiers, rules: [atbToEatingOut] },
      ),
    ).toBe('eating-out');
    expect(
      proposedCategoryId(
        { type: 'expense', description: 'АТБ 421', categoryId: 'home', pickedByOwner: true },
        tiers,
      ),
    ).toBe('home');
  });

  it('no description proposes nothing, and does not throw', () => {
    expect(
      proposedCategoryId({ type: 'expense', pickedByOwner: false }, { rules: [atbToGroceries], merchants: NO_MERCHANTS }),
    ).toBeUndefined();
  });

  it('Scenario: A правило-переказ proposes nothing by hand', () => {
    const roundUpToTransfer: Rule = {
      id: 'r-round-up',
      merchant: 'округлення балансу',
      target: { kind: 'transfer', toAccountId: 'reserve' },
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
    };
    const bills: Rule = {
      id: 'r-bills',
      merchant: 'округлення',
      target: { kind: 'category', categoryId: 'bills' },
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
    };
    // No `from` reaches `proposedCategoryId` at all — recording by hand names no рахунок yet in the
    // sense a правило-переказ needs, so it takes no part and the shorter category rule decides.
    expect(
      proposedCategoryId(
        { type: 'expense', description: 'Округлення балансу', pickedByOwner: false },
        { rules: [bills, roundUpToTransfer], merchants: NO_MERCHANTS },
      ),
    ).toBe('bills');
  });
});

/**
 * `verify` runs no JSX, so where the entry form draws two things is pinned by reading it — the
 * same way the confirmation sentence itself is pinned above (ux-pass-2026-09-23, design D4/D5).
 */
describe('the entry form as drawn', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('The дата is typed on a digit keyboard Android honours', () => {
    const form = readFileSync(new URL('../components/form.tsx', import.meta.url), 'utf8');
    // `numbers-and-punctuation` alone is iOS-only: Android shows letters for it.
    expect(form).toMatch(/android: 'phone-pad'/);
    expect(form).toContain('keyboardType={DATE_KEYBOARD}');
  });

  it('The дата can be picked in the platform date picker, beside the typed field', () => {
    const form = readFileSync(new URL('../components/form.tsx', import.meta.url), 'utf8');
    expect(form).toContain("from '@expo/ui/community/datetime-picker'");
    expect(form).toContain('label="Календар"');
    // Opened on the typed дата and read back per platform, never through toISOString().
    expect(form).toContain('pickerInstant(opened)');
    expect(form).toMatch(/pickedDate\(date, Platform\.OS === 'android' \? 'utc' : 'local'\)/);
  });

  it('Both the entry form and editing set the дата through DateField, not a typed field of their own', () => {
    for (const path of ['../app/transaction/new.tsx', '../app/transaction/[id].tsx']) {
      const screen = source(path);
      expect(screen).toContain('<DateField');
      expect(screen).not.toContain('РРРР-ММ-ДД');
    }
  });
});

/**
 * A typo in the year used to be stored as typed: 2099-01-01 then sat on top of «Останні
 * транзакції» forever, beyond anything Місяць could step to, and 1900-01-01 quietly moved every
 * balance it touched. `now` is a fixed local instant — 2026-08-24, the same TODAY the drafts above
 * use — so the window's edges are the test's, not the wall clock's.
 */
describe('the дата of a транзакція being recorded or edited', () => {
  const now = new Date(2026, 7, 24, 10, 0, 0);

  const refusal = (date: string, stored?: string): string | undefined => {
    try {
      entryDateCheck(date as never, now, stored as never);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  it('A дата far in the future is refused, naming it', () => {
    expect(refusal('2099-01-01')).toBe(
      'дата «1 січня 2099» — більше ніж за рік від сьогодні; перевірте рік',
    );
  });

  it('A дата before 2000 is refused, naming it', () => {
    expect(refusal('1900-01-01')).toBe('дата «1 січня 1900» — раніше 2000 року; перевірте рік');
    expect(refusal('1999-12-31')).toBe('дата «31 грудня 1999» — раніше 2000 року; перевірте рік');
  });

  it('The window is inclusive at both edges', () => {
    expect(entryDateCheck('2000-01-01', now)).toEqual({ kind: 'ok' });
    // A year after today is still asked about, not refused; the day after it is refused.
    expect(entryDateCheck('2027-08-24', now).kind).toBe('confirm');
    expect(refusal('2027-08-25')).toMatch(/^дата «25 серпня 2027» — більше ніж за рік/);
  });

  it('Today and any past дата since 2000 are recorded without a question', () => {
    expect(entryDateCheck(TODAY, now)).toEqual({ kind: 'ok' });
    expect(entryDateCheck('2026-08-23', now)).toEqual({ kind: 'ok' });
    expect(entryDateCheck('2012-03-15', now)).toEqual({ kind: 'ok' });
  });

  it('A дата after today, within the year, asks first — naming it', () => {
    expect(entryDateCheck('2026-08-25', now)).toEqual({
      kind: 'confirm',
      title: 'Дата в майбутньому',
      message: '«25 серпня» ще не настала. Записати транзакцію цією датою?',
    });
    expect(entryDateCheck('2027-01-05', now)).toMatchObject({
      kind: 'confirm',
      message: '«5 січня 2027» ще не настала. Записати транзакцію цією датою?',
    });
  });

  it('"Today" is the local calendar day, not UTC', () => {
    // 00:30 local on the 25th: the 25th is today, whatever the UTC date still says.
    expect(entryDateCheck('2026-08-25', new Date(2026, 7, 25, 0, 30))).toEqual({ kind: 'ok' });
  });

  it('Editing leaves a stored дата alone, even one the window would refuse today', () => {
    // An older import or a record made before this check must stay editable — its категорія,
    // its сума — without the owner being forced to change a дата they did not touch.
    expect(entryDateCheck('1999-06-01', now, '1999-06-01')).toEqual({ kind: 'ok' });
    expect(entryDateCheck('2026-09-10', now, '2026-09-10')).toEqual({ kind: 'ok' });
    // Changing it is judged like recording.
    expect(refusal('2099-06-01', '2026-06-01')).toMatch(/^дата «1 червня 2099»/);
    expect(entryDateCheck('2026-09-10', now, '2026-08-01').kind).toBe('confirm');
  });
});

describe('the дата check as wired', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('Both recording and editing judge the дата before anything is stored', () => {
    for (const path of ['../app/transaction/new.tsx', '../app/transaction/[id].tsx']) {
      const screen = source(path);
      expect(screen).toContain('entryDateCheck(');
      expect(screen).toContain("text: 'Скасувати', style: 'cancel'");
    }
    // Editing passes the stored дата, so an untouched one is never re-judged.
    expect(source('../app/transaction/[id].tsx')).toMatch(/entryDateCheck\(built\.date, new Date\(\), original\.date\)/);
  });
});

/**
 * app-shell, "A form with unsaved edits asks before «назад» discards it" — the entry form and the
 * editing of a транзакція. Each passes its own field object as it stands and as it opened.
 */
describe('entryHoldsEdits', () => {
  const opened: EntryDraft = {
    type: 'expense',
    accountId: 'card',
    amount: '',
    date: '2026-10-06',
    categoryId: undefined,
    sourceId: undefined,
    description: '',
  };

  it('Scenario: An untouched form closes at once', () => {
    expect(entryHoldsEdits({ ...opened }, opened)).toBe(false);
  });

  it('Scenario: An edited form asks first — a typed сума, a picked категорія, a moved дата', () => {
    expect(entryHoldsEdits({ ...opened, amount: '125,50' }, opened)).toBe(true);
    expect(entryHoldsEdits({ ...opened, categoryId: 'cafe' }, opened)).toBe(true);
    expect(entryHoldsEdits({ ...opened, date: '2026-10-05' }, opened)).toBe(true);
    expect(entryHoldsEdits({ ...opened, type: 'income' }, opened)).toBe(true);
  });

  it('a сума typed and erased again is no change', () => {
    expect(entryHoldsEdits({ ...opened, amount: '' }, opened)).toBe(false);
  });

  it('no транзакція opens no form, so there is nothing to discard', () => {
    expect(entryHoldsEdits(undefined, undefined)).toBe(false);
  });

  it('Scenario: Its опис is corrected — a коригування\'s form asks only once its опис changed', () => {
    const reconciled: Correction = {
      type: 'correction',
      id: 'c1',
      date: '2026-09-16',
      accountId: 'reserve',
      amount: money(-77686, 'UAH'),
    };
    const opened = initialForm(reconciled)!;
    expect(entryHoldsEdits({ ...opened }, opened)).toBe(false);
    expect(entryHoldsEdits({ ...opened, description: 'перерахунок готівки' }, opened)).toBe(true);
  });
});
