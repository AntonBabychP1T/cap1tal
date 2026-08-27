import { money, type CurrencyCode } from '../domain/money';
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
          // No original-currency сума: a monobank statement never names the currency of a foreign
          // purchase's own amount, so there is none to carry (design D12).
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
