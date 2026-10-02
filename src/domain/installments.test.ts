import { describe, expect, it } from 'vitest';

import {
  installmentPartStates,
  installmentReminderDates,
  installmentRefusal,
  installmentSchedule,
  matchInstallmentDebits,
  NO_INSTALLMENT_FACTS,
  partsDueBefore,
  splitInstallment,
  type DebitCandidate,
  type Installment,
  type InstallmentFacts,
  type InstallmentInput,
  type InstallmentRefusalContext,
} from './installments';
import { money } from './money';
import { UNCATEGORISED_CATEGORY_ID } from './transaction';

const iphone: Installment = {
  id: 'i-iphone',
  name: 'iPhone',
  total: 1_000_000,
  partsCount: 10,
  part: 100_000,
  firstDue: '2026-06-05',
  debitAccountId: 'black',
  paidBefore: 4,
  categoryId: 'tech',
  recordedAt: 1_000,
};

function expense(
  id: string,
  date: string,
  amount: number,
  overrides: Partial<DebitCandidate> = {},
): DebitCandidate {
  return {
    id,
    type: 'expense',
    date,
    accountId: 'black',
    amount: money(amount, 'UAH'),
    categoryId: UNCATEGORISED_CATEGORY_ID,
    createdAt: 0,
    ...overrides,
  };
}

function facts(partial: Partial<InstallmentFacts>): InstallmentFacts {
  return { ...NO_INSTALLMENT_FACTS, ...partial };
}

describe('splitInstallment', () => {
  it('Scenario: An even split', () => {
    const split = splitInstallment(1_000_000, 10);
    expect(split).toEqual({ part: 100_000, last: 100_000 });
    const parts = installmentSchedule({ total: 1_000_000, partsCount: 10, part: split.part, firstDue: '2026-10-05' });
    expect(parts.map((p) => p.amount)).toEqual(Array(10).fill(100_000));
  });

  it('Scenario: The remainder falls on the last платіж', () => {
    const split = splitInstallment(100_000, 3);
    expect(split).toEqual({ part: 33_333, last: 33_334 });
    const parts = installmentSchedule({ total: 100_000, partsCount: 3, part: split.part, firstDue: '2026-10-05' });
    expect(parts.map((p) => p.amount)).toEqual([33_333, 33_333, 33_334]);
  });

  it('Scenario: A hand-set платіж moves the difference to the last', () => {
    expect(splitInstallment(1_000_000, 10, 105_000)).toEqual({ part: 105_000, last: 55_000 });
    const parts = installmentSchedule({ total: 1_000_000, partsCount: 10, part: 105_000, firstDue: '2026-10-05' });
    expect(parts.slice(0, 9).every((p) => p.amount === 105_000)).toBe(true);
    expect(parts[9]?.amount).toBe(55_000);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(1_000_000);
  });

  it('Scenario: Платежі that exceed the повна сума are refused', () => {
    expect(splitInstallment(1_000_000, 10, 112_000).last).toBeLessThanOrEqual(0);
    const refusal = installmentRefusal({ ...validInput, total: 1_000_000, part: 112_000 }, uahContext);
    expect(refusal?.field).toBe('part');
    expect(refusal?.message).toContain('більші за повну суму');
  });
});

const validInput: InstallmentInput = {
  name: 'iPhone',
  total: 4_999_900,
  partsCount: 10,
  part: 499_990,
  firstDue: '2026-10-05',
  debitAccountId: 'black',
  paidBefore: 0,
  categoryId: 'tech',
};

const uahContext: InstallmentRefusalContext = {
  account: { name: 'mono black', currency: 'UAH', archived: false },
  category: { name: 'Техніка', archived: false },
};

describe('installmentRefusal', () => {
  it('Scenario: A complete розстрочка is stored', () => {
    expect(installmentRefusal(validInput, uahContext)).toBeUndefined();
  });

  it('Scenario: A розстрочка on a foreign-currency рахунок is refused', () => {
    const refusal = installmentRefusal(validInput, {
      ...uahContext,
      account: { name: 'USD', currency: 'USD', archived: false },
    });
    expect(refusal).toEqual({ field: 'debitAccount', message: 'Рахунок списання має бути в гривнях.' });
  });

  it('Scenario: A розстрочка without a назва is refused', () => {
    const refusal = installmentRefusal({ ...validInput, name: '   ' }, uahContext);
    expect(refusal).toEqual({ field: 'name', message: 'Назвіть, що куплено.' });
  });

  it('Scenario: An archived рахунок or категорія is refused', () => {
    const onArchivedCard = installmentRefusal(validInput, {
      ...uahContext,
      account: { name: 'mono black', currency: 'UAH', archived: true },
    });
    expect(onArchivedCard?.field).toBe('debitAccount');
    expect(onArchivedCard?.message).toContain('«mono black» в архіві');

    const withArchivedCategory = installmentRefusal(validInput, {
      ...uahContext,
      category: { name: 'Техніка', archived: true },
    });
    expect(withArchivedCategory?.field).toBe('category');
    expect(withArchivedCategory?.message).toContain('«Техніка» в архіві');
  });

  it('keeps an archived рахунок or категорія the stored розстрочка already had', () => {
    expect(
      installmentRefusal(validInput, {
        account: { name: 'mono black', currency: 'UAH', archived: true },
        category: { name: 'Техніка', archived: true },
        existing: { debitAccountId: 'black', categoryId: 'tech' },
      }),
    ).toBeUndefined();
  });

  it('Scenario: One платіж is not a розстрочка', () => {
    const refusal = installmentRefusal({ ...validInput, partsCount: 1 }, uahContext);
    expect(refusal).toEqual({ field: 'partsCount', message: 'Кількість платежів — від 2 до 60.' });
    expect(installmentRefusal({ ...validInput, partsCount: 61 }, uahContext)?.field).toBe('partsCount');
  });

  it('Scenario: All платежі already paid is refused at creation', () => {
    const refusal = installmentRefusal({ ...validInput, paidBefore: 10 }, uahContext);
    expect(refusal).toEqual({
      field: 'paidBefore',
      message: 'Сплачено раніше може бути щонайбільше 9 з 10 платежів.',
    });
  });

  it('refuses a missing рахунок, a zero повна сума and a broken дата, each by its field', () => {
    expect(installmentRefusal({ ...validInput, total: 0 }, uahContext)?.field).toBe('total');
    expect(installmentRefusal({ ...validInput, part: 0 }, uahContext)?.field).toBe('part');
    expect(installmentRefusal({ ...validInput, firstDue: '2026-02-30' }, uahContext)?.field).toBe('firstDue');
    expect(installmentRefusal(validInput, { category: uahContext.category })?.field).toBe('debitAccount');
  });
});

describe('installmentSchedule', () => {
  it('Scenario: Monthly on the same day', () => {
    const parts = installmentSchedule({ total: 300_000, partsCount: 3, part: 100_000, firstDue: '2026-10-05' });
    expect(parts.map((p) => p.due)).toEqual(['2026-10-05', '2026-11-05', '2026-12-05']);
  });

  it('Scenario: The 31st in a shorter month', () => {
    const parts = installmentSchedule({ total: 300_000, partsCount: 3, part: 100_000, firstDue: '2027-01-31' });
    expect(parts.map((p) => p.due)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('crosses a year and lands on 29 February in a leap year', () => {
    const parts = installmentSchedule({ total: 400_000, partsCount: 4, part: 100_000, firstDue: '2027-11-30' });
    expect(parts.map((p) => p.due)).toEqual(['2027-11-30', '2027-12-30', '2028-01-30', '2028-02-29']);
  });

  it('counts the платежі dated before today for the form', () => {
    expect(partsDueBefore('2026-06-05', 10, '2026-10-01')).toBe(4);
    expect(partsDueBefore('2026-10-01', 10, '2026-10-01')).toBe(0);
    expect(partsDueBefore('2020-01-01', 10, '2026-10-01')).toBe(9);
  });
});

describe('installmentPartStates', () => {
  it('Scenario: Платежі counted as paid before', () => {
    const status = installmentPartStates(iphone, NO_INSTALLMENT_FACTS, '2026-10-01');
    expect(status.parts.slice(0, 4).map((p) => [p.state, p.reason])).toEqual(
      Array(4).fill(['paid', 'paidBefore']),
    );
    expect(status.parts[4]).toMatchObject({ number: 5, due: '2026-10-05', state: 'expected' });
    expect(status.paidCount).toBe(4);
    expect(status.remaining).toBe(600_000);
    expect(status.next?.number).toBe(5);
  });

  it('Scenario: A late debit is noticed', () => {
    expect(installmentPartStates(iphone, NO_INSTALLMENT_FACTS, '2026-10-08').parts[4]?.state).toBe('expected');
    expect(installmentPartStates(iphone, NO_INSTALLMENT_FACTS, '2026-10-09').parts[4]?.state).toBe('notFound');
  });

  it('Scenario: The last платіж closes the розстрочка', () => {
    const links = [5, 6, 7, 8, 9, 10].map((number) => ({
      installmentId: iphone.id,
      number,
      transactionId: `t${number}`,
    }));
    const status = installmentPartStates(iphone, facts({ links }), '2027-03-05');
    expect(status.paidOff).toBe(true);
    expect(status.remaining).toBe(0);
    expect(status.next).toBeUndefined();
  });

  it('Scenario: Paid off early', () => {
    const marks = [5, 6].map((number) => ({ installmentId: iphone.id, number }));
    const status = installmentPartStates({ ...iphone, closedOn: '2026-11-10' }, facts({ marks }), '2026-11-10');
    expect(status.closed).toBe(true);
    expect(status.parts.slice(6).map((p) => p.state)).toEqual(['closed', 'closed', 'closed', 'closed']);
    expect(status.remaining).toBe(0);
    const reminders = installmentReminderDates(status.parts, { date: '2026-11-10', minuteOfDay: 0 });
    expect(reminders).toEqual([]);
  });

  it('Scenario: Reopening a розстрочка closed by mistake', () => {
    // Six сплачено: four before, 5 and 6 marked; платіж 7 falls on 2026-12-05.
    const marks = [5, 6].map((number) => ({ installmentId: iphone.id, number }));
    const status = installmentPartStates(iphone, facts({ marks }), '2026-10-01');
    expect(status.parts[6]).toMatchObject({ due: '2026-12-05', state: 'expected' });
    expect(status.parts.slice(6).map((p) => p.state)).toEqual(Array(4).fill('expected'));
    expect(status.remaining).toBe(400_000);
  });

  it('Scenario: Shortening a розстрочка drops the extra платежі', () => {
    const twelve = { ...iphone, partsCount: 12, part: 80_000, total: 960_000, paidBefore: 0 };
    const marked = facts({ marks: [{ installmentId: iphone.id, number: 11 }] });
    expect(installmentPartStates(twelve, marked, '2026-06-01').parts[10]?.state).toBe('paid');
    const ten = installmentPartStates({ ...twelve, partsCount: 10, total: 800_000 }, marked, '2026-06-01');
    expect(ten.parts).toHaveLength(10);
    expect(ten.paidCount).toBe(0);
  });

  it('Scenario: Marked as paid without a debit', () => {
    const marked = installmentPartStates(
      iphone,
      facts({ marks: [{ installmentId: iphone.id, number: 5 }] }),
      '2026-10-20',
    );
    expect(marked.parts[4]).toMatchObject({ state: 'paid', reason: 'marked' });
    expect(marked.parts[4]?.transactionId).toBeUndefined();
    const unmarked = installmentPartStates(iphone, NO_INSTALLMENT_FACTS, '2026-10-20');
    expect(unmarked.parts[4]?.state).toBe('notFound');
  });
});

describe('matchInstallmentDebits — links', () => {
  const today = '2026-10-05';

  it('Scenario: A monobank debit becomes the платіж', () => {
    const match = matchInstallmentDebits({
      installments: [iphone],
      facts: NO_INSTALLMENT_FACTS,
      transactions: [expense('t1', '2026-10-05', 100_000)],
      today,
    });
    expect(match.link).toEqual([{ installmentId: iphone.id, number: 5, transactionId: 't1' }]);
    expect(match.categorise).toEqual([{ transactionId: 't1', categoryId: 'tech' }]);
    expect(match.drop).toEqual([]);
  });

  it('Scenario: A different сума is not a списання', () => {
    const match = matchInstallmentDebits({
      installments: [iphone],
      facts: NO_INSTALLMENT_FACTS,
      transactions: [expense('t1', '2026-10-05', 100_001)],
      today,
    });
    expect(match.link).toEqual([]);
  });

  it('Scenario: A переказ of the same сума is not a списання', () => {
    const match = matchInstallmentDebits({
      installments: [iphone],
      facts: NO_INSTALLMENT_FACTS,
      transactions: [{ id: 't1', type: 'transfer', date: '2026-10-05', createdAt: 0 }],
      today,
    });
    expect(match).toEqual({ link: [], drop: [], categorise: [] });
  });

  it('Scenario: Another рахунок is not the рахунок списання', () => {
    const match = matchInstallmentDebits({
      installments: [iphone],
      facts: NO_INSTALLMENT_FACTS,
      transactions: [expense('t1', '2026-10-05', 100_000, { accountId: 'white' })],
      today,
    });
    expect(match.link).toEqual([]);
  });

  it('Scenario: Two розстрочки of the same сума on the same day', () => {
    const vacuum: Installment = {
      id: 'i-vacuum',
      name: 'Пилосос',
      total: 150_000,
      partsCount: 3,
      part: 50_000,
      firstDue: '2026-10-05',
      debitAccountId: 'black',
      paidBefore: 0,
      recordedAt: 100,
    };
    const kettle: Installment = { ...vacuum, id: 'i-kettle', name: 'Чайник', recordedAt: 200 };
    const match = matchInstallmentDebits({
      // The later-recorded one first, so only the ordering — not the input order — decides.
      installments: [kettle, vacuum],
      facts: NO_INSTALLMENT_FACTS,
      transactions: [
        expense('second', '2026-10-05', 50_000, { createdAt: 20 }),
        expense('first', '2026-10-05', 50_000, { createdAt: 10 }),
      ],
      today,
    });
    expect(match.link).toEqual([
      { installmentId: 'i-vacuum', number: 1, transactionId: 'first' },
      { installmentId: 'i-kettle', number: 1, transactionId: 'second' },
    ]);
  });

  it('takes the candidate nearest the дата and ignores one more than three days away', () => {
    const match = matchInstallmentDebits({
      installments: [iphone],
      facts: NO_INSTALLMENT_FACTS,
      transactions: [
        expense('far', '2026-10-09', 100_000),
        expense('near', '2026-10-03', 100_000, { createdAt: 99 }),
        expense('nearer', '2026-10-06', 100_000, { createdAt: 50 }),
      ],
      today: '2026-10-10',
    });
    expect(match.link).toEqual([{ installmentId: iphone.id, number: 5, transactionId: 'nearer' }]);
  });

  it('Scenario: An unlinked debit is not taken back', () => {
    const match = matchInstallmentDebits({
      installments: [iphone],
      facts: facts({ refusals: [{ installmentId: iphone.id, number: 5, transactionId: 't1' }] }),
      transactions: [expense('t1', '2026-10-05', 100_000)],
      today,
    });
    expect(match.link).toEqual([]);
    const status = installmentPartStates(iphone, NO_INSTALLMENT_FACTS, today);
    expect(status.parts[4]?.state).not.toBe('paid');
  });

  it('Scenario: A витрата already linked to a зобов\'язання is not taken', () => {
    // installments, "A платіж is linked to its списання by the app": the витрата is the списання of
    // «Спортзал»'s платіж already, so платіж 5 of «iPhone» stays unlinked.
    const match = matchInstallmentDebits({
      installments: [iphone],
      facts: NO_INSTALLMENT_FACTS,
      transactions: [expense('gym', '2026-10-05', 100_000)],
      takenByCommitments: new Set(['gym']),
      today,
    });
    expect(match).toEqual({ link: [], drop: [], categorise: [] });
  });
});

describe('matchInstallmentDebits — drops and categorising', () => {
  const linkedT1 = facts({ links: [{ installmentId: iphone.id, number: 5, transactionId: 't1' }] });

  it('Scenario: A categorised витрата keeps its категорія', () => {
    const match = matchInstallmentDebits({
      installments: [iphone],
      facts: NO_INSTALLMENT_FACTS,
      transactions: [expense('t1', '2026-10-05', 100_000, { categoryId: 'gifts' })],
      today: '2026-10-05',
    });
    expect(match.link).toHaveLength(1);
    expect(match.categorise).toEqual([]);
  });

  it('Scenario: The owner\'s категорія after linking stands', () => {
    // Linked earlier, set back to «Без категорії» by the owner since.
    const match = matchInstallmentDebits({
      installments: [iphone],
      facts: linkedT1,
      transactions: [expense('t1', '2026-10-05', 100_000)],
      today: '2026-10-06',
    });
    expect(match).toEqual({ link: [], drop: [], categorise: [] });
  });

  it('Scenario: A debit retyped as a переказ releases its платіж', () => {
    const match = matchInstallmentDebits({
      installments: [iphone],
      facts: linkedT1,
      transactions: [{ id: 't1', type: 'transfer', date: '2026-10-05', createdAt: 0 }],
      today: '2026-10-06',
    });
    expect(match.drop).toEqual([{ installmentId: iphone.id, number: 5 }]);
    expect(match.link).toEqual([]);
  });

  it('Scenario: Moving the рахунок списання drops links on the old one', () => {
    const match = matchInstallmentDebits({
      installments: [{ ...iphone, debitAccountId: 'white' }],
      facts: linkedT1,
      transactions: [expense('t1', '2026-10-05', 100_000)],
      today: '2026-10-06',
    });
    expect(match.drop).toEqual([{ installmentId: iphone.id, number: 5 }]);
  });

  it('drops a link more than ten days from a moved дата, and keeps one within ten', () => {
    const moved = { ...iphone, firstDue: '2026-06-20' }; // платіж 5 now on 2026-10-20
    const dropped = matchInstallmentDebits({
      installments: [moved],
      facts: linkedT1,
      transactions: [expense('t1', '2026-10-05', 100_000)],
      today: '2026-10-06',
    });
    expect(dropped.drop).toEqual([{ installmentId: iphone.id, number: 5 }]);

    const nearby = { ...iphone, firstDue: '2026-06-15' }; // платіж 5 on 2026-10-15
    const kept = matchInstallmentDebits({
      installments: [nearby],
      facts: linkedT1,
      transactions: [expense('t1', '2026-10-05', 100_000)],
      today: '2026-10-06',
    });
    expect(kept.drop).toEqual([]);
  });

  it('drops the link of a removed транзакція and of a платіж beyond the кількість, even when closed', () => {
    const closed = { ...iphone, closedOn: '2026-10-10' };
    const match = matchInstallmentDebits({
      installments: [closed],
      facts: facts({
        links: [
          { installmentId: iphone.id, number: 5, transactionId: 'gone' },
          { installmentId: iphone.id, number: 11, transactionId: 't2' },
        ],
      }),
      transactions: [expense('t2', '2027-04-05', 100_000)],
      today: '2026-10-20',
    });
    expect(match.drop).toEqual([
      { installmentId: iphone.id, number: 5 },
      { installmentId: iphone.id, number: 11 },
    ]);
    expect(match.link).toEqual([]);
  });
});

describe('installmentReminderDates', () => {
  const vacuum: Installment = {
    id: 'i-vacuum',
    name: 'Пилосос',
    total: 150_000,
    partsCount: 3,
    part: 50_000,
    firstDue: '2026-10-05',
    debitAccountId: 'black',
    paidBefore: 0,
    recordedAt: 2,
  };
  const iphoneOct: Installment = { ...iphone, firstDue: '2026-10-05', paidBefore: 0, partsCount: 2, total: 200_000 };

  it('gives one reminder date for two parts on one дата', () => {
    const parts = [vacuum, iphoneOct].flatMap(
      (i) => installmentPartStates(i, NO_INSTALLMENT_FACTS, '2026-10-01').parts,
    );
    expect(installmentReminderDates(parts, { date: '2026-10-01', minuteOfDay: 600 })).toEqual([
      '2026-10-04',
      '2026-11-04',
      '2026-12-04',
    ]);
  });

  it('gives none for a paid part, and none once 10:00 the day before has passed', () => {
    const paid = installmentPartStates(
      { ...iphoneOct },
      facts({ links: [{ installmentId: iphoneOct.id, number: 1, transactionId: 't' }] }),
      '2026-10-03',
    ).parts;
    expect(installmentReminderDates(paid, { date: '2026-10-03', minuteOfDay: 0 })).toEqual(['2026-11-04']);

    const open = installmentPartStates(iphoneOct, NO_INSTALLMENT_FACTS, '2026-10-04').parts;
    expect(installmentReminderDates(open, { date: '2026-10-04', minuteOfDay: 599 })).toEqual([
      '2026-10-04',
      '2026-11-04',
    ]);
    expect(installmentReminderDates(open, { date: '2026-10-04', minuteOfDay: 600 })).toEqual(['2026-11-04']);
  });
});
