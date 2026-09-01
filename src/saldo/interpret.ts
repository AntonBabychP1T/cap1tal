import type { AccountKind } from '../domain/account';
import { money, type CurrencyCode, type Money } from '../domain/money';
import {
  expenseByDefault,
  FEES_CATEGORY_ID,
  refund,
  transfer,
  type Correction,
  type Income,
  type IsoDate,
  type Transaction,
} from '../domain/transaction';
import {
  EXPENSES,
  INCOME,
  isRealAccountType,
  legEffect,
  MONEY_ON_THE_WAY,
  type SaldoLeg,
  type SaldoTransaction,
} from './parse';
import {
  accountKey,
  BALANCE_CORRECTION_NAME,
  debtLegOf,
  EMPTY_EXISTING,
  FEES_NAME,
  flattenName,
  isInitialBalance,
  namesToCreate,
  DEBT_ACCOUNT_NAME,
  debtAccountId,
  NO_DECISIONS,
  reservedCategoryFor,
  resolveAccountMap,
  resolveNames,
  type Decisions,
  type ExistingState,
  type NameProposal,
  type RejectedRedirect,
  type ResolvedAccount,
  type Survey,
} from './survey';

/**
 * Double-entry legs become cap1tal транзакції. The rule that decides everything: a рахунок must
 * end up moved by exactly what its own real leg says — which is why the fee of an in-transit
 * transfer becomes a separate витрата instead of shrinking the переказ, and why a повернення
 * keeps the рахунок-currency amount and drops the other one.
 *
 * Nothing here throws on a shape it does not know: an unrecognised transaction becomes no
 * транзакція and every one of its real legs is listed as unexplained, where the verification
 * report turns it into a visible difference on exactly one рахунок. Silence is the only failure.
 */

export interface PlannedAccount {
  readonly id: string;
  readonly name: string;
  readonly kind: AccountKind;
  readonly currency: CurrencyCode;
  readonly openingBalance: Money;
  /** Set when this is a рахунок that already exists rather than one the plan creates. */
  readonly existingId?: string;
  /** The початковий залишок the plan proposes to replace, so the report can show it. */
  readonly replacedOpeningBalance?: Money;
}

/** One транзакція of the plan, with the export rows it came from. */
export interface PlannedTransaction {
  readonly transaction: Transaction;
  /** The source Transaction ID(s): a pair for a collapsed in-transit переказ. */
  readonly saldoIds: readonly string[];
}

export type UnexplainedReason =
  | 'unpaired-in-transit'
  | 'merged-account-move'
  | 'unrecognised-shape'
  | 'dropped-original-amount'
  | 'zero-only-pair'
  | 'accrual-month-divergence';

/**
 * A row the plan does not turn into money moving. `effect` is what the рахунок named by
 * `accountId` therefore fails to move by — signed in that рахунок's currency — which is exactly
 * the difference the verification report will show. An informational row carries neither, and a
 * move both of whose ends were merged onto one рахунок carries both halves, which cancel.
 */
export interface UnexplainedRow {
  readonly reason: UnexplainedReason;
  readonly transactionId: string;
  readonly row: number;
  readonly date: IsoDate | '';
  readonly detail: string;
  readonly accountId?: string;
  readonly effect?: Money;
}

export interface ImportPlan {
  readonly accounts: readonly PlannedAccount[];
  /**
   * (Saldo account, currency) key → the id of the рахунок its legs landed on. The verification
   * report reads the export back through this, so it needs no second look at the decisions.
   */
  readonly accountKeys: Readonly<Record<string, string>>;
  readonly categories: readonly NameProposal[];
  readonly sources: readonly NameProposal[];
  readonly transactions: readonly PlannedTransaction[];
  readonly unexplained: readonly UnexplainedRow[];
  readonly rejectedRedirects: readonly RejectedRedirect[];
}

/** The normalised datetime as a comparable instant. Arithmetic on the text, never a clock read. */
function instantOf(datetime: string): number {
  const [day = '', time = ''] = datetime.split('T');
  const [year, month, date] = day.split('-').map(Number);
  const [hour = '0', minute = '0', rest = '0.0'] = time.split(':');
  const [second = '0', millis = '0'] = rest.split('.');
  return Date.UTC(
    year ?? 0,
    (month ?? 1) - 1,
    date ?? 1,
    Number(hour),
    Number(minute),
    Number(second),
    Number(millis),
  );
}

interface Placed {
  readonly planned: PlannedTransaction;
  readonly datetime: string;
  readonly row: number;
  /** Orders the extra витрата «Комісія» after the переказ it belongs to. */
  readonly seq: number;
}

interface InTransitSide {
  readonly transaction: SaldoTransaction;
  readonly real: SaldoLeg;
  readonly inTransit: SaldoLeg;
  readonly fee?: SaldoLeg;
  readonly sourceName: string;
  readonly destinationName: string;
}

/**
 * Departures and arrivals bucket by endpoints and the amount actually in transit. The parts are
 * joined on a character no account name can hold, so "A B" to "C" never keys the same as "A" to
 * "B C".
 */
function inTransitKey(side: InTransitSide): string {
  return [
    side.sourceName,
    side.destinationName,
    side.inTransit.amount.amount,
    side.inTransit.amount.currency,
  ].join('\u0000');
}

export function interpret(input: {
  transactions: readonly SaldoTransaction[];
  survey: Survey;
  decisions?: Decisions;
  existing?: ExistingState;
}): ImportPlan {
  const { transactions, survey: surveyed } = input;
  const decisions = input.decisions ?? NO_DECISIONS;
  const existing = input.existing ?? EMPTY_EXISTING;

  const accountMap = resolveAccountMap(surveyed, decisions, existing);
  const categoryIds = resolveNames(
    surveyed.categories,
    decisions.categoryRedirects,
    existing.categories,
  );
  const sourceIds = resolveNames(surveyed.sources, decisions.sourceRedirects, existing.sources);
  const existingAccounts = new Map(existing.accounts.map((account) => [account.id, account]));

  const placed: Placed[] = [];
  const unexplained: UnexplainedRow[] = [];
  const openingContributions = new Map<string, number>();
  /** The «Борги» рахунки the plan needs, by currency, in the order the export reaches for them. */
  const debtAccounts = new Map<string, ResolvedAccount>();

  const accountOf = (leg: SaldoLeg): ResolvedAccount | undefined =>
    accountMap.byKey.get(accountKey(leg.account, leg.amount.currency));

  const note = (
    reason: UnexplainedReason,
    leg: SaldoLeg,
    detail: string,
    account?: ResolvedAccount,
  ): void => {
    unexplained.push({
      reason,
      transactionId: leg.transactionId,
      row: leg.row,
      date: leg.date,
      detail,
      ...(account ? { accountId: account.id, effect: legEffect(leg) } : {}),
    });
  };

  /** Every real leg of a transaction the plan gives up on still has to show up somewhere. */
  const giveUp = (
    transaction: SaldoTransaction,
    reason: UnexplainedReason,
    detail: string,
  ): void => {
    const realLegs = transaction.legs.filter((leg) => isRealAccountType(leg.accountType));
    if (realLegs.length === 0) {
      note(reason, transaction.legs[0] as SaldoLeg, detail);
      return;
    }
    for (const leg of realLegs) {
      note(reason, leg, detail, accountOf(leg));
    }
  };

  /**
   * Build a транзакція through the domain's own factory. The domain owns invariants this module
   * must not restate — a переказ's legs are positive, a повернення's amount is positive — and a
   * shape it rejects is exactly a shape the import has no rule for: reported, never thrown.
   */
  const built = <T extends Transaction>(
    source: readonly SaldoTransaction[],
    make: () => T,
  ): T | undefined => {
    try {
      return make();
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      for (const transaction of source) {
        giveUp(transaction, 'unrecognised-shape', `the domain rejects this shape: ${why}`);
      }
      return undefined;
    }
  };

  const add = (
    transaction: Transaction,
    saldoIds: readonly string[],
    at: { datetime: string; row: number },
    seq = 0,
  ): void => {
    placed.push({ planned: { transaction, saldoIds }, datetime: at.datetime, row: at.row, seq });
  };

  // The in-transit sides, collected first so they can be paired against each other.
  const departures: InTransitSide[] = [];
  const arrivals: InTransitSide[] = [];
  const plain: SaldoTransaction[] = [];

  for (const transaction of transactions) {
    const inTransit = transaction.legs.find((leg) => leg.accountType === MONEY_ON_THE_WAY);
    if (!inTransit) {
      plain.push(transaction);
      continue;
    }
    const real = transaction.legs.find((leg) => isRealAccountType(leg.accountType));
    if (!real) {
      giveUp(transaction, 'unrecognised-shape', 'an in-transit transaction with no real leg');
      continue;
    }
    if (inTransit.journalType === 'DEBIT' && real.journalType === 'CREDIT') {
      const fee = transaction.legs.find(
        (leg) => leg.accountType === EXPENSES && leg.account === FEES_NAME,
      );
      departures.push({
        transaction,
        real,
        inTransit,
        ...(fee ? { fee } : {}),
        // The in-transit leg is named after the other end of the move.
        sourceName: real.account,
        destinationName: inTransit.account,
      });
    } else if (inTransit.journalType === 'CREDIT' && real.journalType === 'DEBIT') {
      arrivals.push({
        transaction,
        real,
        inTransit,
        sourceName: inTransit.account,
        destinationName: real.account,
      });
    } else {
      giveUp(
        transaction,
        'unrecognised-shape',
        'an in-transit transaction of an unknown direction',
      );
    }
  }

  // Nearest datetime first, earliest on ties: every candidate pair of a bucket is ranked once and
  // taken greedily, so the outcome never depends on the order the buckets were built in.
  const pairedWith = new Map<InTransitSide, InTransitSide>();
  const matched = new Set<InTransitSide>();
  const buckets = new Map<string, { departures: InTransitSide[]; arrivals: InTransitSide[] }>();
  const bucketFor = (key: string) => {
    const found = buckets.get(key);
    if (found) return found;
    const fresh = { departures: [] as InTransitSide[], arrivals: [] as InTransitSide[] };
    buckets.set(key, fresh);
    return fresh;
  };
  for (const departure of departures) {
    bucketFor(inTransitKey(departure)).departures.push(departure);
  }
  for (const arrival of arrivals) {
    bucketFor(inTransitKey(arrival)).arrivals.push(arrival);
  }
  for (const bucket of buckets.values()) {
    const candidates = bucket.departures.flatMap((departure) =>
      bucket.arrivals.map((arrival) => ({
        departure,
        arrival,
        distance: Math.abs(
          instantOf(arrival.transaction.datetime) - instantOf(departure.transaction.datetime),
        ),
      })),
    );
    candidates.sort(
      (a, b) =>
        a.distance - b.distance ||
        instantOf(a.departure.transaction.datetime) -
          instantOf(b.departure.transaction.datetime) ||
        a.departure.transaction.row - b.departure.transaction.row ||
        a.arrival.transaction.row - b.arrival.transaction.row,
    );
    for (const candidate of candidates) {
      if (matched.has(candidate.departure) || matched.has(candidate.arrival)) {
        continue;
      }
      matched.add(candidate.departure);
      matched.add(candidate.arrival);
      pairedWith.set(candidate.departure, candidate.arrival);
    }
  }

  for (const departure of departures) {
    const arrival = pairedWith.get(departure);
    if (!arrival) {
      giveUp(
        departure.transaction,
        'unpaired-in-transit',
        `money left ${departure.sourceName} for ${departure.destinationName} and no arrival matches it`,
      );
      continue;
    }
    const from = accountOf(departure.real);
    const to = accountOf(arrival.real);
    if (!from || !to) {
      giveUp(departure.transaction, 'unrecognised-shape', 'an in-transit pair with no two рахунки');
      giveUp(arrival.transaction, 'unrecognised-shape', 'an in-transit pair with no two рахунки');
      continue;
    }
    if (from.id === to.id) {
      giveUp(
        departure.transaction,
        'merged-account-move',
        `both ends of this in-transit move are the рахунок "${from.name}"`,
      );
      giveUp(
        arrival.transaction,
        'merged-account-move',
        `both ends of this in-transit move are the рахунок "${from.name}"`,
      );
      continue;
    }
    const ids = [departure.transaction.id, arrival.transaction.id];
    const переказ = built([departure.transaction, arrival.transaction], () =>
      transfer({
        id: `saldo:${ids.join('+')}`,
        date: departure.transaction.date,
        fromAccountId: from.id,
        toAccountId: to.id,
        // What left is what was in transit; the fee is its own витрата, so the source рахунок
        // still loses exactly what its real leg says.
        left: departure.inTransit.amount,
        arrived: arrival.real.amount,
      }),
    );
    if (!переказ) {
      continue;
    }
    add(переказ, ids, departure.transaction, 0);
    if (departure.fee) {
      const комісія = expenseByDefault({
        id: `saldo:${departure.transaction.id}/fee`,
        date: departure.transaction.date,
        accountId: from.id,
        amount: departure.fee.amount,
        categoryId: FEES_CATEGORY_ID,
      });
      add(комісія, [departure.transaction.id], departure.transaction, 1);
    }
  }
  for (const arrival of arrivals) {
    if (!matched.has(arrival)) {
      giveUp(
        arrival.transaction,
        'unpaired-in-transit',
        `money arrived at ${arrival.destinationName} from ${arrival.sourceName} and no departure matches it`,
      );
    }
  }

  // Everything that is not in transit.
  for (const transaction of plain) {
    const realLegs = transaction.legs.filter((leg) => isRealAccountType(leg.accountType));

    if (isInitialBalance(transaction)) {
      if (realLegs.length === 0) {
        giveUp(transaction, 'unrecognised-shape', 'an opening entry with no real leg');
        continue;
      }
      for (const leg of realLegs) {
        const account = accountOf(leg);
        // A pair with nothing but zero opening rows became no рахунок; the report says so.
        if (account) {
          openingContributions.set(
            account.id,
            (openingContributions.get(account.id) ?? 0) + legEffect(leg).amount,
          );
        }
      }
      continue;
    }

    const debt = debtLegOf(transaction);
    if (debt) {
      const real = realLegs[0];
      if (!real || realLegs.length !== 1) {
        giveUp(transaction, 'unrecognised-shape', 'a «Борг» transaction with no single real leg');
        continue;
      }
      const account = accountOf(real);
      if (!account) {
        giveUp(transaction, 'unrecognised-shape', 'a «Борг» transaction on no known рахунок');
        continue;
      }
      const debts = debtAccountFor(real.amount.currency, debtAccounts);
      if (debts.id === account.id) {
        giveUp(transaction, 'unrecognised-shape', 'a «Борг» transaction onto its own рахунок');
        continue;
      }
      // The «Борг» leg debited means money went out on loan; credited means it came back.
      const lending = debt.journalType === 'DEBIT';
      const переказ = built([transaction], () =>
        transfer({
          id: `saldo:${transaction.id}`,
          date: transaction.date,
          fromAccountId: lending ? account.id : debts.id,
          toAccountId: lending ? debts.id : account.id,
          left: real.amount,
          arrived: real.amount,
        }),
      );
      if (переказ) {
        // «Борги» belongs to the plan only once the plan actually moves money onto it: the report
        // states its balance, and a рахунок no переказ survived for is a рахунок nothing explains.
        debtAccounts.set(debts.currency, debts);
        add(переказ, [transaction.id], transaction);
      }
      continue;
    }

    if (realLegs.length === 2) {
      const credited = realLegs.find((leg) => leg.journalType === 'CREDIT');
      const debited = realLegs.find((leg) => leg.journalType === 'DEBIT');
      const from = credited ? accountOf(credited) : undefined;
      const to = debited ? accountOf(debited) : undefined;
      if (!credited || !debited || !from || !to) {
        giveUp(transaction, 'unrecognised-shape', 'a move between two рахунки that do not resolve');
        continue;
      }
      if (from.id === to.id) {
        // The owner merged both ends. A транзакція connects two distinct рахунки, so this becomes
        // none — and its two legs cancel, so the рахунок still reconciles exactly.
        giveUp(
          transaction,
          'merged-account-move',
          `both ends of this move are the рахунок "${from.name}"`,
        );
        continue;
      }
      const переказ = built([transaction], () =>
        transfer({
          id: `saldo:${transaction.id}`,
          date: transaction.date,
          fromAccountId: from.id,
          toAccountId: to.id,
          // Each side in its own рахунок's currency; a cross-currency move stores no rate.
          left: credited.amount,
          arrived: debited.amount,
        }),
      );
      if (переказ) {
        add(переказ, [transaction.id], transaction);
      }
      continue;
    }

    const real = realLegs[0];
    const counterpart = transaction.legs.find(
      (leg) => leg.accountType === EXPENSES || leg.accountType === INCOME,
    );
    if (!real || realLegs.length !== 1 || !counterpart || transaction.legs.length !== 2) {
      giveUp(transaction, 'unrecognised-shape', 'a shape the import has no rule for');
      continue;
    }
    const account = accountOf(real);
    if (!account) {
      giveUp(transaction, 'unrecognised-shape', 'a transaction on no known рахунок');
      continue;
    }
    const saldoName = flattenName(counterpart.parentAccount, counterpart.account);
    const arrived = real.journalType === 'DEBIT';

    if (counterpart.account === BALANCE_CORRECTION_NAME) {
      const коригування: Correction = {
        type: 'correction',
        id: `saldo:${transaction.id}`,
        date: transaction.date,
        accountId: account.id,
        // The sign is the direction the money went, not which side of the ledger it sat on.
        amount: legEffect(real),
      };
      add(коригування, [transaction.id], transaction);
      continue;
    }

    if (counterpart.accountType === INCOME) {
      // The survey registered every non-special INCOME name, so a miss means the survey was not
      // taken from this export. A raw name in an id field would become a dangling reference the
      // moment the plan is committed, so it is reported instead.
      const sourceId = sourceIds.get(saldoName);
      if (sourceId === undefined) {
        giveUp(transaction, 'unrecognised-shape', `no джерело is mapped for "${saldoName}"`);
        continue;
      }
      const дохід: Income = {
        type: 'income',
        id: `saldo:${transaction.id}`,
        date: transaction.date,
        accountId: account.id,
        // Money handed back out of an income is a negative дохід, never a витрата in a category.
        amount: legEffect(real),
        sourceId,
      };
      add(дохід, [transaction.id], transaction);
      continue;
    }

    const categoryId = reservedCategoryFor(counterpart.account) ?? categoryIds.get(saldoName);
    if (categoryId === undefined) {
      giveUp(transaction, 'unrecognised-shape', `no категорія is mapped for "${saldoName}"`);
      continue;
    }

    if (arrived) {
      const повернення = built([transaction], () =>
        refund({
          id: `saldo:${transaction.id}`,
          date: transaction.date,
          accountId: account.id,
          amount: real.amount,
          categoryId,
        }),
      );
      if (!повернення) {
        continue;
      }
      add(повернення, [transaction.id], transaction);
      if (counterpart.amount.currency !== real.amount.currency) {
        // A повернення carries no original-currency amount; the dropped figure is counted.
        note(
          'dropped-original-amount',
          counterpart,
          `the повернення keeps only ${real.amount.amount} ${real.amount.currency}; ${counterpart.amount.amount} ${counterpart.amount.currency} is dropped`,
        );
      }
      continue;
    }

    const витрата = expenseByDefault({
      id: `saldo:${transaction.id}`,
      date: transaction.date,
      accountId: account.id,
      amount: real.amount,
      categoryId,
      // A foreign purchase is spent in what the bank charged; the merchant figure is information.
      ...(counterpart.amount.currency !== real.amount.currency
        ? { originalAmount: counterpart.amount }
        : {}),
    });
    add(витрата, [transaction.id], transaction);
  }

  // Order, accounts, and the rows nothing moved for.
  placed.sort(
    (a, b) => instantOf(a.datetime) - instantOf(b.datetime) || a.row - b.row || a.seq - b.seq,
  );

  const planned = new Map<string, ResolvedAccount>();
  for (const account of [...accountMap.accounts, ...debtAccounts.values()]) {
    if (!planned.has(account.id)) {
      planned.set(account.id, account);
    }
  }
  const accounts: PlannedAccount[] = [...planned.values()].map(
    (account) => {
      const stored = account.existingId ? existingAccounts.get(account.existingId) : undefined;
      return {
        id: account.id,
        name: account.name,
        kind: account.kind,
        currency: account.currency,
        openingBalance: money(openingContributions.get(account.id) ?? 0, account.currency),
        ...(account.existingId ? { existingId: account.existingId } : {}),
        ...(stored
          ? { replacedOpeningBalance: money(stored.openingBalance.amount, stored.currency) }
          : {}),
      };
    },
  );

  for (const dropped of surveyed.droppedPairs) {
    for (const row of dropped.rows) {
      unexplained.push({
        reason: 'zero-only-pair',
        transactionId: '',
        row,
        date: '',
        detail: `"${dropped.saldoAccount}" carries only zero ${dropped.currency} opening rows, so it becomes no рахунок`,
      });
    }
  }
  for (const transaction of transactions) {
    for (const leg of transaction.legs) {
      // Saldo writes a date here; the spec speaks of a month, so only the month is compared.
      if (leg.accrualMonth !== '' && leg.accrualMonth.slice(0, 7) !== leg.date.slice(0, 7)) {
        unexplained.push({
          reason: 'accrual-month-divergence',
          transactionId: transaction.id,
          row: leg.row,
          date: leg.date,
          detail: `the row is accrued to ${leg.accrualMonth.slice(0, 7)} and dated ${leg.date}; the import keeps the date`,
        });
      }
    }
  }

  return {
    accounts,
    accountKeys: Object.fromEntries(
      [...accountMap.byKey].map(([key, account]) => [key, account.id]),
    ),
    categories: namesToCreate(surveyed.categories, categoryIds),
    sources: namesToCreate(surveyed.sources, sourceIds),
    transactions: placed.map((entry) => entry.planned),
    unexplained,
    rejectedRedirects: accountMap.rejectedRedirects,
  };
}

/**
 * The «Борги» рахунок of one currency — the single рахунок-борг every «Борг» row of that currency
 * lands on. One per currency and not one per person: the debts the export carries are closed, so
 * the fact that money went out and came back is all of them that is worth keeping, and the person
 * behind a loan of three years ago is a question the owner cannot answer and does not need to.
 */
function debtAccountFor(
  currency: CurrencyCode,
  debtAccounts: ReadonlyMap<string, ResolvedAccount>,
): ResolvedAccount {
  return (
    debtAccounts.get(currency) ?? {
      id: debtAccountId(currency),
      name: DEBT_ACCOUNT_NAME,
      kind: 'debt',
      currency,
    }
  );
}
