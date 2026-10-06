import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { NO_MERCHANTS } from '../domain/merchants';
import { money, type CurrencyCode } from '../domain/money';
import {
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  expenseByDefault,
  refund,
  type Income,
  type IsoDate,
  type Transaction,
} from '../domain/transaction';
import type { Draft } from '../notifications/draft';
import type { PossibleDuplicate } from '../observations/observation';
import {
  NOTHING_WAITS,
  QUEUE_PAGE,
  answerMonthFromRoute,
  answerQueue,
  answersRoute,
  queueRow,
  queueSubtitle,
  visibleEntries,
  type AnswerQueueInput,
} from './answer-queue';
import { monobankRailRow } from './home-screen';
import { ruleOffer } from './list-management';
import { observationLines } from './observations';
import { assignSource, offersTransferMark, recategorise } from './retype';

const TODAY: IsoDate = '2026-10-06';

let n = 0;
const id = (prefix: string) => `${prefix}${++n}`;

function expense(date: IsoDate, amount: number, over: { categoryId?: string; description?: string; accountId?: string; currency?: CurrencyCode; id?: string } = {}): Transaction {
  return expenseByDefault({
    id: over.id ?? id('e'),
    date,
    accountId: over.accountId ?? 'black',
    amount: money(amount, over.currency ?? 'UAH'),
    categoryId: over.categoryId ?? UNCATEGORISED_CATEGORY_ID,
    ...(over.description === undefined ? {} : { description: over.description }),
  });
}

function income(date: IsoDate, amount: number, sourceId = UNSOURCED_SOURCE_ID, description?: string): Income {
  return {
    type: 'income',
    id: id('i'),
    date,
    accountId: 'black',
    amount: money(amount, 'UAH'),
    sourceId,
    ...(description === undefined ? {} : { description }),
  };
}

function draft(date: IsoDate, over: Partial<Draft> = {}): Draft {
  return {
    id: id('d'),
    accountId: 'privat',
    currency: 'UAH',
    date,
    text: 'Оплата 250.00UAH. НОВИЙ ЗАКЛАД',
    proposal: { kind: 'expense', amount: money(25000, 'UAH') },
    ...over,
  };
}

function input(over: Partial<AnswerQueueInput> = {}): AnswerQueueInput {
  return {
    transactions: [],
    drafts: [],
    answers: [],
    linkedAccountIds: new Set(),
    bank: null,
    today: TODAY,
    ...over,
  };
}

const countsOf = (q: ReturnType<typeof answerQueue>) => q.groups.map((g) => [g.title, g.entries.length]);

describe('the queue holds six kinds of entry in one fixed order', () => {
  it('Scenario: Groups stand in order and empty ones are absent', () => {
    const transactions = [
      ...Array.from({ length: 7 }, (_, i) => expense(`2026-0${(i % 9) + 1}-10` as IsoDate, 1000 + i)),
      refund({ id: 'r1', date: '2026-09-11', accountId: 'black', amount: money(45000, 'UAH'), categoryId: UNCATEGORISED_CATEGORY_ID }),
    ];
    const q = answerQueue(input({ transactions, drafts: [draft('2026-10-05'), draft('2026-10-04')] }));
    expect(q.bank).toBeNull();
    expect(countsOf(q)).toEqual([
      ['Чернетки', 2],
      ['Без категорії', 8],
    ]);
  });

  it('Scenario: A переказ and a коригування are never asked about', () => {
    const lone = expense('2026-10-02', 4500, { accountId: 'cash' });
    const transactions: Transaction[] = [
      {
        type: 'transfer',
        id: 't1',
        date: '2026-10-01',
        fromAccountId: 'black',
        toAccountId: 'reserve',
        left: money(500000, 'UAH'),
        arrived: money(500000, 'UAH'),
      },
      { type: 'correction', id: 'c1', date: '2026-10-01', accountId: 'black', amount: money(-3000, 'UAH') },
      lone,
    ];
    const q = answerQueue(input({ transactions }));
    expect(q.groups).toEqual([{ kind: 'uncategorised', title: 'Без категорії', entries: [lone] }]);
  });

  it('Scenario: A повернення in «Без категорії» is a question, a дохід in «Зарплата» is not', () => {
    const rozetka = refund({ id: 'r1', date: '2026-10-03', accountId: 'black', amount: money(45000, 'UAH'), categoryId: UNCATEGORISED_CATEGORY_ID, description: 'Rozetka' });
    const salary = income('2026-10-01', 5000000, 'salary');
    const q = answerQueue(input({ transactions: [rozetka, salary] }));
    expect(q.groups).toEqual([{ kind: 'uncategorised', title: 'Без категорії', entries: [rozetka] }]);
  });

  it('Scenario: A дубль of three months ago is not in the unnarrowed queue', () => {
    const transactions = [
      expense('2026-07-03', 12500, { categoryId: 'food', description: 'Aroma Kava' }),
      expense('2026-07-04', 12500, { categoryId: 'food' }),
    ];
    expect(answerQueue(input({ transactions })).groups).toEqual([]);
    const narrowed = answerQueue(input({ transactions, month: '2026-07' }));
    expect(countsOf(narrowed)).toEqual([['Можливі дублі', 1]]);
  });

  it('Scenario: A pair across September and October is listed once', () => {
    const transactions = [
      expense('2026-09-30', 12500, { categoryId: 'food', description: 'Aroma Kava' }),
      expense('2026-10-01', 12500, { categoryId: 'food' }),
    ];
    const q = answerQueue(input({ transactions }));
    expect(countsOf(q)).toEqual([['Можливі дублі', 1]]);
  });

  it('a pair answered «Не дубль» is not asked again', () => {
    const a = expense('2026-10-03', 12500, { categoryId: 'food', description: 'Aroma Kava', id: 'a' });
    const b = expense('2026-10-04', 12500, { categoryId: 'food', description: 'кава', id: 'b' });
    expect(answerQueue(input({ transactions: [a, b], answers: [{ first: 'a', second: 'b' }] })).groups).toEqual([]);
  });

  it('nothing but the bank waiting is not «Нічого не чекає відповіді»', () => {
    const q = answerQueue(input({ bank: 'Немає токена monobank — дані 9 рахунків ще не синхронізовано' }));
    expect(q.groups).toEqual([]);
    expect(q.emptyMessage).toBeNull();
  });

  it('Scenario: Nothing waits', () => {
    const q = answerQueue(input({ transactions: [expense('2026-10-01', 100, { categoryId: 'food' })] }));
    expect(q.groups).toEqual([]);
    expect(q.total).toBe(0);
    expect(q.emptyMessage).toBe(NOTHING_WAITS);
    expect(q.monthLine).toBeNull();
  });

  it('«Без категорії» and «Без джерела» stand newest дата first', () => {
    const older = expense('2026-08-01', 100);
    const newer = expense('2026-10-01', 200);
    const q = answerQueue(input({ transactions: [older, newer] }));
    expect(q.groups[0]?.entries).toEqual([newer, older]);
  });
});

describe('every entry states its сума in its own currency and no group adds currencies', () => {
  it('Scenario: Two currencies in one group', () => {
    const uah = expense('2026-10-01', 12500);
    const usd = expense('2026-10-02', 1500, { currency: 'USD', accountId: 'usd' });
    const q = answerQueue(input({ transactions: [uah, usd] }));
    expect(countsOf(q)).toEqual([['Без категорії', 2]]);
    // Each entry keeps its own сума and currency; the group carries a count and no сума at all.
    const entries = q.groups[0]!.entries as readonly Transaction[];
    expect(entries.map((t) => (t.type === 'expense' ? t.amount : undefined))).toEqual([
      money(1500, 'USD'),
      money(12500, 'UAH'),
    ]);
    expect(Object.keys(q.groups[0]!)).toEqual(['kind', 'title', 'entries']);
  });
});

describe('the queue is a reading over stored state', () => {
  it('Scenario: Looking is not answering', () => {
    const transactions = [income('2026-10-01', 100), income('2026-10-02', 200), income('2026-10-03', 300)];
    const frozen = JSON.stringify(transactions);
    for (let i = 0; i < 5; i += 1) {
      expect(countsOf(answerQueue(input({ transactions })))).toEqual([['Без джерела', 3]]);
    }
    expect(JSON.stringify(transactions)).toBe(frozen);
  });

  it('Scenario: Categorising elsewhere empties the queue too', () => {
    const silpo = expense('2026-10-01', 12500, { description: 'СІЛЬПО Київ', id: 'silpo' });
    expect(countsOf(answerQueue(input({ transactions: [silpo] })))).toEqual([['Без категорії', 1]]);
    // The owner gave it «Продукти» from its editing; the queue, opened again, reads storage again.
    const categorised = { ...silpo, categoryId: 'food' } as Transaction;
    expect(answerQueue(input({ transactions: [categorised] })).groups).toEqual([]);
  });
});

describe('the bank the app cannot hear stands first', () => {
  const unheard = {
    configured: false,
    linked: 9,
    synced: 9,
    oldestSyncedAtMs: Date.UTC(2026, 8, 21, 9, 0, 0),
    syncing: false,
  };

  it('Scenario: Twelve days without a token lead the queue', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    const bank = monobankRailRow(unheard, now);
    const transactions = [expense('2026-10-01', 100), expense('2026-10-02', 200), expense('2026-10-03', 300)];
    const q = answerQueue(input({ transactions, bank, today: '2026-10-05' }));
    expect(q.bank).toBe('Немає токена monobank — дані 9 рахунків не оновлюються з 21 вересня');
    expect(countsOf(q)).toEqual([['Без категорії', 3]]);
    // The bank is not a record: the rail row's number counts the three витрати alone.
    expect(queueRow(q)).toEqual({ total: 3, label: 'Що потребує відповіді: 3', kinds: '3 без категорії' });
  });

  it('Scenario: A configured token clears the entry', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    const transactions = [expense('2026-10-01', 100)];
    const before = answerQueue(input({ transactions, bank: monobankRailRow(unheard, now), today: '2026-10-05' }));
    const after = answerQueue(input({ transactions, bank: monobankRailRow({ ...unheard, configured: true }, now), today: '2026-10-05' }));
    expect(before.bank).not.toBeNull();
    expect(after.bank).toBeNull();
    expect(after.groups).toEqual(before.groups);
  });
});

describe('the queue narrows to one місяць', () => {
  const september = [
    expense('2026-09-03', 15000),
    expense('2026-09-12', 15000),
    expense('2026-09-25', 15000),
    ...Array.from({ length: 9 }, (_, i) => income(`2026-09-${String(i + 10)}` as IsoDate, 1000 + i)),
  ];
  const october = [expense('2026-10-01', 500), expense('2026-10-02', 700)];

  it('Scenario: September only', () => {
    const narrowed = answerQueue(input({ transactions: [...september, ...october], month: '2026-09' }));
    expect(countsOf(narrowed)).toEqual([
      ['Без категорії', 3],
      ['Без джерела', 9],
    ]);
    expect(narrowed.narrowedTo).toEqual({ month: '2026-09', label: 'Вересень 2026' });
    expect(narrowed.monthLine).toBeNull();
    const whole = answerQueue(input({ transactions: [...september, ...october] }));
    expect(countsOf(whole)).toEqual([
      ['Без категорії', 5],
      ['Без джерела', 9],
    ]);
  });

  it('Scenario: September only — a malformed month narrows nothing', () => {
    expect(answerMonthFromRoute('2026-09')).toBe('2026-09');
    for (const asked of ['2026-13', 'вересень', '', undefined]) {
      expect(answerMonthFromRoute(asked)).toBeUndefined();
    }
    expect(answersRoute('2026-09')).toBe('/answers?month=2026-09');
    expect(answersRoute()).toBe('/answers');
  });

  it('Scenario: A clean narrowed month says so', () => {
    const answered = september.map((t) => (t.type === 'income' ? { ...t, sourceId: 'salary' } : { ...t, categoryId: 'food' })) as Transaction[];
    const q = answerQueue(input({ transactions: [...answered, ...october], month: '2026-09' }));
    expect(q.groups).toEqual([]);
    expect(q.emptyMessage).toBe('У вересні 2026 нічого не чекає відповіді');
  });

  it('a narrowed queue keeps the bank entry, which is about no місяць', () => {
    expect(answerQueue(input({ bank: 'Немає токена monobank', month: '2026-09' })).bank).toBe('Немає токена monobank');
  });
});

describe('the unnarrowed queue leads to the most recent finished month that is not clean', () => {
  it('Scenario: September is named in October', () => {
    const transactions = [
      ...Array.from({ length: 3 }, (_, i) => expense(`2026-09-0${i + 1}` as IsoDate, 100)),
      ...Array.from({ length: 9 }, (_, i) => income(`2026-09-1${i}` as IsoDate, 100)),
      expense('2026-10-01', 100, { categoryId: 'food' }),
    ];
    const q = answerQueue(input({ transactions }));
    expect(q.monthLine).toEqual({ month: '2026-09', remaining: 12, text: 'У вересні 2026 ще 12 без відповіді' });
    expect(answersRoute(q.monthLine!.month)).toBe('/answers?month=2026-09');
  });

  it('Scenario: A dismissed виклик does not hide the fact', () => {
    // The queue reads no виклик decision at all: one дохід «Без джерела» is the whole fact.
    const q = answerQueue(input({ transactions: [income('2026-09-20', 100)] }));
    expect(q.monthLine?.text).toBe('У вересні 2026 ще 1 без відповіді');
  });

  it('Scenario: A clean September shows no line', () => {
    const transactions = [
      expense('2026-09-20', 12500, { categoryId: 'food', description: 'Aroma Kava' }),
      expense('2026-09-21', 12500, { categoryId: 'food' }),
    ];
    const q = answerQueue(input({ transactions }));
    expect(q.monthLine).toBeNull();
    expect(countsOf(q)).toEqual([['Можливі дублі', 1]]);
  });

  it('a місяць holding only перекази is not активний, as «Закрий <місяць>» reads it', () => {
    const transactions: Transaction[] = [
      income('2026-08-20', 100),
      {
        type: 'transfer',
        id: 't-sep',
        date: '2026-09-10',
        fromAccountId: 'black',
        toAccountId: 'reserve',
        left: money(500, 'UAH'),
        arrived: money(500, 'UAH'),
      },
    ];
    expect(answerQueue(input({ transactions })).monthLine?.month).toBe('2026-08');
  });

  it('a чернетка dated in that місяць counts toward the line', () => {
    const q = answerQueue(input({ transactions: [expense('2026-09-20', 100, { categoryId: 'food' })], drafts: [draft('2026-09-28')] }));
    expect(q.monthLine?.remaining).toBe(1);
  });
});

describe('a long group shows its newest entries first and the rest on request', () => {
  it('Scenario: 127 unsourced доходи', () => {
    const transactions = Array.from({ length: 127 }, (_, i) => income('2026-10-01', 100 + i));
    const q = answerQueue(input({ transactions }));
    expect(countsOf(q)).toEqual([['Без джерела', 127]]);
    const unsourced = q.groups[0]!.entries as readonly Income[];
    const page = visibleEntries(unsourced, QUEUE_PAGE);
    expect(page.visible).toHaveLength(20);
    expect(page.more).toBe(107);
    expect(page.moreLabel).toBe('Показати ще (107)');
    expect(visibleEntries(unsourced, QUEUE_PAGE * 2).visible).toHaveLength(40);
  });

  it('Scenario: Answering keeps the place', () => {
    const transactions = Array.from({ length: 45 }, (_, i) =>
      expense(`2026-0${(i % 9) + 1}-${String(10 + (i % 18))}` as IsoDate, 100 + i),
    );
    const before = answerQueue(input({ transactions })).groups[0]!.entries as readonly Transaction[];
    const shown = 40;
    const beforeVisible = visibleEntries(before, shown).visible;
    const answered = beforeVisible[30]!;
    const after = answerQueue(input({ transactions: transactions.filter((t) => t.id !== answered.id) }));
    const afterEntries = after.groups[0]!.entries as readonly Transaction[];
    expect(afterEntries).toHaveLength(44);
    const afterVisible = visibleEntries(afterEntries, shown).visible;
    // The other thirty-nine stay in sight, in their order; the next one moves up into view.
    expect(afterVisible.slice(0, 39)).toEqual(beforeVisible.filter((t) => t.id !== answered.id));
  });
});

describe('every entry is answered where it stands', () => {
  const screen = readFileSync(new URL('../app/answers.tsx', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');

  it('the queue is a pushed route reading its month parameter', () => {
    expect(layout).toMatch(/<Stack\.Screen\s+name="answers"/);
    expect(screen).toContain('useLocalSearchParams<{ month?: string }>().month');
    expect(screen).toContain('useState<string>(answerMonthFromRoute(asked) ?? ANY)');
  });

  const pair = () => [
    expense('2026-10-03', 12500, { categoryId: 'food', description: 'Aroma Kava', id: 'p1' }),
    expense('2026-10-04', 12500, { categoryId: 'food', description: 'кава', id: 'p2' }),
  ];

  it('Scenario: «Не дубль» in the queue, then undone', () => {
    const transactions = pair();
    expect(countsOf(answerQueue(input({ transactions })))).toEqual([['Можливі дублі', 1]]);
    // Answered: gone from the queue (and from every surface reading the same answers).
    expect(answerQueue(input({ transactions, answers: [{ first: 'p1', second: 'p2' }] })).groups).toEqual([]);
    // The sole pair answered on this visit: «Можливі дублі» stays in place, holding no entry, so the
    // list keeps «Позначено: не дубль · Скасувати» to take — and nothing is counted for it.
    const kept = answerQueue(input({ transactions, answers: [{ first: 'p1', second: 'p2' }], keepDuplicates: true }));
    expect(countsOf(kept)).toEqual([['Можливі дублі', 0]]);
    expect(kept.total).toBe(0);
    expect(kept.emptyMessage).toBeNull();
    expect(queueRow(kept)).toBeNull();
    expect(screen).toContain('keepDuplicates: answeredHere,');
    expect(screen).toMatch(/onNotDuplicate: \(pair[^)]*\) => \{\s*setAnsweredHere\(true\);/);
    // «Скасувати» forgets the answer: listed again, and no answer is stored for it.
    expect(countsOf(answerQueue(input({ transactions, answers: [], keepDuplicates: true })))).toEqual([['Можливі дублі', 1]]);
    // The queue answers through the one shared seam the widget, Місяць and the підсумок use.
    expect(screen).toContain('const shared = useDuplicateAnswers(reload);');
    expect(screen).toMatch(/<ObservationsList[\s\S]*\{\.\.\.duplicateAnswers\}/);
  });

  it('Scenario: Either half of a pair opens its editing', () => {
    const [group] = answerQueue(input({ transactions: pair() })).groups;
    const [line] = observationLines(group!.entries as readonly PossibleDuplicate[], {
      categoryNames: new Map(),
      accountNames: new Map(),
      now: new Date('2026-10-06T12:00:00Z'),
    });
    expect(line!.halves!.map((h) => h.route)).toEqual(['/transaction/p1', '/transaction/p2']);
    expect(screen).toContain('onOpen={(route) => router.push(route)}');
  });

  it('Scenario: The queue merges and retypes nothing of a pair', () => {
    const transactions = pair();
    const frozen = JSON.stringify(transactions);
    answerQueue(input({ transactions }));
    expect(JSON.stringify(transactions)).toBe(frozen);
    // Nothing on the screen writes a транзакція but a категорія, a джерело and the shared answers.
    expect(screen.match(/transactionsRepo\.\w+\(/g)).toEqual(['transactionsRepo.save(', 'transactionsRepo.save(']);
  });

  it('Scenario: One of the two deleted from the queue', () => {
    const [kept] = pair();
    // «Видалити одну» deletes the chosen one as its editing would; the pair is then no pair.
    expect(answerQueue(input({ transactions: [kept!] })).groups).toEqual([]);
  });

  it('Scenario: One pick from the queue', () => {
    const silpo = expense('2026-10-01', 12500, { description: 'СІЛЬПО 123 Київ', id: 'silpo' });
    const picked = recategorise(silpo, 'food');
    expect(picked).toMatchObject({ id: 'silpo', categoryId: 'food', amount: money(12500, 'UAH') });
    expect(answerQueue(input({ transactions: [picked] })).groups).toEqual([]);
    expect(
      ruleOffer({ description: silpo.description, target: { kind: 'category', categoryId: 'food' }, rules: [], merchants: NO_MERCHANTS })?.merchant,
    ).toBe('сільпо');
    // Stored without editing opening, then the offer — never before the save.
    const categorise = screen.slice(screen.indexOf('const categorise = useCallback'));
    expect(categorise.indexOf('ruleOffer.raise(')).toBeGreaterThan(categorise.indexOf('transactionsRepo.save(recategorise(t, picked)'));
    expect(categorise.slice(0, categorise.indexOf('[haptics'))).not.toContain('router.push');
  });

  it('Scenario: «Це переказ» leaves the queue for editing', () => {
    expect(offersTransferMark({ type: 'expense' })).toBe(true);
    expect(screen).toContain('router.push(`/transaction/${t.id}?as=transfer`)');
  });

  it('Scenario: A повернення is offered категорії only', () => {
    expect(offersTransferMark({ type: 'refund' })).toBe(false);
    expect(screen).toMatch(/\{offersTransferMark\(t\) \? \(\s*<RowAction\s+title="Це переказ"/);
  });

  it('Scenario: Зарплата is given its джерело and remembered', () => {
    const salary = income('2026-10-01', 5_000_000, UNSOURCED_SOURCE_ID, 'Зарахування зарплати');
    const given = assignSource(salary, 'salary');
    expect(answerQueue(input({ transactions: [given] })).groups).toEqual([]);
    expect(
      ruleOffer({ description: salary.description, target: { kind: 'source', sourceId: 'salary' }, rules: [], merchants: NO_MERCHANTS })?.merchant,
    ).toBe('зарахування зарплати');
    const give = screen.slice(screen.indexOf('const giveSource = useCallback'));
    expect(give.indexOf("ruleOffer.raise({ description: t.description, target: { kind: 'source', sourceId: picked } })")).toBeGreaterThan(
      give.indexOf('transactionsRepo.save(assignSource(t, picked)'),
    );
  });

  it('Scenario: A refund that arrived as a дохід is retyped from editing', () => {
    // The entry's own tap opens its editing; the picker offers джерела alone.
    expect(screen).toContain('onPress={() => router.push(`/transaction/${t.id}`)}');
    expect(screen).toContain('const sourceRows = useMemo(() => sourceChoices(stored.sources), [stored.sources]);');
    expect(screen).toMatch(/label="Джерело"\s+rows=\{sourceRows\}/);
  });
});

describe('defects found on the emulator (answer-queue smoke, 2026-10-06)', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('D1: «Чернетки» stand newest дата first, whatever order they were drafted in', () => {
    // Storage hands them over newest drafted first: the one dated 2026-09-28 was drafted last.
    const late = draft('2026-09-28', { id: 'd-late' });
    const a = draft('2026-10-04', { id: 'd-a' });
    const b = draft('2026-10-04', { id: 'd-b' });
    const q = answerQueue(input({ drafts: [late, a, b] }));
    expect(q.groups[0]?.entries.map((d) => (d as Draft).id)).toEqual(['d-a', 'd-b', 'd-late']);
  });

  it('D2/D3: accepting the offer says what the розбір did, and the screen re-reads', () => {
    const hook = read('../hooks/use-rule-offer.ts');
    const accept = hook.slice(hook.indexOf('const accept = useCallback'));
    // The sentence `storeRule` returns is kept, not thrown away, and handed to the screen.
    expect(accept).toContain('const said = await storeRule(rule, rulesRepo.save);');
    expect(accept).toContain('if (onStored) onStored(said);');
    // The queue re-reads after a stored правило — its розбір may have answered other entries.
    const screen = read('../app/answers.tsx');
    expect(screen).toMatch(/useRuleOffer\(\s*reportBug,\s*useCallback\(\s*\(said: string \| undefined\) => \{[\s\S]*?reload\(\);/);
    // Головний and «Транзакції» say it in a dialog and re-read too; editing gets the hook's dialog.
    for (const other of ['../app/(tabs)/index.tsx', '../app/transactions.tsx']) {
      expect(read(other)).toContain('if (said) Alert.alert(RULE_STORED_TITLE, said);');
    }
    expect(hook).toContain('else if (said) Alert.alert(RULE_STORED_TITLE, said);');
    expect(screen).toContain('setSweptMessage(said);');
  });

  it('D4: a «Без категорії» entry names its рахунок, a повернення too', () => {
    const line = { type: 'повернення', accounts: 'гаманець', date: '2026-10-02' } as const;
    expect(queueSubtitle(line, new Date('2026-10-06T12:00:00Z'))).toBe('гаманець · повернення · 2 жовтня');
    const labelled = { type: 'витрата', accounts: 'гаманець', date: '2026-10-02', category: 'Без категорії' } as const;
    expect(queueSubtitle(labelled, new Date('2026-10-06T12:00:00Z'))).toBe('гаманець · 2 жовтня');
  });
});
