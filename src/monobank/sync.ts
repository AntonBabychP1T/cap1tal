import { money, type CurrencyCode, type Money } from '../domain/money';
import { matchRule, type Rule } from '../domain/rules';
import {
  expenseByDefault,
  isoDate,
  UNSOURCED_SOURCE_ID,
  type Income,
  type Transaction,
} from '../domain/transaction';
import { MAX_STATEMENT_WINDOW_MS, STATEMENT_PAGE_SIZE, type StatementItem } from './api';

/**
 * The two decisions a sync makes once the payloads are parsed: which windows to ask for, and what
 * the rows that come back are.
 *
 * Both are data in, data out. No loop lives here and nothing sleeps: the API's rate limit is an
 * I/O concern, so the planner hands the caller windows and `fetchStatement` hands it
 * `rate-limited` — *when* to retry is the screen's decision, not the engine's (design D6). The
 * mapper likewise keeps no state: the set of item ids already imported comes in and comes back
 * out, so the only memory this app has of an import is the one the caller stores (design D7).
 */

/**
 * What ordering a run needs of a link, and nothing more: which monobank account it is, and when a
 * run last sent the bank a request about it.
 */
export interface OrderableLink {
  readonly monobankAccountId: string;
  /** Epoch milliseconds of the last turn, or `null` for a link that has never had one. */
  readonly lastAttemptedAtMs: number | null;
}

/**
 * The linked accounts in the order a run should give them their turns: longest since its turn
 * first, a link that has never had one before every link that has, and the monobank account id as
 * the tie-break so a run is reproducible.
 *
 * A **turn** is a run sending the bank a request about that link — taken whatever the answer was.
 * Rationing on the turn rather than on the last *completed* sync is the whole of the fairness
 * argument: monobank allows one request a minute, so a run over nine accounts needs nine minutes
 * of the app being open and may end at any point before that. Ordered by anything that does not
 * move when a link fails, a link that can never complete would head every run for good and the
 * rest would never be reached at all — which is exactly the bug this exists to remove, and what an
 * order fixed at the account id did to every link after the third.
 *
 * Returns a new array; the input is not touched.
 */
export function syncOrder<T extends OrderableLink>(links: readonly T[]): T[] {
  return [...links].sort((a, b) => {
    if (a.lastAttemptedAtMs !== b.lastAttemptedAtMs) {
      // `null` is «has waited longest», not «waited no time»: a link no run has spent a request
      // on is the one the app knows nothing about, and it goes first.
      if (a.lastAttemptedAtMs === null) return -1;
      if (b.lastAttemptedAtMs === null) return 1;
      return a.lastAttemptedAtMs - b.lastAttemptedAtMs;
    }
    return a.monobankAccountId < b.monobankAccountId
      ? -1
      : a.monobankAccountId > b.monobankAccountId
        ? 1
        : 0;
  });
}

/**
 * How long a stored client-info answer goes on serving a прогін nobody asked for — the **межа
 * свіжості**, and therefore the most транзакції may lag the bank by.
 *
 * An hour. The phone's chances come about four to it, so an hour spends one of them on балanci and
 * leaves three for the statement requests that actually import; a shorter bound spends more chances
 * on balances, a longer one commits figures older than the owner would recognise. It is not a
 * freshness promise about the балanci — a прогін imports nothing later than the answer it used, so
 * an old answer makes an old *span*, not a wrong one.
 */
export const CLIENT_INFO_FRESH_MS = 60 * 60 * 1000;

/** What `usableAccounts` needs of a link: which monobank account it is, and where it stands. */
export interface NamedLink {
  readonly monobankAccountId: string;
  /** Everything up to and including this instant is imported and committed. */
  readonly cursorMs: number;
  /** When a sync last *completed* for this link, or `null` for one none ever has. */
  readonly lastSyncedAtMs: number | null;
}

/** What a прогін reads of a stored рахунок; the rest of `StoredMonobankAccount` is nobody's here. */
export interface RememberedAccount {
  readonly id: string;
  readonly currency: CurrencyCode;
  readonly bankBalance: Money;
  readonly obtainedAt: Date;
}

/** The stored client-info answer a прогін may use, and the moment it was obtained. */
export interface UsableAnswer<T> {
  readonly accounts: ReadonlyMap<string, T>;
  readonly obtainedAt: Date;
}

/**
 * The newest client-info answer this phone has stored, when it is still fresh enough to spare a
 * прогін the request — or `undefined`, meaning ask the bank.
 *
 * The unit is the **answer**, not the row, and that is the whole of the decision. `upsertAccounts`
 * inserts and updates and never deletes, so a рахунок the token has stopped showing keeps a row
 * whose moment no answer will ever refresh. A per-row rule («every link named by a fresh row, or
 * refetch») would therefore answer «refetch» for ever on such a phone — the refetch could not heal
 * it, because the fresh answer does not name it either — and every прогін would spend its one
 * request a minute on client-info and import nothing, which is exactly the defect this exists to
 * remove.
 *
 * Every row one `upsertAccounts` call writes carries the `obtainedAt` it was given, so the newest
 * moment across the rows *is* an answer's moment, and the rows carrying exactly that moment are the
 * рахунки that answer named. A link outside them is one the newest answer did not name — which the
 * caller reads as «the token no longer shows this рахунок», the same verdict a fetched answer gives
 * it, and never as a reason to ask again.
 *
 * `links` is taken for two questions. A phone with no links at all is handed no answer to use; and
 * an answer older than the cursor of a рахунок no sync has ever completed cannot serve this run at
 * all. That рахунок's вікна all lie after the answer, so the run would have nothing to ask about
 * it and nothing to report but «finished without asking» — while the screen goes on saying «Ще не
 * синхронізовано», because nothing was. Asking the bank instead costs one request and heals it:
 * the answer that comes back is dated now, which is past the boundary the owner set.
 *
 * A newest moment in the future of the device's clock — an NTP correction, a clock set by hand —
 * is not fresh. `syncDue` and the pace guard the same hazard the same way: one extra request, and
 * the answer it brings heals the rows.
 */
export function usableAccounts<T extends RememberedAccount>(
  rows: readonly T[],
  links: readonly NamedLink[],
  nowMs: number,
  freshMs: number = CLIENT_INFO_FRESH_MS,
): UsableAnswer<T> | undefined {
  if (rows.length === 0 || links.length === 0) {
    return undefined;
  }
  const newestMs = rows.reduce((newest, row) => Math.max(newest, row.obtainedAt.getTime()), -Infinity);
  if (!Number.isFinite(newestMs) || newestMs > nowMs || nowMs - newestMs >= freshMs) {
    return undefined;
  }
  // A рахунок the owner linked since this answer was obtained, and which no sync has completed:
  // the answer reaches nothing of its history, so it is not an answer this run may work from. Only
  // when asking would actually help — a boundary in the future of the clock itself is not healed
  // by any answer, and forcing a request for it would spend the allowance every run for ever.
  //
  // One case this does keep asking about, knowingly: a token whose accounts are all gone answers
  // client-info with none, `upsertAccounts` stores nothing, the newest moment does not move, and
  // this stays true. The run then refetches next time. It costs nothing that could have been
  // spent — every link is `unavailable` under such an answer, so there is no statement request the
  // allowance would otherwise have gone to — and the quiet interval holds it to one request a
  // quarter of an hour. It is also how the phone notices the accounts coming back.
  if (links.some((l) => l.lastSyncedAtMs === null && l.cursorMs >= newestMs && l.cursorMs < nowMs)) {
    return undefined;
  }
  const accounts = new Map<string, T>();
  for (const row of rows) {
    if (row.obtainedAt.getTime() === newestMs) {
      accounts.set(row.id, row);
    }
  }
  return { accounts, obtainedAt: new Date(newestMs) };
}

/** One statement request's span, epoch milliseconds, both ends inclusive. */
export interface StatementWindow {
  readonly fromMs: number;
  readonly toMs: number;
}

/**
 * The windows covering everything between a moment and now, oldest first: each within the API's
 * 31-days-and-an-hour limit, together covering the whole span, and none overlapping another.
 *
 * Oldest first because that is the order the owner's history reads in, and because a sync
 * interrupted halfway then leaves a prefix done rather than a hole. A span of nothing — syncing
 * twice in the same millisecond — plans no request at all; both ends of a window are inclusive, so
 * the next sync's first window still covers that moment.
 */
export function planWindows(fromMs: number, nowMs: number): StatementWindow[] {
  if (!Number.isFinite(fromMs) || !Number.isFinite(nowMs) || nowMs <= fromMs) {
    return [];
  }
  const windows: StatementWindow[] = [];
  let start = fromMs;
  for (;;) {
    const end = Math.min(start + MAX_STATEMENT_WINDOW_MS, nowMs);
    windows.push({ fromMs: start, toMs: end });
    if (end >= nowMs) {
      return windows;
    }
    // The next window starts the millisecond after this one ends: no gap, no overlap.
    start = end + 1;
  }
}

/** Whether an answer was full, meaning the API had more to say than it fit in one page. */
export function isFullAnswer(items: readonly StatementItem[]): boolean {
  return items.length >= STATEMENT_PAGE_SIZE;
}

/**
 * The rest of a window whose answer was full: the same start, now ending at the oldest item that
 * came back. The end is that item's own moment rather than the millisecond before it, because
 * several operations can share a second and asking again from just before one of them would drop
 * its neighbours; the overlap costs a re-read of items already seen, and an item imports at most
 * once no matter how often it is read.
 *
 * `undefined` means there is nothing left to ask for and the caller moves on to the next window.
 * That is the answer whenever the continuation would not be a *different* request from the one
 * just made — the oldest item is at or before the window's start, or it lands in the same second
 * the window already ends in. Progress is measured in seconds because that is what the URL
 * carries: a narrower end that floors to the same second would repeat the identical request, and a
 * caller looping "until an answer is short" would then loop forever. The price is that 500 items
 * inside one second would be truncated — an amount of money the owner cannot spend in a second,
 * and a far better failure than a sync that never ends.
 */
export function continueWindow(
  window: StatementWindow,
  oldestItemMs: number,
): StatementWindow | undefined {
  const toMs = Math.min(oldestItemMs, window.toMs);
  if (toMs <= window.fromMs || Math.floor(toMs / 1000) >= Math.floor(window.toMs / 1000)) {
    return undefined;
  }
  return { fromMs: window.fromMs, toMs };
}

/** What mapping a statement needs to know beyond the items themselves. */
export interface MapContext {
  /** The рахунок the linked monobank account maps onto. */
  readonly accountId: string;
  /** Its currency — the one every транзакція from this statement is in. */
  readonly currency: CurrencyCode;
  /** The owner's правила, applied by description and MCC exactly as any other import applies them. */
  readonly rules: readonly Rule[];
  /** The ids already imported for this monobank account. Input and output, never hidden state. */
  readonly seenIds: ReadonlySet<string>;
  readonly newId: () => string;
}

export interface MappedStatement {
  /** In the order the items arrived. */
  readonly transactions: readonly Transaction[];
  /**
   * The imported set as it now stands — what came in, plus every readable id in this batch,
   * including the ids of items that produced no транзакція. Handing this straight back as the
   * next call's `seenIds` is the whole of the contract; the caller stores it and never unions.
   */
  readonly seenNow: ReadonlySet<string>;
}

/**
 * Statement items → the транзакції to store, deterministically: the same items, правила and seen
 * set always produce the same result.
 *
 * Money that left is a витрата in the категорія the owner's правила give it, «Без категорії» when
 * none matches. Money that arrived is a дохід with the reserved джерело «Без джерела» — a starting
 * state, not a verdict: an arriving повернення or cashback is money the owner retypes through
 * витрата into повернення, because a повернення is never income. Nothing here reclassifies it on
 * the owner's behalf, and the «Без джерела» mark is what keeps it visible until they do.
 *
 * A hold maps exactly like a settled operation — a hold is just a transaction — and an item of
 * zero maps to nothing while still being remembered, so it is not re-examined forever.
 */
export function mapStatement(
  items: readonly StatementItem[],
  ctx: MapContext,
): MappedStatement {
  const seenNow = new Set(ctx.seenIds);
  const transactions: Transaction[] = [];

  for (const item of items) {
    if (item.amount.currency !== ctx.currency) {
      // The parser was handed one currency and the mapper another: relabelling money silently is
      // the one thing worse than stopping, so this wiring mistake is loud.
      throw new Error(
        `statement of ${item.amount.currency} cannot map onto ${ctx.currency} account "${ctx.accountId}"`,
      );
    }
    // Whether it maps to anything or not, the id is now known — that is what "at most once,
    // forever" means, and it is checked before anything else is decided.
    const alreadySeen = seenNow.has(item.id);
    seenNow.add(item.id);
    if (alreadySeen || item.amount.amount === 0) {
      continue;
    }

    if (item.amount.amount < 0) {
      const categoryId = matchRule(ctx.rules, {
        description: item.description,
        mcc: item.mcc,
      });
      transactions.push(
        expenseByDefault({
          id: ctx.newId(),
          date: item.date,
          accountId: ctx.accountId,
          amount: money(-item.amount.amount, ctx.currency),
          // No match means no categoryId at all: the «Без категорії» default is the domain's.
          ...(categoryId ? { categoryId } : {}),
          // No original-currency сума — a deferral, not an impossibility: a statement does name
          // the bank's own сума and the currency it is in, but nothing here reads the pair and no
          // screen shows one. What the bank charged the рахунок is exact, and that is what counts.
          description: item.description,
        }),
      );
      continue;
    }

    // A дохід carries no original-currency сума — there is no field for one, and the loss is
    // informational and deliberate (the spec says so in as many words).
    const income: Income = {
      type: 'income',
      id: ctx.newId(),
      // `expenseByDefault` validates the date of a витрата; a дохід has no factory, so it is
      // validated here rather than being the one транзакція that trusts its input.
      date: isoDate(item.date),
      accountId: ctx.accountId,
      amount: money(item.amount.amount, ctx.currency),
      sourceId: UNSOURCED_SOURCE_ID,
      // Guarded exactly as the domain's factories guard it, so an item the bank sent no text with
      // makes a дохід of the same shape as the витрата beside it — not one carrying an empty опис.
      ...(item.description ? { description: item.description } : {}),
    };
    transactions.push(income);
  }

  return { transactions, seenNow };
}
