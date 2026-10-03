import { describe, expect, it } from 'vitest';

import {
  NO_COMMITMENT_FACTS,
  commitmentDues,
  commitmentProblems,
  commitmentRefusal,
  commitmentSchedule,
  factsDroppedByEdit,
  factsDroppedByStop,
  firstDueAfter,
  freeAfterCommitments,
  matchCommitmentDebits,
  nearestDue,
  normaliseMarker,
  owedByCurrency,
  type Commitment,
  type CommitmentFacts,
  type CommitmentInput,
  type CommitmentRefusalContext,
} from './commitments';
import {
  NO_INSTALLMENT_FACTS,
  installmentPartStates,
  type DebitCandidate,
  type Installment,
} from './installments';
import { money } from './money';
import { UNCATEGORISED_CATEGORY_ID } from './transaction';

// Every scenario here belongs to the `commitments` capability; about twenty titles repeat
// installments titles word for word, so the describe names the capability.

const internet: Commitment = {
  id: 'c-internet',
  name: 'Інтернет',
  amount: 30_000,
  currency: 'UAH',
  periodicity: 'monthly',
  firstDue: '2026-10-05',
  debitAccountId: 'black',
  categoryId: 'telecom',
  recordedAt: 1_000,
};

const netflix: Commitment = {
  id: 'c-netflix',
  name: 'Netflix',
  amount: 29_900,
  currency: 'UAH',
  periodicity: 'monthly',
  firstDue: '2026-10-15',
  debitAccountId: 'black',
  categoryId: 'subscriptions',
  marker: 'netflix',
  recordedAt: 2_000,
};

const rent: Commitment = {
  id: 'c-rent',
  name: 'Оренда',
  amount: 1_500_000,
  currency: 'UAH',
  periodicity: 'monthly',
  firstDue: '2026-10-10',
  debitAccountId: 'black',
  recordedAt: 3_000,
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

function facts(partial: Partial<CommitmentFacts>): CommitmentFacts {
  return { ...NO_COMMITMENT_FACTS, ...partial };
}

function dates(commitment: Commitment, until: string): string[] {
  return commitmentSchedule(commitment, until).map((d) => d.due);
}

function stateOf(commitment: Commitment, f: CommitmentFacts, number: number, today: string) {
  return commitmentDues(commitment, f, { until: firstDueAfter(commitment, today), today })[number - 1];
}

describe('commitments', () => {
  describe('refusals', () => {
    const black = { name: 'mono black', currency: 'UAH', archived: false };
    const input: CommitmentInput = {
      name: 'Netflix',
      amount: 29_900,
      periodicity: 'monthly',
      firstDue: '2026-10-15',
      debitAccountId: 'black',
      categoryId: 'subscriptions',
      marker: '  netflix ',
    };
    const context: CommitmentRefusalContext = {
      account: black,
      category: { name: 'Підписки', archived: false },
    };

    it('Scenario: A complete зобов\'язання is stored', () => {
      expect(commitmentProblems(input, context)).toEqual([]);
      expect(normaliseMarker(input.marker)).toBe('netflix');
      expect(normaliseMarker('   ')).toBeUndefined();
      expect(normaliseMarker(undefined)).toBeUndefined();
    });

    it('Scenario: A зобов\'язання on a USD card is in dollars', () => {
      const usd = { name: 'mono USD', currency: 'USD', archived: false };
      expect(
        commitmentRefusal({ ...input, name: 'ChatGPT', amount: 2_000, debitAccountId: 'usd', currency: 'USD' }, {
          ...context,
          account: usd,
        }),
      ).toBeUndefined();
      // A сума in another currency than the рахунок's is not a USD зобов'язання on a UAH card.
      expect(
        commitmentRefusal({ ...input, amount: 2_000, currency: 'USD' }, context),
      ).toEqual({ field: 'amount', message: 'Сума має бути у валюті рахунку списання «mono black» (UAH).' });
    });

    it('Scenario: A зобов\'язання without a назва is refused', () => {
      expect(commitmentRefusal({ ...input, name: '   ' }, context)).toEqual({
        field: 'name',
        message: 'Назвіть, за що цей платіж.',
      });
    });

    it('Scenario: A сума of zero is refused', () => {
      expect(commitmentRefusal({ ...input, amount: 0 }, context)).toEqual({
        field: 'amount',
        message: 'Сума має бути більшою за нуль.',
      });
      expect(commitmentRefusal({ ...input, amount: 1.5 }, context)?.field).toBe('amount');
      expect(commitmentRefusal({ ...input, amount: 100_000_000_000 }, context)?.message).toBe('Сума завелика.');
    });

    it('Scenario: An archived рахунок or категорія is refused', () => {
      expect(
        commitmentRefusal(input, { ...context, account: { ...black, archived: true } }),
      ).toEqual({
        field: 'debitAccount',
        message: 'Рахунок «mono black» в архіві — оберіть інший рахунок списання.',
      });
      expect(
        commitmentRefusal(input, { ...context, category: { name: 'Підписки', archived: true } }),
      ).toEqual({ field: 'category', message: 'Категорія «Підписки» в архіві — оберіть іншу.' });
      // Archived after it was recorded: editing it is not choosing it.
      expect(
        commitmentRefusal(input, {
          account: { ...black, archived: true },
          category: { name: 'Підписки', archived: true },
          existing: { debitAccountId: 'black', categoryId: 'subscriptions' },
        }),
      ).toBeUndefined();
    });

    it('Scenario: A two-letter ознака is refused', () => {
      expect(commitmentRefusal({ ...input, marker: 'tv' }, context)).toEqual({
        field: 'marker',
        message: 'Текст в описі списання — щонайменше 3 символи.',
      });
      expect(commitmentRefusal({ ...input, marker: ' tv  ' }, context)?.field).toBe('marker');
      expect(commitmentRefusal({ ...input, marker: 'hbo' }, context)).toBeUndefined();
    });

    it('refuses an unknown періодичність, a missing дата and a missing рахунок, each by its field', () => {
      const problems = commitmentProblems(
        { ...input, periodicity: 'weekly', firstDue: '2026-02-30', debitAccountId: '' },
        {},
      );
      expect(problems.map((p) => p.field)).toEqual(['periodicity', 'firstDue', 'debitAccount', 'category']);
    });
  });

  describe('графік', () => {
    it('Scenario: Monthly on the same day', () => {
      expect(dates(internet, '2027-02-28')).toEqual([
        '2026-10-05',
        '2026-11-05',
        '2026-12-05',
        '2027-01-05',
        '2027-02-05',
      ]);
    });

    it('Scenario: Quarterly', () => {
      const guard: Commitment = { ...internet, periodicity: 'quarterly', firstDue: '2026-10-20' };
      expect(dates(guard, '2027-10-20')).toEqual([
        '2026-10-20',
        '2027-01-20',
        '2027-04-20',
        '2027-07-20',
        '2027-10-20',
      ]);
    });

    it('Scenario: Yearly on the 29th of February', () => {
      const insurance: Commitment = { ...internet, periodicity: 'yearly', firstDue: '2028-02-29' };
      expect(dates(insurance, '2032-12-31')).toEqual([
        '2028-02-29',
        '2029-02-28',
        '2030-02-28',
        '2031-02-28',
        '2032-02-29',
      ]);
    });

    it('Scenario: The 31st in a shorter month', () => {
      const lease: Commitment = { ...rent, firstDue: '2027-01-31' };
      expect(dates(lease, '2027-03-31')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    });

    it('steps half a year at a time', () => {
      const halfYear: Commitment = { ...internet, periodicity: 'halfYearly', firstDue: '2026-08-31' };
      expect(dates(halfYear, '2027-08-31')).toEqual(['2026-08-31', '2027-02-28', '2027-08-31']);
    });

    it('has no платіж before the first or after the дата припинення', () => {
      expect(dates(internet, '2026-10-04')).toEqual([]);
      expect(dates({ ...internet, stoppedOn: '2026-12-04' }, '2027-06-30')).toEqual(['2026-10-05', '2026-11-05']);
      // The дата припинення itself still holds its платіж.
      expect(dates({ ...internet, stoppedOn: '2026-11-05' }, '2027-06-30')).toEqual(['2026-10-05', '2026-11-05']);
    });

    it('finds the first платіж after a дата, even the 31st after a 28th', () => {
      const lease: Commitment = { ...rent, firstDue: '2027-01-31' };
      expect(firstDueAfter(lease, '2027-02-28')).toBe('2027-03-31');
      expect(firstDueAfter(lease, '2026-06-01')).toBe('2027-01-31');
      expect(firstDueAfter(internet, '2026-10-05')).toBe('2026-11-05');
    });
  });

  describe('states', () => {
    it('Scenario: A late debit is noticed', () => {
      const due = commitmentDues(internet, NO_COMMITMENT_FACTS, { until: '2026-10-09', today: '2026-10-09' })[0];
      expect(due).toMatchObject({ number: 1, due: '2026-10-05', state: 'notFound', amount: 30_000, currency: 'UAH' });
    });

    it('Scenario: Within three days it is still expected', () => {
      const due = commitmentDues(internet, NO_COMMITMENT_FACTS, { until: '2026-10-08', today: '2026-10-08' })[0];
      expect(due?.state).toBe('expected');
    });

    it('Scenario: A skipped платіж is not owed', () => {
      const f = facts({ marks: [{ commitmentId: netflix.id, number: 1, kind: 'skipped' }] });
      const dues = commitmentDues(netflix, f, { until: '2026-10-31', today: '2026-10-15' });
      expect(dues[0]?.state).toBe('skipped');
      expect(nearestDue(dues)).toBeUndefined();
      expect(owedByCurrency(dues, '2026-10').size).toBe(0);
      const match = matchCommitmentDebits({
        commitments: [netflix],
        facts: f,
        transactions: [expense('t1', '2026-10-15', 29_900, { description: 'NETFLIX.COM' })],
        today: '2026-10-15',
      });
      expect(match.link).toEqual([]);
    });

    it('Scenario: Marked as paid without a debit', () => {
      const marked = facts({ marks: [{ commitmentId: rent.id, number: 1, kind: 'paid' }] });
      expect(stateOf(rent, marked, 1, '2026-10-20')).toMatchObject({ state: 'paid', reason: 'marked' });
      expect(stateOf(rent, NO_COMMITMENT_FACTS, 1, '2026-10-20')?.state).toBe('notFound');
    });

    it('Scenario: A skipped платіж taken back', () => {
      expect(stateOf(netflix, NO_COMMITMENT_FACTS, 1, '2026-10-16')?.state).toBe('expected');
    });

    it('orders by the найближчий платіж and reads a linked one as сплачено by its списання', () => {
      const f = facts({ links: [{ commitmentId: internet.id, number: 1, transactionId: 't1' }] });
      const dues = commitmentDues(internet, f, { until: '2026-11-05', today: '2026-10-20' });
      expect(dues[0]).toMatchObject({ state: 'paid', reason: 'debit', transactionId: 't1' });
      expect(nearestDue(dues)?.due).toBe('2026-11-05');
    });

    it('Scenario: Stopping before the next платіж', () => {
      const stopped: Commitment = { ...netflix, firstDue: '2026-09-15', stoppedOn: '2026-10-02' };
      const f = facts({ links: [{ commitmentId: netflix.id, number: 1, transactionId: 't-sep' }] });
      const dues = commitmentDues(stopped, f, { until: '2027-12-31', today: '2026-10-02' });
      expect(dues.map((d) => [d.due, d.state])).toEqual([['2026-09-15', 'paid']]);
    });

    it('Scenario: Resuming a зобов\'язання stopped by mistake', () => {
      const resumed: Commitment = { ...netflix, firstDue: '2026-09-15' };
      const dues = commitmentDues(resumed, NO_COMMITMENT_FACTS, {
        until: firstDueAfter(resumed, '2026-10-03'),
        today: '2026-10-03',
      });
      expect(dues.find((d) => d.due === '2026-10-15')?.state).toBe('expected');
    });

    it('Scenario: Resuming after months brings back the gap', () => {
      const resumed: Commitment = { ...netflix, firstDue: '2026-09-15' };
      const f = facts({ links: [{ commitmentId: netflix.id, number: 1, transactionId: 't-sep' }] });
      const dues = commitmentDues(resumed, f, { until: '2027-01-03', today: '2027-01-03' });
      expect(dues.map((d) => [d.due, d.state])).toEqual([
        ['2026-09-15', 'paid'],
        ['2026-10-15', 'notFound'],
        ['2026-11-15', 'notFound'],
        ['2026-12-15', 'notFound'],
      ]);
    });

    it('Scenario: A dearer підписка', () => {
      const dearer: Commitment = { ...netflix, amount: 34_900 };
      const f = facts({ links: [{ commitmentId: netflix.id, number: 1, transactionId: 't-oct' }] });
      const dues = commitmentDues(dearer, f, { until: '2026-11-15', today: '2026-10-20' });
      expect(dues[0]).toMatchObject({ due: '2026-10-15', state: 'paid', transactionId: 't-oct' });
      expect(dues[1]).toMatchObject({ due: '2026-11-15', amount: 34_900, state: 'expected' });
    });
  });

  describe('linking', () => {
    const today = '2026-10-06';

    it('Scenario: A debit of the exact сума becomes the платіж', () => {
      const match = matchCommitmentDebits({
        commitments: [internet],
        facts: NO_COMMITMENT_FACTS,
        transactions: [expense('t1', '2026-10-06', 30_000)],
        today,
      });
      expect(match).toEqual({
        link: [{ commitmentId: internet.id, number: 1, transactionId: 't1' }],
        drop: [],
        categorise: [{ transactionId: 't1', categoryId: 'telecom' }],
      });
    });

    it('Scenario: Without an ознака a different сума is not a списання', () => {
      const match = matchCommitmentDebits({
        commitments: [internet],
        facts: NO_COMMITMENT_FACTS,
        transactions: [expense('t1', '2026-10-06', 32_000)],
        today,
      });
      expect(match.link).toEqual([]);
    });

    it('Scenario: With an ознака the сума may differ', () => {
      const match = matchCommitmentDebits({
        commitments: [netflix],
        facts: NO_COMMITMENT_FACTS,
        transactions: [expense('t1', '2026-10-15', 34_900, { description: 'NETFLIX.COM' })],
        today: '2026-10-15',
      });
      expect(match.link).toEqual([{ commitmentId: netflix.id, number: 1, transactionId: 't1' }]);
    });

    it('Scenario: With an ознака the сума alone is not enough', () => {
      const match = matchCommitmentDebits({
        commitments: [netflix],
        facts: NO_COMMITMENT_FACTS,
        transactions: [expense('t1', '2026-10-15', 29_900, { description: 'Сільпо' })],
        today: '2026-10-15',
      });
      expect(match.link).toEqual([]);
    });

    it('Scenario: A повернення whose опис contains the ознака is not a списання', () => {
      const match = matchCommitmentDebits({
        commitments: [netflix],
        facts: NO_COMMITMENT_FACTS,
        transactions: [expense('t1', '2026-10-15', 29_900, { type: 'refund', description: 'Netflix refund' })],
        today: '2026-10-15',
      });
      expect(match).toEqual({ link: [], drop: [], categorise: [] });
    });

    it('Scenario: A переказ of the same сума is not a списання', () => {
      const match = matchCommitmentDebits({
        commitments: [rent],
        facts: NO_COMMITMENT_FACTS,
        transactions: [{ id: 't1', type: 'transfer', date: '2026-10-10', createdAt: 0 }],
        today: '2026-10-10',
      });
      expect(match).toEqual({ link: [], drop: [], categorise: [] });
    });

    it('Scenario: A коригування of the same сума is not a списання', () => {
      const match = matchCommitmentDebits({
        commitments: [internet],
        facts: NO_COMMITMENT_FACTS,
        transactions: [expense('t1', '2026-10-05', 30_000, { type: 'correction' })],
        today,
      });
      expect(match.link).toEqual([]);
    });

    it('Scenario: Another рахунок is not the рахунок списання', () => {
      const match = matchCommitmentDebits({
        commitments: [internet],
        facts: NO_COMMITMENT_FACTS,
        transactions: [expense('t1', '2026-10-05', 30_000, { accountId: 'white' })],
        today,
      });
      expect(match.link).toEqual([]);
    });

    it('takes only a витрата in the зобов\'язання\'s own currency', () => {
      const chatgpt: Commitment = { ...internet, id: 'c-gpt', amount: 2_000, currency: 'USD', debitAccountId: 'usd' };
      const match = matchCommitmentDebits({
        commitments: [chatgpt],
        facts: NO_COMMITMENT_FACTS,
        transactions: [
          expense('uah', '2026-10-05', 2_000, { accountId: 'usd' }),
          expense('usd', '2026-10-05', 2_000, { accountId: 'usd', amount: money(2_000, 'USD') }),
        ],
        today,
      });
      expect(match.link).toEqual([{ commitmentId: 'c-gpt', number: 1, transactionId: 'usd' }]);
    });

    it('Scenario: A розстрочка is served first', () => {
      // «iPhone» took the витрата in the same pass; its id arrives as taken.
      const gym: Commitment = { ...internet, id: 'c-gym', name: 'Спортзал', amount: 100_000 };
      const match = matchCommitmentDebits({
        commitments: [gym],
        facts: NO_COMMITMENT_FACTS,
        transactions: [expense('t1', '2026-10-05', 100_000)],
        takenByInstallments: new Set(['t1']),
        today,
      });
      expect(match.link).toEqual([]);
    });

    it('Scenario: A розстрочка recorded later does not take a linked витрата', () => {
      const gym: Commitment = { ...internet, id: 'c-gym', name: 'Спортзал', amount: 100_000 };
      const match = matchCommitmentDebits({
        commitments: [gym],
        facts: facts({ links: [{ commitmentId: gym.id, number: 1, transactionId: 't1' }] }),
        transactions: [expense('t1', '2026-10-05', 100_000)],
        today,
      });
      // The kept link stands and is not dropped; the розстрочка's own pass sees it as taken.
      expect(match).toEqual({ link: [], drop: [], categorise: [] });
    });

    it('Scenario: An unlinked debit is not taken back', () => {
      const match = matchCommitmentDebits({
        commitments: [internet],
        facts: facts({ refusals: [{ commitmentId: internet.id, number: 1, transactionId: 't1' }] }),
        transactions: [expense('t1', '2026-10-05', 30_000)],
        today,
      });
      expect(match.link).toEqual([]);
      expect(stateOf(internet, NO_COMMITMENT_FACTS, 1, today)?.state).not.toBe('paid');
    });

    it('serves платежі by дата, then recordedAt, then number, each taking the nearest candidate', () => {
      const early: Commitment = { ...internet, id: 'c-early', recordedAt: 10 };
      const late: Commitment = { ...internet, id: 'c-late', recordedAt: 20 };
      const match = matchCommitmentDebits({
        commitments: [late, early],
        facts: NO_COMMITMENT_FACTS,
        transactions: [
          expense('far', '2026-10-08', 30_000),
          expense('second', '2026-10-05', 30_000, { createdAt: 20 }),
          expense('first', '2026-10-05', 30_000, { createdAt: 10 }),
          expense('out', '2026-10-09', 30_000),
        ],
        today: '2026-10-10',
      });
      expect(match.link).toEqual([
        { commitmentId: 'c-early', number: 1, transactionId: 'first' },
        { commitmentId: 'c-late', number: 1, transactionId: 'second' },
      ]);
    });

    it('links a stopped зобов\'язання\'s платіж up to the stop, and none after it', () => {
      const stopped: Commitment = { ...internet, stoppedOn: '2026-10-20' };
      const match = matchCommitmentDebits({
        commitments: [stopped],
        facts: NO_COMMITMENT_FACTS,
        transactions: [expense('oct', '2026-10-05', 30_000), expense('nov', '2026-11-05', 30_000)],
        today: '2026-11-06',
      });
      expect(match.link).toEqual([{ commitmentId: internet.id, number: 1, transactionId: 'oct' }]);
    });
  });

  describe('drops and categorising', () => {
    it('Scenario: A categorised витрата keeps its категорія', () => {
      const match = matchCommitmentDebits({
        commitments: [internet],
        facts: NO_COMMITMENT_FACTS,
        transactions: [expense('t1', '2026-10-05', 30_000, { categoryId: 'work' })],
        today: '2026-10-05',
      });
      expect(match.link).toHaveLength(1);
      expect(match.categorise).toEqual([]);
    });

    it('Scenario: The owner\'s категорія after linking stands', () => {
      const match = matchCommitmentDebits({
        commitments: [internet],
        facts: facts({ links: [{ commitmentId: internet.id, number: 1, transactionId: 't1' }] }),
        transactions: [expense('t1', '2026-10-05', 30_000)],
        today: '2026-10-05',
      });
      expect(match).toEqual({ link: [], drop: [], categorise: [] });
    });

    it('Scenario: A debit retyped as a переказ releases its платіж', () => {
      const match = matchCommitmentDebits({
        commitments: [rent],
        facts: facts({ links: [{ commitmentId: rent.id, number: 1, transactionId: 't1' }] }),
        transactions: [{ id: 't1', type: 'transfer', date: '2026-10-10', createdAt: 0 }],
        today: '2026-10-12',
      });
      expect(match.drop).toEqual([{ commitmentId: rent.id, number: 1 }]);
      expect(match.link).toEqual([]);
    });

    it('Scenario: A deleted debit releases its платіж', () => {
      const match = matchCommitmentDebits({
        commitments: [internet],
        facts: facts({ links: [{ commitmentId: internet.id, number: 1, transactionId: 'gone' }] }),
        transactions: [],
        today: '2026-10-20',
      });
      expect(match.drop).toEqual([{ commitmentId: internet.id, number: 1 }]);
      expect(stateOf(internet, NO_COMMITMENT_FACTS, 1, '2026-10-20')?.state).toBe('notFound');
    });

    it('Scenario: Moving the рахунок списання drops links on the old one', () => {
      const moved: Commitment = { ...internet, debitAccountId: 'white' };
      const match = matchCommitmentDebits({
        commitments: [moved],
        facts: facts({ links: [{ commitmentId: internet.id, number: 1, transactionId: 't1' }] }),
        transactions: [expense('t1', '2026-10-05', 30_000)],
        today: '2026-10-06',
      });
      expect(match.drop).toEqual([{ commitmentId: internet.id, number: 1 }]);
    });

    it('Scenario: Moving the дата першого платежу drops a far link', () => {
      const moved: Commitment = { ...internet, firstDue: '2026-10-20' };
      const match = matchCommitmentDebits({
        commitments: [moved],
        facts: facts({ links: [{ commitmentId: internet.id, number: 1, transactionId: 't1' }] }),
        transactions: [expense('t1', '2026-10-05', 30_000)],
        today: '2026-10-21',
      });
      expect(match.drop).toEqual([{ commitmentId: internet.id, number: 1 }]);
    });

    it('Scenario: Changing how often drops what was said about moved платежі', () => {
      const guard: Commitment = { ...internet, id: 'c-guard', name: 'Охорона', firstDue: '2026-10-20' };
      const f = facts({
        marks: [
          { commitmentId: guard.id, number: 1, kind: 'paid' },
          { commitmentId: guard.id, number: 2, kind: 'skipped' },
        ],
        refusals: [{ commitmentId: guard.id, number: 2, transactionId: 't9' }],
      });
      const quarterly: Commitment = { ...guard, periodicity: 'quarterly' };
      const dropped = factsDroppedByEdit(guard, quarterly, f);
      expect(dropped).toEqual({
        links: [],
        marks: [{ commitmentId: guard.id, number: 2, kind: 'skipped' }],
        refusals: [{ commitmentId: guard.id, number: 2, transactionId: 't9' }],
      });
      const kept = facts({ marks: [{ commitmentId: guard.id, number: 1, kind: 'paid' }] });
      const dues = commitmentDues(quarterly, kept, { until: '2027-01-20', today: '2026-10-21' });
      expect(dues[1]).toMatchObject({ number: 2, due: '2027-01-20', state: 'expected' });
    });

    it('keeps what was said about a платіж the edit moves by ten days or less', () => {
      const f = facts({ marks: [{ commitmentId: internet.id, number: 2, kind: 'skipped' }] });
      expect(factsDroppedByEdit(internet, { ...internet, firstDue: '2026-10-15' }, f).marks).toEqual([]);
    });

    it('Scenario: Editing a stopped зобов\'язання drops what falls after the stop', () => {
      const before: Commitment = { ...netflix, firstDue: '2026-08-15', stoppedOn: '2026-10-20' };
      const after: Commitment = { ...before, firstDue: '2026-08-22' };
      const f = facts({ marks: [{ commitmentId: netflix.id, number: 3, kind: 'paid' }] });
      // Seven days is not a move the edit itself drops for…
      expect(factsDroppedByEdit(before, after, f).marks).toEqual([]);
      // …but платіж 3 now falls on 2026-10-22, after the stop.
      expect(factsDroppedByStop(after, '2026-10-20', f).marks).toEqual([
        { commitmentId: netflix.id, number: 3, kind: 'paid' },
      ]);
      expect(dates(after, '2027-12-31')).toEqual(['2026-08-22', '2026-09-22']);
    });

    it('Scenario: Stopping removes what was said about later платежі', () => {
      const f = facts({
        links: [{ commitmentId: netflix.id, number: 1, transactionId: 't-oct' }],
        marks: [{ commitmentId: netflix.id, number: 2, kind: 'skipped' }],
        refusals: [{ commitmentId: netflix.id, number: 3, transactionId: 't-x' }],
      });
      expect(factsDroppedByStop(netflix, '2026-10-20', f)).toEqual({
        links: [],
        marks: [{ commitmentId: netflix.id, number: 2, kind: 'skipped' }],
        refusals: [{ commitmentId: netflix.id, number: 3, transactionId: 't-x' }],
      });
      // Resumed the next day, with those facts gone: платіж 2 is just what its дата says.
      const kept = facts({ links: [{ commitmentId: netflix.id, number: 1, transactionId: 't-oct' }] });
      const dues = commitmentDues(netflix, kept, { until: '2026-11-15', today: '2026-10-21' });
      expect(dues[1]).toMatchObject({ due: '2026-11-15', state: 'expected' });
      expect(dues[1]?.reason).toBeUndefined();
    });
  });

  describe('Вільно після зобов\'язань', () => {
    const october = '2026-10';
    const iphone: Installment = {
      id: 'i-iphone',
      name: 'iPhone',
      total: 1_000_000,
      partsCount: 10,
      part: 100_000,
      firstDue: '2026-10-20',
      debitAccountId: 'black',
      paidBefore: 0,
      recordedAt: 1,
    };
    const parts = (installment: Installment, today: string) =>
      installmentPartStates(installment, NO_INSTALLMENT_FACTS, today).parts.map((p) => ({ ...p, currency: 'UAH' }));
    const duesOf = (commitment: Commitment, f: CommitmentFacts, today: string) =>
      commitmentDues(commitment, f, { until: '2026-10-31', today });
    const uah = (amount: number) => new Map([['UAH', money(amount, 'UAH')]]);

    it('Scenario: Оренда, інтернет and a розстрочка', () => {
      const today = '2026-10-08';
      const paidInternet = facts({ links: [{ commitmentId: internet.id, number: 1, transactionId: 't1' }] });
      const owed = owedByCurrency(
        [...duesOf(rent, NO_COMMITMENT_FACTS, today), ...duesOf(internet, paidInternet, today), ...parts(iphone, today)],
        october,
      );
      expect(owed).toEqual(new Map([['UAH', 1_600_000]]));
      const left = uah(2_000_000);
      expect(freeAfterCommitments(left, owed, october, today)).toEqual(uah(400_000));
      expect(left.get('UAH')?.amount).toBe(2_000_000);
    });

    it('Scenario: Every currency on its own', () => {
      const chatgpt: Commitment = { ...internet, id: 'c-gpt', amount: 2_000, currency: 'USD', debitAccountId: 'usd' };
      const owed = owedByCurrency(duesOf(chatgpt, NO_COMMITMENT_FACTS, '2026-10-05'), october);
      const left = new Map([
        ['USD', money(50_000, 'USD')],
        ['UAH', money(2_000_000, 'UAH')],
      ]);
      expect(freeAfterCommitments(left, owed, october, '2026-10-05')).toEqual(
        new Map([['USD', money(48_000, 'USD')]]),
      );
    });

    it('Scenario: A skipped платіж is not subtracted', () => {
      const skipped = facts({ marks: [{ commitmentId: netflix.id, number: 1, kind: 'skipped' }] });
      const owed = owedByCurrency(duesOf(netflix, skipped, '2026-10-15'), october);
      expect(freeAfterCommitments(uah(2_000_000), owed, october, '2026-10-15').size).toBe(0);
    });

    it('Scenario: A missing debit is still owed', () => {
      const owed = owedByCurrency(duesOf(rent, NO_COMMITMENT_FACTS, '2026-10-15'), october);
      expect(duesOf(rent, NO_COMMITMENT_FACTS, '2026-10-15')[0]?.state).toBe('notFound');
      expect(freeAfterCommitments(uah(2_000_000), owed, october, '2026-10-15')).toEqual(uah(500_000));
    });

    it('Scenario: A past month has none', () => {
      const september: Commitment = { ...rent, firstDue: '2026-09-10' };
      const dues = commitmentDues(september, NO_COMMITMENT_FACTS, { until: '2026-09-30', today: '2026-10-10' });
      expect(dues[0]?.state).toBe('notFound');
      const owed = owedByCurrency(dues, '2026-09');
      expect(freeAfterCommitments(uah(100), owed, '2026-09', '2026-10-10').size).toBe(0);
    });

    it('has no reading for a currency without a залишилось', () => {
      const owed = owedByCurrency(duesOf(rent, NO_COMMITMENT_FACTS, '2026-10-08'), october);
      expect(freeAfterCommitments(new Map([['USD', money(100, 'USD')]]), owed, october, '2026-10-08').size).toBe(0);
    });

    it('with only розстрочки owed gives the UAH сума «Вільно після розстрочок» gave', () => {
      // installments, REMOVED "Вільно після розстрочок…", Migration: the UAH залишилось less the
      // month's розстрочка платежі still очікується or списання не знайдено — written out here as
      // the removed reading computed it, the oracle the new one must equal.
      const vacuum: Installment = { ...iphone, id: 'i-vacuum', total: 150_000, partsCount: 3, part: 50_000 };
      const iphoneOct: Installment = { ...iphone, firstDue: '2026-10-05' };
      const linked = { ...NO_INSTALLMENT_FACTS, links: [{ installmentId: iphoneOct.id, number: 1, transactionId: 't1' }] };
      const all = [
        ...installmentPartStates(iphoneOct, linked, '2026-10-10').parts,
        ...installmentPartStates(vacuum, NO_INSTALLMENT_FACTS, '2026-10-10').parts,
      ];
      const stillOwed = all
        .filter((p) => p.due.startsWith(october) && (p.state === 'expected' || p.state === 'notFound'))
        .reduce((sum, p) => sum + p.amount, 0);
      const before = 2_000_000 - stillOwed;
      const owed = owedByCurrency(all.map((p) => ({ ...p, currency: 'UAH' })), october);
      expect(freeAfterCommitments(uah(2_000_000), owed, october, '2026-10-10')).toEqual(uah(before));
      expect(before).toBe(1_950_000);
      // A закрито платіж is not owed either.
      const closed = installmentPartStates({ ...vacuum, closedOn: '2026-10-01' }, NO_INSTALLMENT_FACTS, '2026-10-10');
      expect(owedByCurrency(closed.parts.map((p) => ({ ...p, currency: 'UAH' })), october).size).toBe(0);
    });
  });
});
