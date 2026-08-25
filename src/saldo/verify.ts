import { account, computeBalance, type AccountKind } from '../domain/account';
import { money, type CurrencyCode, type Money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import { isRealAccountType, legEffect, type SaldoTransaction } from './parse';
import type { ImportPlan, UnexplainedRow, UnresolvedDebt } from './interpret';
import { accountKey, EMPTY_EXISTING, type ExistingState, type RejectedRedirect } from './survey';

/**
 * The proof, or the honest absence of one. For every рахунок the plan touches this states two
 * numbers computed by two different routes — the balance Saldo's own double entry implies at
 * export time, and the розрахунковий баланс the plan would yield — and, when they differ, exactly
 * what accounts for the difference. Nothing is asserted to be fine: a рахунок reconciles because
 * the arithmetic says so, and every kopiyka that does not reconcile is named.
 */

/** What accounts for a part of a difference. The contributions of one рахунок sum to it exactly. */
export type Explanation =
  | {
      readonly kind: 'export-row';
      /** How much of the difference this dropped row accounts for. */
      readonly amount: Money;
      readonly row: UnexplainedRow;
    }
  | {
      readonly kind: 'existing-transactions';
      readonly amount: Money;
      /** How many транзакції the owner had already recorded on this рахунок by hand. */
      readonly count: number;
    };

export interface AccountReconciliation {
  readonly accountId: string;
  readonly name: string;
  readonly kind: AccountKind;
  readonly currency: CurrencyCode;
  /** Saldo's own arithmetic over every merged real leg, opening rows included. */
  readonly saldoBalance: Money;
  /** The plan's розрахунковий баланс, including whatever the owner already recorded by hand. */
  readonly planBalance: Money;
  /** planBalance − saldoBalance. Zero is what "reconciles" means. */
  readonly difference: Money;
  readonly explanations: readonly Explanation[];
  readonly reconciles: boolean;
  /** Set when the plan replaces a stored початковий залишок, so the owner sees what it was. */
  readonly replacedOpeningBalance?: Money;
}

export interface DebtBalance {
  readonly accountId: string;
  readonly name: string;
  /** Positive: still owed to the owner. Negative: repaid more than was lent. */
  readonly balance: Money;
}

export interface Report {
  /** The рахунки the export maps onto — the only ones Saldo implies a balance for. */
  readonly accounts: readonly AccountReconciliation[];
  readonly debts: readonly DebtBalance[];
  /** Every row the plan turned into no money moving, whatever the reason. */
  readonly droppedRows: readonly UnexplainedRow[];
  readonly unresolvedDebts: readonly UnresolvedDebt[];
  readonly rejectedRedirects: readonly RejectedRedirect[];
  /** True when every рахунок reconciles exactly and no «Борг» transaction is unassigned. */
  readonly reconciles: boolean;
}

/** The transactions of the plan, unwrapped — the report cares about the money, not the sources. */
function plannedTransactions(plan: ImportPlan): Transaction[] {
  return plan.transactions.map((planned) => planned.transaction);
}

/** What a set of транзакції does to one рахунок, opening balance left out of it. */
function effectOn(
  input: { id: string; currency: CurrencyCode },
  transactions: readonly Transaction[],
): number {
  return computeBalance(
    account({
      id: input.id,
      name: input.id,
      kind: 'spending',
      currency: input.currency,
      openingBalance: money(0, input.currency),
    }),
    transactions,
  ).amount;
}

export function verify(input: {
  transactions: readonly SaldoTransaction[];
  plan: ImportPlan;
  existing?: ExistingState;
}): Report {
  const { plan } = input;
  const existing = input.existing ?? EMPTY_EXISTING;
  const planned = plannedTransactions(plan);

  // Saldo's own answer: every real leg of the export, added to the рахунок its pair maps onto.
  // Opening rows are real legs too, so this is "initial balance plus debits minus credits".
  const saldoBalances = new Map<string, number>();
  for (const transaction of input.transactions) {
    for (const leg of transaction.legs) {
      if (!isRealAccountType(leg.accountType)) {
        continue;
      }
      const id = plan.accountKeys[accountKey(leg.account, leg.amount.currency)];
      if (id === undefined) {
        continue;
      }
      // The same sign rule the interpreter reads, from the same place — two copies could drift,
      // and the report would then agree with the wrong number instead of catching it.
      saldoBalances.set(id, (saldoBalances.get(id) ?? 0) + legEffect(leg).amount);
    }
  }

  const droppedByAccount = new Map<string, UnexplainedRow[]>();
  for (const row of plan.unexplained) {
    if (row.accountId === undefined || row.effect === undefined) {
      continue;
    }
    const rows = droppedByAccount.get(row.accountId);
    if (rows) {
      rows.push(row);
    } else {
      droppedByAccount.set(row.accountId, [row]);
    }
  }

  // Only рахунки the export actually maps onto can be reconciled against it. A рахунок-борг is
  // cap1tal's own construct — Saldo booked lending to an EXPENSES account and held no asset for
  // the person — so it has no Saldo-implied balance and is reported by its resulting balance.
  const mapped = new Set(Object.values(plan.accountKeys));
  const accounts: AccountReconciliation[] = plan.accounts
    .filter((planAccount) => mapped.has(planAccount.id))
    .map((planAccount) => {
      const stored = planAccount.existingId
        ? existing.transactions.filter((t) => touches(t, planAccount.id))
        : [];
      const storedEffect = effectOn(planAccount, stored);
      const planBalance =
        planAccount.openingBalance.amount + effectOn(planAccount, planned) + storedEffect;
      const saldoBalance = saldoBalances.get(planAccount.id) ?? 0;
      const difference = planBalance - saldoBalance;

      const explanations: Explanation[] = (droppedByAccount.get(planAccount.id) ?? []).map((row) => ({
        kind: 'export-row',
        // The plan is missing this row's effect, so the difference carries its opposite.
        amount: money(-(row.effect as Money).amount, planAccount.currency),
        row,
      }));
      if (storedEffect !== 0 || stored.length > 0) {
        explanations.push({
          kind: 'existing-transactions',
          amount: money(storedEffect, planAccount.currency),
          count: stored.length,
        });
      }

      return {
        accountId: planAccount.id,
        name: planAccount.name,
        kind: planAccount.kind,
        currency: planAccount.currency,
        saldoBalance: money(saldoBalance, planAccount.currency),
        planBalance: money(planBalance, planAccount.currency),
        difference: money(difference, planAccount.currency),
        explanations,
        reconciles: difference === 0,
        ...(planAccount.replacedOpeningBalance
          ? { replacedOpeningBalance: planAccount.replacedOpeningBalance }
          : {}),
      };
    });

  const debts: DebtBalance[] = plan.accounts
    .filter((planAccount) => planAccount.kind === 'debt')
    .map((planAccount) => ({
      accountId: planAccount.id,
      name: planAccount.name,
      balance: money(
        planAccount.openingBalance.amount +
          effectOn(planAccount, planned) +
          (planAccount.existingId
            ? effectOn(
                planAccount,
                existing.transactions.filter((t) => touches(t, planAccount.id)),
              )
            : 0),
        planAccount.currency,
      ),
    }));

  return {
    accounts,
    debts,
    droppedRows: plan.unexplained,
    unresolvedDebts: plan.unresolvedDebts,
    rejectedRedirects: plan.rejectedRedirects,
    reconciles: accounts.every((row) => row.reconciles) && plan.complete,
  };
}

/**
 * Does this транзакція move the рахунок at all? A переказ touches both of its ends.
 *
 * `src/ui/account-choices.ts` answers a neighbouring question for the pickers, but it is screen
 * logic: the engine reads no `src/ui`, so that a plan can be built where no screen exists.
 */
function touches(transaction: Transaction, accountId: string): boolean {
  return transaction.type === 'transfer'
    ? transaction.fromAccountId === accountId || transaction.toAccountId === accountId
    : transaction.accountId === accountId;
}
