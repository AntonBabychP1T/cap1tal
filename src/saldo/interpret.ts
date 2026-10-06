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
  type Month,
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
  /**
   * The дата початкового залишку: the earliest phone date of the «Initial balance» entries mapped
   * onto this рахунок, moved back to its first planned or stored транзакція when that is earlier.
   * Absent when the export holds no such entry for it (saldo-import, "Initial balance legs become
   * the початковий залишок").
   */
  readonly openingDate?: IsoDate;
  /** Set when this is a рахунок that already exists rather than one the plan creates. */
  readonly existingId?: string;
  /** The початковий залишок the plan proposes to replace, so the report can show it. */
  readonly replacedOpeningBalance?: Money;
  /** Beside `replacedOpeningBalance`: the stored дата it replaces, absent when there was none. */
  readonly replacedOpeningDate?: IsoDate;
}

/** One транзакція of the plan, with the export rows it came from. */
export interface PlannedTransaction {
  readonly transaction: Transaction;
  /** The source Transaction ID(s): a pair for a collapsed in-transit переказ. */
  readonly saldoIds: readonly string[];
}

/**
 * Which of the shapes the import has no rule for a row turned out to be. A code and not a
 * sentence, for the reason `UnexplainedFacts` gives: the words are the screen's.
 */
export type UnrecognisedShape =
  /** The domain's own factory refused the транзакція — a zero переказ, a zero повернення. */
  | 'domain-rejected'
  | 'in-transit-without-account'
  | 'in-transit-unknown-direction'
  /** A departure and an arrival paired, but one of their ends resolves to no рахунок. */
  | 'in-transit-pair-unresolved'
  | 'opening-without-account'
  | 'debt-without-single-account'
  | 'debt-on-unknown-account'
  /** A «Борг» row whose real leg is the «Борги» рахунок itself. */
  | 'debt-onto-itself'
  | 'move-unresolved'
  | 'no-rule'
  | 'unknown-account'
  /** A витрата or повернення whose Saldo name no категорія answers — `name` says which. */
  | 'unmapped-category'
  /** A дохід whose Saldo name no джерело answers — `name` says which. */
  | 'unmapped-source';

/**
 * Why a row moves no money, and the facts that say so — as data, never as prose.
 *
 * The «Імпорт Saldo» screen words every one of these for the owner (`src/ui/saldo-import.ts`,
 * `unexplainedLine`), and it has to be there: a сума is read through `formatMoney` and a day
 * through `calendarLabel`, both of which are `src/ui`, which the engine never reads. A sentence
 * built here could only print `542575 UAH` and `2025-09-08` — which is exactly what QA found on
 * the звірка — so the engine hands over the kind of row and its numbers, and nothing to read.
 */
export type UnexplainedFacts =
  | {
      readonly reason: 'unpaired-in-transit';
      /** Which half is present: the money that left (`departure`) or the money that arrived. */
      readonly side: 'departure' | 'arrival';
      /** The Saldo names of the two ends, as the export writes them. */
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly reason: 'merged-account-move';
      /** The one рахунок both ends of the move were merged onto. */
      readonly accountName: string;
    }
  | {
      readonly reason: 'unrecognised-shape';
      readonly shape: UnrecognisedShape;
      /** The Saldo name nothing is mapped for, on `unmapped-category` and `unmapped-source`. */
      readonly name?: string;
      /** The domain's own refusal on `domain-rejected` — a diagnostic for the dry run only. */
      readonly why?: string;
    }
  | {
      readonly reason: 'dropped-original-amount';
      /** What the повернення keeps: the рахунок-currency amount. */
      readonly kept: Money;
      /** The other currency's amount, which a повернення has no field for. */
      readonly dropped: Money;
    }
  | {
      readonly reason: 'zero-only-pair';
      readonly saldoAccount: string;
      readonly currency: CurrencyCode;
    }
  | {
      readonly reason: 'accrual-month-divergence';
      /** The month the export's Accrual Month names. */
      readonly accruedTo: Month;
      /** The Transaction Date as the export writes it — a UTC instant, normalised. */
      readonly exportDatetime: string;
    };

export type UnexplainedReason = UnexplainedFacts['reason'];

/**
 * A row the plan does not turn into money moving. `effect` is what the рахунок named by
 * `accountId` therefore fails to move by — signed in that рахунок's currency — which is exactly
 * the difference the verification report will show. An informational row carries neither, and a
 * move both of whose ends were merged onto one рахунок carries both halves, which cancel.
 */
export type UnexplainedRow = UnexplainedFacts & {
  readonly transactionId: string;
  readonly row: number;
  /** The phone's calendar date of the row — the one its транзакція would have had. */
  readonly date: IsoDate | '';
  readonly accountId?: string;
  readonly effect?: Money;
};

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

/**
 * The опис a Saldo row carries, ready to be spread onto a транзакція — `{ description }` when the
 * export wrote one, and nothing at all when it did not.
 *
 * Spread rather than assigned, and absent rather than `''`, because two of the seven constructions
 * below are hand-built object literals (`Correction`, `Income`) which — unlike the domain's
 * factories — would happily store an empty string and leave a blank line under the транзакція.
 */
function описOf(transaction: SaldoTransaction): { description?: string } {
  const trimmed = transaction.description.trim();
  return trimmed.length > 0 ? { description: trimmed } : {};
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
  /** The earliest phone date of the «Initial balance» entries per рахунок. */
  const openingDates = new Map<string, IsoDate>();
  /** The «Борги» рахунки the plan needs, by currency, in the order the export reaches for them. */
  const debtAccounts = new Map<string, ResolvedAccount>();

  const accountOf = (leg: SaldoLeg): ResolvedAccount | undefined =>
    accountMap.byKey.get(accountKey(leg.account, leg.amount.currency));

  const note = (facts: UnexplainedFacts, leg: SaldoLeg, account?: ResolvedAccount): void => {
    unexplained.push({
      ...facts,
      transactionId: leg.transactionId,
      row: leg.row,
      date: leg.date,
      ...(account ? { accountId: account.id, effect: legEffect(leg) } : {}),
    });
  };

  /** Every real leg of a transaction the plan gives up on still has to show up somewhere. */
  const giveUp = (transaction: SaldoTransaction, facts: UnexplainedFacts): void => {
    const realLegs = transaction.legs.filter((leg) => isRealAccountType(leg.accountType));
    if (realLegs.length === 0) {
      note(facts, transaction.legs[0] as SaldoLeg);
      return;
    }
    for (const leg of realLegs) {
      note(facts, leg, accountOf(leg));
    }
  };

  /** The commonest give-up: a shape with no rule, named by its code. */
  const unrecognised = (
    transaction: SaldoTransaction,
    shape: UnrecognisedShape,
    extra: { name?: string; why?: string } = {},
  ): void => giveUp(transaction, { reason: 'unrecognised-shape', shape, ...extra });

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
        unrecognised(transaction, 'domain-rejected', { why });
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
      unrecognised(transaction, 'in-transit-without-account');
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
      unrecognised(transaction, 'in-transit-unknown-direction');
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
      giveUp(departure.transaction, {
        reason: 'unpaired-in-transit',
        side: 'departure',
        from: departure.sourceName,
        to: departure.destinationName,
      });
      continue;
    }
    const from = accountOf(departure.real);
    const to = accountOf(arrival.real);
    if (!from || !to) {
      unrecognised(departure.transaction, 'in-transit-pair-unresolved');
      unrecognised(arrival.transaction, 'in-transit-pair-unresolved');
      continue;
    }
    if (from.id === to.id) {
      giveUp(departure.transaction, { reason: 'merged-account-move', accountName: from.name });
      giveUp(arrival.transaction, { reason: 'merged-account-move', accountName: from.name });
      continue;
    }
    const ids = [departure.transaction.id, arrival.transaction.id];
    // The departure's, not the arrival's: the departure is the row that names where the money
    // went, and the arrival in a Saldo export is the anonymous other half — which is exactly why
    // it is asked only when the departure says nothing. Resolved once and given to both the
    // переказ and its «Комісія», so the fee follows the переказ rather than its own blank cell.
    // The departure is spread last, so it wins whenever it has an опис at all.
    const опис = { ...описOf(arrival.transaction), ...описOf(departure.transaction) };
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
        ...опис,
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
        // The same movement, so the same опис: a «Комісія» with none is the one row of an import
        // the owner cannot place afterwards.
        ...опис,
      });
      add(комісія, [departure.transaction.id], departure.transaction, 1);
    }
  }
  for (const arrival of arrivals) {
    if (!matched.has(arrival)) {
      giveUp(arrival.transaction, {
        reason: 'unpaired-in-transit',
        side: 'arrival',
        from: arrival.sourceName,
        to: arrival.destinationName,
      });
    }
  }

  // Everything that is not in transit.
  for (const transaction of plain) {
    const realLegs = transaction.legs.filter((leg) => isRealAccountType(leg.accountType));

    if (isInitialBalance(transaction)) {
      if (realLegs.length === 0) {
        unrecognised(transaction, 'opening-without-account');
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
          const earliest = openingDates.get(account.id);
          if (leg.date !== '' && (earliest === undefined || leg.date < earliest)) {
            openingDates.set(account.id, leg.date);
          }
        }
      }
      continue;
    }

    const debt = debtLegOf(transaction);
    if (debt) {
      const real = realLegs[0];
      if (!real || realLegs.length !== 1) {
        unrecognised(transaction, 'debt-without-single-account');
        continue;
      }
      const account = accountOf(real);
      if (!account) {
        unrecognised(transaction, 'debt-on-unknown-account');
        continue;
      }
      const debts = debtAccountFor(real.amount.currency, debtAccounts);
      if (debts.id === account.id) {
        unrecognised(transaction, 'debt-onto-itself');
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
          ...описOf(transaction),
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
        unrecognised(transaction, 'move-unresolved');
        continue;
      }
      if (from.id === to.id) {
        // The owner merged both ends. A транзакція connects two distinct рахунки, so this becomes
        // none — and its two legs cancel, so the рахунок still reconciles exactly.
        giveUp(transaction, { reason: 'merged-account-move', accountName: from.name });
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
          ...описOf(transaction),
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
      unrecognised(transaction, 'no-rule');
      continue;
    }
    const account = accountOf(real);
    if (!account) {
      unrecognised(transaction, 'unknown-account');
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
        ...описOf(transaction),
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
        unrecognised(transaction, 'unmapped-source', { name: saldoName });
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
        ...описOf(transaction),
      };
      add(дохід, [transaction.id], transaction);
      continue;
    }

    const categoryId = reservedCategoryFor(counterpart.account) ?? categoryIds.get(saldoName);
    if (categoryId === undefined) {
      unrecognised(transaction, 'unmapped-category', { name: saldoName });
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
          ...описOf(transaction),
        }),
      );
      if (!повернення) {
        continue;
      }
      add(повернення, [transaction.id], transaction);
      if (counterpart.amount.currency !== real.amount.currency) {
        // A повернення carries no original-currency amount; the dropped figure is counted.
        note(
          { reason: 'dropped-original-amount', kept: real.amount, dropped: counterpart.amount },
          counterpart,
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
      ...описOf(transaction),
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
  // Each рахунок's first транзакція — planned, or already stored on an existing one — which an
  // «Initial balance» dated after it is moved back to: a balance cannot hold from a day later than
  // money already moved on it.
  const firstMovement = new Map<string, IsoDate>();
  const touch = (accountId: string, date: IsoDate): void => {
    const first = firstMovement.get(accountId);
    if (first === undefined || date < first) firstMovement.set(accountId, date);
  };
  for (const { planned: entry } of placed) {
    for (const accountId of accountsTouched(entry.transaction)) touch(accountId, entry.transaction.date);
  }
  const plannedIdOfExisting = new Map(
    [...planned.values()].flatMap((a) => (a.existingId ? [[a.existingId, a.id] as const] : [])),
  );
  for (const t of existing.transactions) {
    for (const storedId of accountsTouched(t)) {
      const plannedId = plannedIdOfExisting.get(storedId);
      if (plannedId !== undefined) touch(plannedId, t.date);
    }
  }

  const accounts: PlannedAccount[] = [...planned.values()].map(
    (account) => {
      const stored = account.existingId ? existingAccounts.get(account.existingId) : undefined;
      const entered = openingDates.get(account.id);
      const first = firstMovement.get(account.id);
      const openingDate =
        entered === undefined ? undefined : first !== undefined && first < entered ? first : entered;
      return {
        id: account.id,
        name: account.name,
        kind: account.kind,
        currency: account.currency,
        openingBalance: money(openingContributions.get(account.id) ?? 0, account.currency),
        ...(openingDate !== undefined ? { openingDate } : {}),
        ...(account.existingId ? { existingId: account.existingId } : {}),
        ...(stored
          ? {
              replacedOpeningBalance: money(stored.openingBalance.amount, stored.currency),
              ...(stored.openingDate !== undefined ? { replacedOpeningDate: stored.openingDate } : {}),
            }
          : {}),
      };
    },
  );

  for (const dropped of surveyed.droppedPairs) {
    for (const row of dropped.rows) {
      unexplained.push({
        reason: 'zero-only-pair',
        saldoAccount: dropped.saldoAccount,
        currency: dropped.currency,
        transactionId: '',
        row,
        date: '',
      });
    }
  }
  for (const transaction of transactions) {
    for (const leg of transaction.legs) {
      // Saldo writes a date here; the spec speaks of a month, so only the month is compared. It
      // fills it from the same UTC text as Transaction Date, so it is compared with that — not
      // with the phone's date, which crosses into the next month on a month-end evening.
      if (
        leg.accrualMonth !== '' &&
        leg.accrualMonth.slice(0, 7) !== leg.datetime.slice(0, 7)
      ) {
        unexplained.push({
          reason: 'accrual-month-divergence',
          transactionId: transaction.id,
          row: leg.row,
          date: leg.date,
          accruedTo: leg.accrualMonth.slice(0, 7),
          // Quoted as the export writes it (the spec's scenario): the screen says both days only
          // when this UTC text and the phone's date fall on different ones.
          exportDatetime: leg.datetime,
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

/** The рахунки one транзакція moves: its own, or both legs of a переказ. */
function accountsTouched(t: Transaction): readonly string[] {
  return t.type === 'transfer' ? [t.fromAccountId, t.toAccountId] : [t.accountId];
}
