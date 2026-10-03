import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import { figuresOf, isRefusal, makeBackup, readBackup, type BackupRefusal } from './backup';
import { canonicalJson, crc32 } from './canonical';
import { BACKUP_FORMAT_VERSION, BACKUP_SCHEMA_VERSION, type BackupState } from './format';

const MADE_AT = new Date('2026-08-30T18:20:00.000Z');

/** An empty state, so each test names only what it is about. */
function state(over: Partial<BackupState> = {}): BackupState {
  return {
    accounts: [],
    categories: [],
    sources: [],
    rules: [],
    limits: [],
    goals: [],
    transactions: [],
    monobankAccounts: [],
    monobankLinks: [],
    monobankImportedItems: [],
    watches: [],
    receipts: [],
    receiptItems: [],
    achievements: [],
    challengeDecisions: [],
    norms: [],
    investmentValues: [],
    ...over,
  };
}

function uahAccount(id: string, name = id) {
  return {
    id,
    name,
    kind: 'spending' as const,
    currency: 'UAH',
    openingBalance: money(0, 'UAH'),
    archived: false,
  };
}

function expense(id: string, date: string, accountId = 'a1', categoryId = 'c1'): Transaction {
  return { type: 'expense', id, date, accountId, amount: money(-12_000, 'UAH'), categoryId };
}

function stored(t: Transaction, storedAtMs = 1_700_000_000_000) {
  return { transaction: t, storedAtMs };
}

/** A бекап of one рахунок, one категорія and one витрата — the smallest thing that stands up. */
function smallState(): BackupState {
  return state({
    accounts: [uahAccount('a1', 'Картка')],
    categories: [{ id: 'c1', name: 'Продукти', archived: false }],
    transactions: [stored(expense('t1', '2026-08-30'))],
  });
}

/**
 * A бекап built around a body this app's own `makeBackup` could never produce, with a checksum
 * that is nonetheless right for it — the only way to reach the body checks with a file that a
 * different tool, or a hand edit plus a recomputed checksum, could really hand us.
 */
function handMade(data: unknown): string {
  return JSON.stringify({
    app: 'cap1tal',
    kind: 'backup',
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: MADE_AT.toISOString(),
    checksum: crc32(canonicalJson(data)),
    data,
  });
}

function refusal(bytes: string): BackupRefusal {
  const read = readBackup(bytes);
  if (!isRefusal(read)) {
    throw new Error(`expected a refusal, got a бекап of ${read.figures.transactions} транзакцій`);
  }
  return read;
}

describe('a бекап is one versioned file holding the whole state', () => {
  it('Scenario: Identifiers are preserved', () => {
    const before = state({
      accounts: [uahAccount('a1', 'Картка'), uahAccount('a2', 'Готівка')],
      categories: [{ id: 'c1', name: 'Продукти', archived: false }],
      sources: [{ id: 's1', name: 'Зарплата', archived: false }],
      rules: [{ id: 'r1', merchant: 'сільпо', categoryId: 'c1', createdAtMs: 1_700_000_000_000 }],
      goals: [
        { id: 'g1', name: 'Авто', target: money(500_000, 'UAH'), deadline: '2027-01-01', accountIds: ['a1'] },
      ],
      transactions: [stored(expense('t1', '2026-08-30'))],
    });

    const read = readBackup(makeBackup(before, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);

    // Verbatim, not merely "the same number of things": the schema's ids are app-generated TEXT
    // precisely so a restored бекап refers to the same рахунки the бекап was made from.
    expect(read.state).toEqual(before);
    expect(read.state.accounts.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(read.state.rules.map((r) => r.id)).toEqual(['r1']);
    expect(read.state.goals.map((g) => g.id)).toEqual(['g1']);
    expect(read.state.transactions.map((t) => t.transaction.id)).toEqual(['t1']);
  });

  it('names the moment it was made and the versions it was written under', () => {
    const snapshot = makeBackup(smallState(), MADE_AT);

    expect(snapshot.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(snapshot.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(snapshot.createdAt).toEqual(MADE_AT);

    const read = readBackup(snapshot.bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.createdAt).toEqual(MADE_AT);
    expect(read.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
  });

  it('says what it is in its first bytes, so a half-written file still says it', () => {
    // What lets a truncated бекап be told apart from a file that was never one.
    expect(makeBackup(smallState(), MADE_AT).bytes.slice(0, 40)).toContain('"app":"cap1tal"');
  });

  it('carries the two pieces of storage metadata that decide order', () => {
    // `storedAt` breaks ties between транзакції of one дата, `createdAt` between two equally
    // specific правила — so a restored phone lists exactly what the old one listed (design D3).
    const before = state({
      accounts: [uahAccount('a1')],
      categories: [{ id: 'c1', name: 'Продукти', archived: false }],
      rules: [{ id: 'r1', mcc: 5411, categoryId: 'c1', createdAtMs: 1_699_000_000_123 }],
      transactions: [stored(expense('t1', '2026-08-30'), 1_700_000_000_456)],
    });

    const read = readBackup(makeBackup(before, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.state.transactions[0]?.storedAtMs).toBe(1_700_000_000_456);
    expect(read.state.rules[0]?.createdAtMs).toBe(1_699_000_000_123);
  });
});

describe('the дата початкового залишку in a бекап', () => {
  it('carries a рахунок\'s дата and leaves it out where there is none', () => {
    const before = state({
      accounts: [{ ...uahAccount('a1', 'Картка'), openingDate: '2024-10-27' }, uahAccount('a2')],
    });
    const read = readBackup(makeBackup(before, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.state.accounts).toEqual(before.accounts);
    expect('openingDate' in read.state.accounts[1]!).toBe(false);
  });

  it('Scenario: An older бекап restores without dates', () => {
    // A рахунок as the previous format wrote it: no `openingDate` key at all.
    const read = readBackup(
      handMade({
        ...state(),
        accounts: [
          { id: 'a1', name: 'Картка', kind: 'spending', currency: 'UAH', openingBalance: { amount: 803, currency: 'UAH' }, archived: false },
        ],
      }),
    );
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.state.accounts[0]!.openingDate).toBeUndefined();
    expect(read.state.accounts[0]!.openingBalance).toEqual(money(803, 'UAH'));
  });

  it('refuses a дата that is not a calendar date', () => {
    expect(
      refusal(handMade({ ...state(), accounts: [{ ...uahAccount('a1'), openingDate: '2026-02-30' }] })),
    ).toMatchObject({ kind: 'inconsistent' });
  });
});

describe('what a бекап is not asked to carry', () => {
  it('Scenario: A бекап carries no репорт', () => {
    // The type-level half of the exclusion, beside `format.test.ts`'s table-level half: a
    // `BackupState` has no field a журнал entry or a репорт про помилку could sit in, so no
    // future mapper can put one there by accident and no reader can expect one.
    const keys = Object.keys(state()).sort();
    for (const absent of ['journal', 'reports', 'bugReports', 'screenshots']) {
      expect(keys).not.toContain(absent);
    }

    // And the written file says nothing of them either — the whole of what a бекап is, is these
    // thirteen collections.
    const bytes = makeBackup(smallState(), MADE_AT).bytes;
    expect(bytes).not.toContain('journal');
    expect(bytes).not.toContain('bug_report');
    expect(bytes).not.toContain('"did"');
  });
});

describe('a бекап proves it is undamaged before it is trusted', () => {
  it('Scenario: An edited бекап is refused', () => {
    const bytes = makeBackup(smallState(), MADE_AT).bytes;
    // Someone opened the file and moved a сума. Nothing else about it changed.
    const edited = bytes.replace('-12000', '-99000');
    expect(edited).not.toBe(bytes);

    expect(refusal(edited).kind).toBe('damaged');
  });

  it('Scenario: A truncated бекап is refused', () => {
    const bytes = makeBackup(smallState(), MADE_AT).bytes;

    expect(refusal(bytes.slice(0, Math.floor(bytes.length / 2))).kind).toBe('damaged');
    // Even a file cut so short that only its head survives is a damaged бекап, not a stranger.
    expect(refusal(bytes.slice(0, 30)).kind).toBe('damaged');
  });

  it('Scenario: A file that is not a бекап is refused', () => {
    const saldoCsv = 'Date,Account,Category,Amount\n2026-08-30,Картка,Продукти,-120.00\n';

    expect(refusal(saldoCsv).kind).toBe('not-a-backup');
    expect(refusal('').kind).toBe('not-a-backup');
    // Valid JSON that is simply something else — a bare array, another app's export.
    expect(refusal('[1,2,3]').kind).toBe('not-a-backup');
    expect(refusal('{"app":"something-else","data":{}}').kind).toBe('not-a-backup');
  });

  it('Scenario: A бекап whose moment is not one is refused', () => {
    // The markers are right and the checksum is right for the body — the checksum covers the body
    // and not the envelope (design D4), so nothing downstream would catch this. Only the envelope
    // check can: a file that cannot say when it was made is not one of ours.
    const bytes = handMade(smallState()).replace(
      `"createdAt":"${MADE_AT.toISOString()}"`,
      '"createdAt":"коли завгодно"',
    );
    expect(bytes).toContain('коли завгодно');

    expect(refusal(bytes).kind).toBe('not-a-backup');
    // An empty one and a number-shaped one are the same answer, not a preview of Invalid Date.
    expect(refusal(handMade(smallState()).replace(`"${MADE_AT.toISOString()}"`, '""')).kind).toBe(
      'not-a-backup',
    );
  });
});

describe('a бекап names the versions it was written under', () => {
  it('Scenario: A бекап from a newer app is refused, not half-read', () => {
    const bytes = makeBackup(smallState(), MADE_AT).bytes.replace(
      `"formatVersion":${BACKUP_FORMAT_VERSION}`,
      `"formatVersion":${BACKUP_FORMAT_VERSION + 1}`,
    );

    const read = refusal(bytes);
    // Refused for the version and not as damage: the checksum covers the body, which is untouched.
    expect(read).toEqual({
      kind: 'newer-format',
      formatVersion: BACKUP_FORMAT_VERSION + 1,
      supported: BACKUP_FORMAT_VERSION,
    });
  });

  it('Scenario: A бекап from a newer storage shape is refused', () => {
    const bytes = makeBackup(smallState(), MADE_AT).bytes.replace(
      `"schemaVersion":${BACKUP_SCHEMA_VERSION}`,
      `"schemaVersion":${BACKUP_SCHEMA_VERSION + 1}`,
    );

    expect(refusal(bytes)).toEqual({
      kind: 'newer-schema',
      schemaVersion: BACKUP_SCHEMA_VERSION + 1,
      supported: BACKUP_SCHEMA_VERSION,
    });
  });

  it('reads a бекап written under an older storage shape', () => {
    const bytes = makeBackup(smallState(), MADE_AT).bytes.replace(
      `"schemaVersion":${BACKUP_SCHEMA_VERSION}`,
      '"schemaVersion":1',
    );

    const read = readBackup(bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.schemaVersion).toBe(1);
    expect(read.figures.transactions).toBe(1);
  });
});

describe('a бекап that contradicts itself is refused whole', () => {
  it('Scenario: A transaction pointing outside the бекап stops the restore', () => {
    const orphan = state({
      accounts: [uahAccount('a1')],
      categories: [{ id: 'c1', name: 'Продукти', archived: false }],
      transactions: [stored(expense('t1', '2026-08-30', 'a-gone'))],
    });

    const read = refusal(makeBackup(orphan, MADE_AT).bytes);
    expect(read.kind).toBe('inconsistent');
    expect(read.kind === 'inconsistent' && read.problem).toContain('t1');
    expect(read.kind === 'inconsistent' && read.problem).toContain('рахунок');
  });

  it('refuses a транзакція naming a категорія or джерело the бекап does not hold', () => {
    const noCategory = state({
      accounts: [uahAccount('a1')],
      transactions: [stored(expense('t1', '2026-08-30', 'a1', 'c-gone'))],
    });
    expect(refusal(makeBackup(noCategory, MADE_AT).bytes).kind).toBe('inconsistent');

    const noSource = state({
      accounts: [uahAccount('a1')],
      transactions: [
        stored({
          type: 'income',
          id: 't2',
          date: '2026-08-30',
          accountId: 'a1',
          amount: money(50_000, 'UAH'),
          sourceId: 's-gone',
        }),
      ],
    });
    expect(refusal(makeBackup(noSource, MADE_AT).bytes).kind).toBe('inconsistent');
  });

  it('Scenario: A ціль comes back with its whole склад', () => {
    const before = state({
      accounts: [
        uahAccount('a1', 'Резерв'),
        {
          id: 'a2',
          name: 'USD банка',
          kind: 'savings' as const,
          currency: 'USD',
          openingBalance: money(0, 'USD'),
          archived: false,
        },
        {
          id: 'a3',
          name: 'ОВДП',
          kind: 'investment' as const,
          currency: 'UAH',
          openingBalance: money(0, 'UAH'),
          archived: false,
        },
      ],
      goals: [
        {
          id: 'g1',
          name: 'Машина',
          target: money(70_000_000, 'UAH'),
          deadline: '2027-06-30',
          accountIds: ['a1', 'a2', 'a3'],
        },
      ],
    });

    const read = readBackup(makeBackup(before, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);

    // The same target, the same currency and exactly those three рахунки — so the progress the
    // ціль shows afterwards is the progress it showed on the phone the бекап came from.
    expect(read.state.goals).toEqual(before.goals);
  });

  it('Scenario: A ціль without a дата comes back without one', () => {
    const before = state({
      accounts: [uahAccount('a1', 'Резерв')],
      goals: [
        { id: 'g1', name: 'Резерв', target: money(30_000_000, 'UAH'), accountIds: ['a1'] },
      ],
    });

    const read = readBackup(makeBackup(before, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);

    expect(read.state.goals).toEqual(before.goals);
    expect('deadline' in read.state.goals[0]!).toBe(false);
  });

  it('Scenario: A ціль витрат comes back as its ліміт', () => {
    const before = state({
      categories: [{ id: 'restaurants', name: 'Ресторани', archived: false }],
      limits: [{ categoryId: 'restaurants', amount: money(200_000, 'UAH') }],
    });

    const read = readBackup(makeBackup(before, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);

    // One сума and not two: the ціль витрат is the ліміт, so nothing new was written for it and
    // the бекап carries no second row that could disagree.
    expect(read.state.limits).toEqual(before.limits);
    expect(read.state.goals).toEqual([]);
  });

  it('Scenario: A ціль in another currency than its рахунок stops the restore', () => {
    const mismatched = state({
      accounts: [uahAccount('a1', 'Картка')],
      goals: [
        {
          id: 'g1',
          name: 'Авто',
          target: money(500_000, 'USD'),
          deadline: '2027-01-01',
          accountIds: ['a1'],
        },
      ],
    });

    const read = refusal(makeBackup(mismatched, MADE_AT).bytes);
    expect(read.kind).toBe('inconsistent');
    expect(read.kind === 'inconsistent' && read.problem).toContain('USD');
    expect(read.kind === 'inconsistent' && read.problem).toContain('UAH');
  });

  it('refuses a ліміт, ціль or застосунок on something the бекап does not hold', () => {
    for (const contradiction of [
      state({ limits: [{ categoryId: 'c-gone', amount: money(250_000, 'UAH') }] }),
      state({
        goals: [
          {
            id: 'g1',
            name: 'Авто',
            target: money(1, 'UAH'),
            deadline: '2027-01-01',
            accountIds: ['a-gone'],
          },
        ],
      }),
      state({ watches: [{ packageName: 'ua.privatbank.ap24', accountId: 'a-gone' }] }),
      state({ rules: [{ id: 'r1', mcc: 5411, categoryId: 'c-gone', createdAtMs: 0 }] }),
      state({ monobankImportedItems: [{ monobankAccountId: 'm-gone', itemId: 'i1' }] }),
    ]) {
      expect(refusal(makeBackup(contradiction, MADE_AT).bytes).kind).toBe('inconsistent');
    }
  });

  it('refuses a сума that is not an integer in minor units or has no currency code', () => {
    const account = {
      id: 'a1',
      name: 'Картка',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: { amount: 0, currency: 'UAH' },
      archived: false,
    };
    const withAmount = (amount: unknown) => ({
      accounts: [account],
      categories: [{ id: 'c1', name: 'Продукти', archived: false }],
      transactions: [
        {
          transaction: {
            type: 'expense',
            id: 't1',
            date: '2026-08-30',
            accountId: 'a1',
            amount,
            categoryId: 'c1',
          },
          storedAtMs: 0,
        },
      ],
    });

    // A сума in major units, which is the mistake this rule exists for: 120.5 hryvnias is not an
    // amount this app can hold, and a бекап holding one may not be half-restored to find out.
    expect(refusal(handMade(withAmount({ amount: 120.5, currency: 'UAH' }))).kind).toBe(
      'inconsistent',
    );
    // A bare number with no currency code beside it.
    expect(refusal(handMade(withAmount(12_000))).kind).toBe('inconsistent');
    // A code that is not ISO-4217.
    expect(refusal(handMade(withAmount({ amount: 12_000, currency: 'грн' }))).kind).toBe(
      'inconsistent',
    );
    // And an opening balance in a currency the рахунок does not hold money in.
    expect(
      refusal(
        handMade({ accounts: [{ ...account, openingBalance: { amount: 1, currency: 'USD' } }] }),
      ).kind,
    ).toBe('inconsistent');
  });

  it('refuses a body that is not the shape of a state at all', () => {
    expect(refusal(handMade({ accounts: 'усі' })).kind).toBe('inconsistent');
    expect(refusal(handMade({ accounts: [{ id: 'a1' }] })).kind).toBe('inconsistent');
    expect(refusal(handMade({ transactions: [{ transaction: { type: 'дар' } }] })).kind).toBe(
      'inconsistent',
    );
  });
});

describe('what a restore would do is knowable before it does it', () => {
  it('Scenario: The бекап describes itself before it is restored', () => {
    const accounts = Array.from({ length: 12 }, (_, i) => uahAccount(`a${i}`));
    // 4300 транзакції spread over the months 2024-01 to 2026-08, first and last dated exactly.
    const dates = ['2024-01-03', ...Array.from({ length: 4298 }, () => '2025-06-15'), '2026-08-30'];
    const before = state({
      accounts,
      categories: [{ id: 'c1', name: 'Продукти', archived: false }],
      transactions: dates.map((date, i) => stored(expense(`t${i}`, date, 'a0'))),
    });

    const read = readBackup(makeBackup(before, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);

    expect(read.createdAt).toEqual(MADE_AT);
    expect(read.figures).toEqual({
      accounts: 12,
      transactions: 4300,
      firstMonth: '2024-01',
      lastMonth: '2026-08',
    });
  });

  it('counts the phone the same way it counts the бекап', () => {
    // One function for both sides of the preview, so the two columns cannot be counted apart.
    const phone = state({
      accounts: [uahAccount('a1'), uahAccount('a2'), uahAccount('a3')],
      categories: [{ id: 'c1', name: 'Продукти', archived: false }],
      transactions: Array.from({ length: 40 }, (_, i) => stored(expense(`t${i}`, '2026-08-01'))),
    });

    expect(figuresOf(phone)).toEqual({
      accounts: 3,
      transactions: 40,
      firstMonth: '2026-08',
      lastMonth: '2026-08',
    });
  });

  it('names no months at all when it holds no транзакція', () => {
    expect(figuresOf(state({ accounts: [uahAccount('a1')] }))).toEqual({
      accounts: 1,
      transactions: 0,
    });
  });

  it('Scenario: An older бекап still restores', () => {
    // Written before відстежувані застосунки existed: the body names no `watches` at all, and its
    // checksum is the one such a file would really carry.
    const older = { ...smallState() } as Record<string, unknown>;
    delete older.watches;
    const bytes = makeBackup(older as unknown as BackupState, MADE_AT).bytes;
    expect(bytes).not.toContain('"watches"');

    const read = readBackup(bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.state.accounts).toHaveLength(1);
    expect(read.state.transactions).toHaveLength(1);
    // Filled in as nothing, never invented.
    expect(read.state.watches).toEqual([]);
  });
});

describe('a бекап carries the розстрочки', () => {
  const iphone = {
    id: 'i-iphone',
    name: 'iPhone',
    total: 1_000_000,
    partsCount: 10,
    part: 100_000,
    firstDue: '2026-06-05',
    debitAccountId: 'a1',
    paidBefore: 4,
    categoryId: 'c1',
    recordedAt: 1_700_000_000_000,
  };
  const debit = (id: string, date: string, accountId = 'a1'): Transaction => ({
    type: 'expense',
    id,
    date,
    accountId,
    amount: money(100_000, 'UAH'),
    categoryId: 'c1',
  });
  const withInstallments = (over: Partial<BackupState> = {}) =>
    state({
      accounts: [uahAccount('a1', 'mono black'), uahAccount('a2', 'mono white')],
      categories: [{ id: 'c1', name: 'Техніка', archived: false }],
      transactions: [stored(debit('t5', '2026-10-05')), stored(debit('t6', '2026-11-05'))],
      installments: {
        plans: [iphone],
        links: [{ installmentId: 'i-iphone', number: 5, transactionId: 't5' }],
        marks: [{ installmentId: 'i-iphone', number: 6 }],
        refusals: [{ installmentId: 'i-iphone', number: 7, transactionId: 't6' }],
        reminderEnabled: false,
      },
      ...over,
    });

  function inconsistent(bad: BackupState): string {
    const read = refusal(handMade(JSON.parse(canonicalJson(bad))));
    expect(read.kind).toBe('inconsistent');
    return read.kind === 'inconsistent' ? read.problem : '';
  }

  it('Scenario: A розстрочка survives the round trip', () => {
    const before = withInstallments();
    const read = readBackup(makeBackup(before, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.state.installments).toEqual(before.installments);
    expect(read.state.installments?.reminderEnabled).toBe(false);
  });

  it('Scenario: A бекап written before розстрочки existed still restores', () => {
    const older = { ...smallState() } as Record<string, unknown>;
    delete older.installments;
    const read = readBackup(handMade(JSON.parse(canonicalJson(older))));
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.state.installments).toBeUndefined();
    expect(read.state.transactions).toHaveLength(1);
  });

  it('Scenario: A розстрочка on a рахунок outside the бекап stops the restore', () => {
    const outside = withInstallments();
    expect(
      inconsistent({
        ...outside,
        installments: { ...outside.installments!, plans: [{ ...iphone, debitAccountId: 'a-gone' }], links: [] },
      }),
    ).toContain('рахунок');

    const dollars = { ...uahAccount('usd', 'USD'), currency: 'USD', openingBalance: money(0, 'USD') };
    expect(
      inconsistent({
        ...outside,
        accounts: [...outside.accounts, dollars],
        installments: { ...outside.installments!, plans: [{ ...iphone, debitAccountId: 'usd' }], links: [] },
      }),
    ).toContain('не в гривнях');
  });

  it('Scenario: One транзакція linked twice stops the restore', () => {
    const vacuum = { ...iphone, id: 'i-vacuum', name: 'Пилосос', paidBefore: 0, firstDue: '2026-10-05' };
    const twice = withInstallments();
    expect(
      inconsistent({
        ...twice,
        installments: {
          ...twice.installments!,
          plans: [iphone, vacuum],
          links: [
            { installmentId: 'i-iphone', number: 5, transactionId: 't5' },
            { installmentId: 'i-vacuum', number: 1, transactionId: 't5' },
          ],
        },
      }),
    ).toContain('двох платежів');
  });

  it('Scenario: A link outside the бекап stops the restore', () => {
    const outside = withInstallments();
    expect(
      inconsistent({
        ...outside,
        installments: {
          ...outside.installments!,
          links: [{ installmentId: 'i-iphone', number: 5, transactionId: 't-gone' }],
        },
      }),
    ).toContain('транзакцію, якої в бекапі немає');
  });

  it('refuses a link to a витрата on another рахунок, and a value the domain refuses', () => {
    const elsewhere = withInstallments({
      transactions: [stored(debit('t5', '2026-10-05', 'a2')), stored(debit('t6', '2026-11-05'))],
    });
    expect(inconsistent(elsewhere)).toContain('не є витратою в гривнях з рахунку списання');

    const broken = withInstallments();
    expect(
      inconsistent({
        ...broken,
        installments: { ...broken.installments!, plans: [{ ...iphone, paidBefore: 10 }] },
      }),
    ).toContain('щонайбільше 9 з 10');
  });

  it('Scenario: A розстрочка on a since-archived рахунок restores', () => {
    const archived = withInstallments({
      accounts: [{ ...uahAccount('a1', 'mono black'), archived: true }, uahAccount('a2', 'mono white')],
      categories: [{ id: 'c1', name: 'Техніка', archived: true }],
    });
    const read = readBackup(makeBackup(archived, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.state.installments?.plans).toEqual([iphone]);
  });
});

describe("commitments — a бекап carries the зобов'язання", () => {
  const netflix = {
    id: 'c-netflix',
    name: 'Netflix',
    amount: 29_900,
    currency: 'UAH',
    periodicity: 'monthly' as const,
    firstDue: '2026-08-15',
    debitAccountId: 'a1',
    categoryId: 'c1',
    marker: 'netflix',
    recordedAt: 1_700_000_000_000,
    stoppedOn: '2026-10-20',
  };
  const debit = (id: string, date: string, accountId = 'a1', amount = 29_900): Transaction => ({
    type: 'expense',
    id,
    date,
    accountId,
    amount: money(amount, 'UAH'),
    categoryId: 'c1',
  });
  const withCommitments = (over: Partial<BackupState> = {}) =>
    state({
      accounts: [uahAccount('a1', 'mono black'), uahAccount('a2', 'mono white')],
      categories: [{ id: 'c1', name: 'Підписки', archived: false }],
      transactions: [stored(debit('aug', '2026-08-15')), stored(debit('other', '2026-08-16'))],
      commitments: {
        plans: [netflix],
        links: [{ commitmentId: 'c-netflix', number: 1, transactionId: 'aug' }],
        marks: [
          { commitmentId: 'c-netflix', number: 2, kind: 'paid' },
          { commitmentId: 'c-netflix', number: 3, kind: 'skipped' },
        ],
        refusals: [{ commitmentId: 'c-netflix', number: 1, transactionId: 'other' }],
      },
      ...over,
    });

  function inconsistent(bad: BackupState): string {
    const read = refusal(handMade(JSON.parse(canonicalJson(bad))));
    expect(read.kind).toBe('inconsistent');
    return read.kind === 'inconsistent' ? read.problem : '';
  }

  it("Scenario: A зобов'язання survives the round trip", () => {
    const before = withCommitments();
    const read = readBackup(makeBackup(before, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.state.commitments).toEqual(before.commitments);
    expect(read.state.commitments?.plans[0]?.stoppedOn).toBe('2026-10-20');
  });

  it("Scenario: A бекап written before зобов'язання existed still restores", () => {
    const older = { ...smallState() } as Record<string, unknown>;
    delete older.commitments;
    const read = readBackup(handMade(JSON.parse(canonicalJson(older))));
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.state.commitments).toBeUndefined();
    expect(read.state.transactions).toHaveLength(1);
  });

  it("Scenario: A зобов'язання on a рахунок outside the бекап stops the restore", () => {
    const outside = withCommitments();
    expect(
      inconsistent({
        ...outside,
        commitments: { ...outside.commitments!, plans: [{ ...netflix, debitAccountId: 'a-gone' }], links: [] },
      }),
    ).toContain('рахунок, якого в бекапі немає');
    expect(
      inconsistent({
        ...outside,
        commitments: { ...outside.commitments!, plans: [{ ...netflix, currency: 'USD' }], links: [] },
      }),
    ).toContain('у USD');
  });

  it("Scenario: One транзакція linked to a розстрочка and a зобов'язання stops the restore", () => {
    const both = withCommitments({
      installments: {
        plans: [
          {
            id: 'i-iphone',
            name: 'iPhone',
            total: 299_000,
            partsCount: 10,
            part: 29_900,
            firstDue: '2026-08-15',
            debitAccountId: 'a1',
            paidBefore: 0,
            recordedAt: 1,
          },
        ],
        links: [{ installmentId: 'i-iphone', number: 1, transactionId: 'aug' }],
        marks: [],
        refusals: [],
        reminderEnabled: true,
      },
    });
    expect(inconsistent(both)).toContain('двох платежів');
  });

  it('Scenario: A платіж said twice, or said after the stop, stops the restore', () => {
    const twice = withCommitments();
    expect(
      inconsistent({
        ...twice,
        commitments: {
          ...twice.commitments!,
          marks: [...twice.commitments!.marks, { commitmentId: 'c-netflix', number: 1, kind: 'paid' }],
        },
      }),
    ).toContain('більше ніж один стан');
    expect(
      inconsistent({
        ...twice,
        commitments: {
          ...twice.commitments!,
          marks: [{ commitmentId: 'c-netflix', number: 4, kind: 'skipped' }],
        },
      }),
    ).toContain('після дати припинення');
  });

  it('Scenario: A two-letter ознака stops the restore', () => {
    const short = withCommitments();
    expect(
      inconsistent({ ...short, commitments: { ...short.commitments!, plans: [{ ...netflix, marker: 'tv' }] } }),
    ).toContain('щонайменше 3 символи');
  });

  it('Scenario: A link outside the бекап stops the restore', () => {
    const outside = withCommitments();
    expect(
      inconsistent({
        ...outside,
        commitments: {
          ...outside.commitments!,
          links: [{ commitmentId: 'c-netflix', number: 1, transactionId: 't-gone' }],
        },
      }),
    ).toContain('транзакцію, якої в бекапі немає');
  });

  it('refuses a link to a витрата on another рахунок, and an unknown періодичність', () => {
    const elsewhere = withCommitments({
      transactions: [stored(debit('aug', '2026-08-15', 'a2')), stored(debit('other', '2026-08-16'))],
    });
    expect(inconsistent(elsewhere)).toContain('не є витратою з рахунку списання');
    const weekly = JSON.parse(canonicalJson(withCommitments())) as { commitments: { plans: { periodicity: string }[] } };
    weekly.commitments.plans[0]!.periodicity = 'weekly';
    expect(refusal(handMade(weekly)).kind).not.toBe('ok');
  });

  it("Scenario: A зобов'язання on a since-archived рахунок restores", () => {
    const archived = withCommitments({
      accounts: [{ ...uahAccount('a1', 'mono black'), archived: true }, uahAccount('a2', 'mono white')],
      categories: [{ id: 'c1', name: 'Підписки', archived: true }],
    });
    const read = readBackup(makeBackup(archived, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.state.commitments?.plans).toEqual([netflix]);
  });
});
