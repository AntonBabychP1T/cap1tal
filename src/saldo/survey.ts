import type { AccountKind } from '../domain/account';
import type { Category, Source } from '../domain/category';
import type { CurrencyCode } from '../domain/money';
import {
  FEES_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
  type Transaction,
} from '../domain/transaction';
import {
  BANK_ACCOUNTS,
  CASH,
  EQUITY,
  EXPENSES,
  INCOME,
  isRealAccountType,
  OTHER_ASSETS,
  type SaldoLeg,
  type SaldoTransaction,
} from './parse';

/**
 * What the export says exists, and what the owner decides to do about it. The survey is derived
 * from the export alone — one entry per real (Saldo account, currency) pair, one proposal per
 * category and source name. The `Decisions` value is the owner's answer to it: a plain JSON-able
 * object the confirm screen builds and the tests and the dry-run hand-write.
 *
 * «Борг» is not among the questions. The debts the export carries are closed, so the import puts
 * every one of them on a single рахунок-борг «Борги» per currency and asks nothing — see
 * `DEBT_ACCOUNT_NAME`.
 */

/** The Saldo EXPENSES names that are not categories at all. */
export const FEES_NAME = 'Fees';
export const UNCATEGORISED_EXPENSE_NAME = 'Uncategorised expense';
export const BALANCE_CORRECTION_NAME = 'Balance correction';
export const DEBT_NAME = 'Борг';

/** Saldo account type → the вид of the рахунок proposed for it. The name never decides. */
const KIND_BY_ACCOUNT_TYPE: Readonly<Record<string, AccountKind>> = {
  [BANK_ACCOUNTS]: 'spending',
  [CASH]: 'cash',
  [OTHER_ASSETS]: 'investment',
};

/** Plan-local id namespaces. Real ids are generated at commit time; the engine stays replayable. */
export const NEW_ACCOUNT_PREFIX = 'saldo:account:';
export const NEW_CATEGORY_PREFIX = 'saldo:category:';
export const NEW_SOURCE_PREFIX = 'saldo:source:';

/**
 * The one рахунок-борг the import builds, and its plan-local id per currency. Every «Борг» row of
 * the export lands here: the debts the export carries are closed, so what is worth keeping about
 * them is that they happened — the person behind a 2023 loan is not something the import asks.
 */
export const DEBT_ACCOUNT_NAME = 'Борги';

export function debtAccountId(currency: CurrencyCode): string {
  return `saldo:debt:${currency}`;
}

/**
 * A (Saldo account, currency) pair's stable key. The currency comes first and is always three
 * letters, so no account name can make two different pairs share a key.
 */
export function accountKey(saldoAccount: string, currency: CurrencyCode): string {
  return `${currency}|${saldoAccount}`;
}

/**
 * The starter set flattened Saldo's one level of hierarchy into "parent — name" (see
 * `src/db/starter-set.ts`), so that is how a child account's name is matched.
 */
export function flattenName(parentAccount: string, account: string): string {
  return parentAccount === '' ? account : `${parentAccount} — ${account}`;
}

/** One real Saldo account in one currency — the unit the account map maps. */
export interface AccountEntry {
  readonly key: string;
  readonly saldoAccount: string;
  readonly currency: CurrencyCode;
  readonly saldoAccountType: string;
  readonly proposedName: string;
  readonly proposedKind: AccountKind;
}

/** A pair that carries nothing but zero initial balances: no рахунок, but not silence either. */
export interface DroppedPair {
  readonly key: string;
  readonly saldoAccount: string;
  readonly currency: CurrencyCode;
  readonly rows: readonly number[];
}

/** A Saldo category or source name, with the existing row it matches by name, if any. */
export interface NameProposal {
  readonly saldoName: string;
  readonly matchedId?: string;
  /** The plan-local id used when nothing matched and nothing is redirected. */
  readonly proposedId: string;
}

export interface Survey {
  readonly accounts: readonly AccountEntry[];
  readonly droppedPairs: readonly DroppedPair[];
  readonly categories: readonly NameProposal[];
  readonly sources: readonly NameProposal[];
}

/** The app's current state, as plain values — the engine never reaches for the database. */
export interface ExistingState {
  readonly accounts: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind: AccountKind;
    readonly currency: CurrencyCode;
    readonly openingBalance: { readonly amount: number; readonly currency: CurrencyCode };
    readonly archived: boolean;
  }[];
  readonly categories: readonly Category[];
  readonly sources: readonly Source[];
  /** Everything already recorded by hand; only the verification report reads it. */
  readonly transactions: readonly Transaction[];
}

export const EMPTY_EXISTING: ExistingState = {
  accounts: [],
  categories: [],
  sources: [],
  transactions: [],
};

export type AccountRedirect =
  | { readonly to: 'entry'; readonly key: string }
  | { readonly to: 'account'; readonly accountId: string };

/**
 * The owner's answers, serializable end to end: the confirm screen of the follow-up change stores
 * exactly this, the dry-run passes `{}`, and replaying the same value over the same export
 * reproduces the same plan.
 */
export interface Decisions {
  /** entry key → the рахунок its legs land on instead of its own proposal. */
  readonly accountRedirects?: Readonly<Record<string, AccountRedirect>>;
  /** entry key → the вид to use instead of the proposed one. */
  readonly accountKinds?: Readonly<Record<string, AccountKind>>;
  /** Saldo category name → an existing category id to use instead of creating one. */
  readonly categoryRedirects?: Readonly<Record<string, string>>;
  /** Saldo source name → an existing source id to use instead of creating one. */
  readonly sourceRedirects?: Readonly<Record<string, string>>;
}

export const NO_DECISIONS: Decisions = {};

/** Is this transaction one of Saldo's opening entries? */
export function isInitialBalance(transaction: SaldoTransaction): boolean {
  return transaction.legs.some((leg) => leg.accountType === EQUITY);
}

/** The «Борг» leg of a transaction, if it has one. */
export function debtLegOf(transaction: SaldoTransaction): SaldoLeg | undefined {
  return transaction.legs.find(
    (leg) => leg.accountType === EXPENSES && leg.account === DEBT_NAME,
  );
}

/**
 * Which of the four special EXPENSES names this is — or `undefined` for an ordinary category.
 * «Комісія» and «Без категорії» are reserved rows the domain already owns; "Balance correction"
 * and «Борг» are not categories at all, and the interpreter turns their legs into a коригування
 * and a переказ respectively.
 */
export function reservedCategoryFor(saldoName: string): string | undefined {
  if (saldoName === FEES_NAME) return FEES_CATEGORY_ID;
  if (saldoName === UNCATEGORISED_EXPENSE_NAME) return UNCATEGORISED_CATEGORY_ID;
  return undefined;
}

function isNonCategoryExpenseName(saldoName: string): boolean {
  return saldoName === BALANCE_CORRECTION_NAME || saldoName === DEBT_NAME;
}

/** Unarchived match wins over archived; an archived row still matches (design decision 6). */
function matchByName(
  rows: readonly { id: string; name: string; archived: boolean }[],
  name: string,
): string | undefined {
  const sameName = rows.filter((row) => row.name === name);
  return (sameName.find((row) => !row.archived) ?? sameName[0])?.id;
}

/**
 * The export, read once: every real (account, currency) pair, every category and source name,
 * every distinct «Борг» description. Order is the export's own first-appearance order, so the
 * survey a screen shows is the same one twice running.
 */
export function survey(
  transactions: readonly SaldoTransaction[],
  existing: ExistingState = EMPTY_EXISTING,
): Survey {
  const pairs = new Map<string, { entry: AccountEntry; legs: SaldoLeg[]; initialOnly: boolean }>();
  const categories = new Map<string, NameProposal>();
  const sources = new Map<string, NameProposal>();

  for (const transaction of transactions) {
    const initial = isInitialBalance(transaction);
    for (const leg of transaction.legs) {
      if (isRealAccountType(leg.accountType)) {
        const key = accountKey(leg.account, leg.amount.currency);
        const found = pairs.get(key);
        if (found) {
          found.legs.push(leg);
          found.initialOnly = found.initialOnly && initial && leg.amount.amount === 0;
        } else {
          pairs.set(key, {
            entry: {
              key,
              saldoAccount: leg.account,
              currency: leg.amount.currency,
              saldoAccountType: leg.accountType,
              proposedName: leg.account,
              proposedKind: KIND_BY_ACCOUNT_TYPE[leg.accountType] ?? 'spending',
            },
            legs: [leg],
            initialOnly: initial && leg.amount.amount === 0,
          });
        }
        continue;
      }
      if (leg.accountType === EXPENSES) {
        const saldoName = flattenName(leg.parentAccount, leg.account);
        if (isNonCategoryExpenseName(leg.account) || reservedCategoryFor(leg.account)) {
          continue;
        }
        if (!categories.has(saldoName)) {
          const matchedId = matchByName(existing.categories, saldoName);
          categories.set(saldoName, {
            saldoName,
            ...(matchedId ? { matchedId } : {}),
            proposedId: `${NEW_CATEGORY_PREFIX}${saldoName}`,
          });
        }
        continue;
      }
      if (leg.accountType === INCOME) {
        const saldoName = flattenName(leg.parentAccount, leg.account);
        if (leg.account === BALANCE_CORRECTION_NAME) {
          continue;
        }
        if (!sources.has(saldoName)) {
          const matchedId = matchByName(existing.sources, saldoName);
          sources.set(saldoName, {
            saldoName,
            ...(matchedId ? { matchedId } : {}),
            proposedId: `${NEW_SOURCE_PREFIX}${saldoName}`,
          });
        }
      }
    }
  }

  const accounts: AccountEntry[] = [];
  const droppedPairs: DroppedPair[] = [];
  for (const pair of pairs.values()) {
    if (pair.initialOnly) {
      droppedPairs.push({
        key: pair.entry.key,
        saldoAccount: pair.entry.saldoAccount,
        currency: pair.entry.currency,
        rows: pair.legs.map((leg) => leg.row),
      });
    } else {
      accounts.push(pair.entry);
    }
  }

  return {
    accounts,
    droppedPairs,
    categories: [...categories.values()],
    sources: [...sources.values()],
  };
}

/** One рахунок the plan will use — new, or an existing one the owner pointed an entry at. */
export interface ResolvedAccount {
  readonly id: string;
  readonly name: string;
  readonly kind: AccountKind;
  readonly currency: CurrencyCode;
  /** Set when this рахунок already exists; its stored history joins the verification. */
  readonly existingId?: string;
}

export interface RejectedRedirect {
  readonly key: string;
  readonly reason: string;
}

export interface AccountMap {
  readonly byKey: ReadonlyMap<string, ResolvedAccount>;
  /** The рахунки the plan needs, in the export's own order; existing ones carry `existingId`. */
  readonly accounts: readonly ResolvedAccount[];
  readonly rejectedRedirects: readonly RejectedRedirect[];
}

/** The existing рахунки a redirect can name, by id. */
function existingAccountsById(existing: ExistingState): ReadonlyMap<string, ResolvedAccount> {
  return new Map(
    existing.accounts.map((account) => [
      account.id,
      {
        id: account.id,
        name: account.name,
        kind: account.kind,
        currency: account.currency,
        existingId: account.id,
      },
    ]),
  );
}

/**
 * The account map the plan runs on: every entry resolved to one рахунок, redirects followed, вид
 * overrides applied. A redirect onto a рахунок of another currency is rejected and the entry
 * keeps its own proposal — amounts of different currencies never combine, and a merge that
 * changed a рахунок's currency would silently corrupt every balance on it.
 */
export function resolveAccountMap(
  surveyed: Survey,
  decisions: Decisions = NO_DECISIONS,
  existing: ExistingState = EMPTY_EXISTING,
): AccountMap {
  const entryByKey = new Map(surveyed.accounts.map((entry) => [entry.key, entry]));
  const existingById = existingAccountsById(existing);
  const redirects = decisions.accountRedirects ?? {};
  const kinds = decisions.accountKinds ?? {};
  const rejectedRedirects: RejectedRedirect[] = [];

  /** Follow entry→entry redirects to the entry that owns the рахунок, or report why we did not. */
  const ownerOf = (entry: AccountEntry): { entry: AccountEntry } | { account: ResolvedAccount } => {
    let current = entry;
    const seen = new Set<string>([entry.key]);
    for (;;) {
      const redirect = redirects[current.key];
      if (!redirect) {
        return { entry: current };
      }
      if (redirect.to === 'account') {
        const target = existingById.get(redirect.accountId);
        if (!target) {
          rejectedRedirects.push({
            key: current.key,
            reason: `no рахунок "${redirect.accountId}" to redirect onto`,
          });
          return { entry: current };
        }
        if (target.currency !== current.currency) {
          rejectedRedirects.push({
            key: current.key,
            reason: `cannot redirect a ${current.currency} entry onto the ${target.currency} рахунок "${target.name}"`,
          });
          return { entry: current };
        }
        return { account: target };
      }
      const next = entryByKey.get(redirect.key);
      if (!next) {
        rejectedRedirects.push({
          key: current.key,
          reason: `no entry "${redirect.key}" to redirect onto`,
        });
        return { entry: current };
      }
      if (next.currency !== current.currency) {
        rejectedRedirects.push({
          key: current.key,
          reason: `cannot redirect a ${current.currency} entry onto the ${next.currency} entry "${next.saldoAccount}"`,
        });
        return { entry: current };
      }
      if (seen.has(next.key)) {
        rejectedRedirects.push({ key: current.key, reason: 'the redirects form a cycle' });
        return { entry: current };
      }
      seen.add(next.key);
      current = next;
    }
  };

  const byKey = new Map<string, ResolvedAccount>();
  const accounts: ResolvedAccount[] = [];
  const accountById = new Map<string, ResolvedAccount>();

  for (const entry of surveyed.accounts) {
    const owner = ownerOf(entry);
    const resolved: ResolvedAccount =
      'account' in owner
        ? owner.account
        : {
            id: `${NEW_ACCOUNT_PREFIX}${owner.entry.key}`,
            name: owner.entry.proposedName,
            kind: kinds[owner.entry.key] ?? owner.entry.proposedKind,
            currency: owner.entry.currency,
          };
    byKey.set(entry.key, resolved);
    if (!accountById.has(resolved.id)) {
      accountById.set(resolved.id, resolved);
      accounts.push(resolved);
    }
  }

  return { byKey, accounts, rejectedRedirects };
}

/**
 * Every category and source name the plan will use, resolved: the matched existing row, the row
 * the owner redirected the name onto, or the plan-local id of a row the plan proposes creating.
 * A redirect onto an id no row carries is ignored — the proposal stands rather than the plan
 * pointing at nothing.
 */
export function resolveNames(
  proposals: readonly NameProposal[],
  redirects: Readonly<Record<string, string>> = {},
  existingRows: readonly { id: string }[] = [],
): ReadonlyMap<string, string> {
  const ids = new Set(existingRows.map((row) => row.id));
  return new Map(
    proposals.map((proposal) => {
      const redirect = redirects[proposal.saldoName];
      if (redirect !== undefined && ids.has(redirect)) {
        return [proposal.saldoName, redirect];
      }
      return [proposal.saldoName, proposal.matchedId ?? proposal.proposedId];
    }),
  );
}

/** The names the plan will have to create: everything that resolved to a plan-local id. */
export function namesToCreate(
  proposals: readonly NameProposal[],
  resolved: ReadonlyMap<string, string>,
): readonly NameProposal[] {
  return proposals.filter((proposal) => resolved.get(proposal.saldoName) === proposal.proposedId);
}
