import type { Account } from '../domain/account';
import { monthlyPicture } from '../domain/monthly-picture';
import { type Money } from '../domain/money';
import type { Month, Transaction } from '../domain/transaction';
import { needsOwner, type OwnerSituation, type SyncAttempt } from '../monobank/auto';
import type { MonobankRate } from '../monobank/currency';
import { accountTotals, approximateTotals, totalsLine, wholeMoney } from './account-totals';
import { byCurrency } from './amount-input';
import { queueRow, type AnswerQueue } from './answer-queue';
import { calendarLabel, dateOfEpochMs, freshnessLabel } from './dates';
import { plural } from './labels';
import { syncedCountLine } from './monobank-screen';
import { monthInLabel } from './months';

/**
 * Everything Головний says, as strings — so what the screen the app opens on reads is under
 * `verify` even though the screen itself is JSX. The screen maps over this and adds no decisions
 * of its own.
 *
 * Nothing here computes money. The month's numbers are `monthlyPicture`'s, the total is
 * `accountTotals`', the approximation is `approximateTotals`'; this module chooses which of them
 * Головний shows, in which order, and in what words. See design.md §D5.
 */

/** The glossary's word, as the heading the status carries. */
const SPENT_LABEL = 'Витрачено';

export interface HomeMonthStatus {
  /** «Витрачено у вересні» — the figure's name and the month it is about, in one line. */
  readonly title: string;
  /**
   * The month's витрачено, per currency, joined by `totalsLine` — the same joiner the money held
   * uses, so the two lines cannot drift apart in how they refuse to become one figure: «125,50
   * UAH · 2,05 USD». Empty exactly when `emptyMessage` is not null. Signed: a refund-only month
   * shows a negative amount rather than zero or дохід (main-screen, "Refund-only month remains
   * negative").
   */
  readonly spent: string;
  /**
   * The same figures one currency at a time, in `spent`'s order: what the screen draws, so a change
   * of one currency's витрачено moves that figure alone (motion, "A changing сума never shows an
   * amount that is not real"). Joined by « · » they are exactly `spent`.
   */
  readonly spentFigures: readonly { readonly currency: string; readonly text: string }[];
  /**
   * What to say instead of an amount: no транзакція at all this month, or only ordinary
   * unclassified перекази (which touch no monthly number and would otherwise read as a currency
   * that does not exist). `null` when there is a real spent figure to show.
   */
  readonly emptyMessage: string | null;
}

export interface HomeHeld {
  /** «329 748,00 UAH · 700,00 USD» — per currency, never combined. */
  readonly line: string;
  /** The «≈ … грн» beside it, or `null` when there is nothing honest to show. */
  readonly approximate: string | null;
}

/**
 * The compact rows of the fixed service rail — at most two (main-screen, "One rail row names what
 * waits for an answer and opens the queue", "Operational alerts remain compact and actionable").
 * Neither an empty heading nor reserved space stands for one that is absent: a `null` field renders
 * nothing at all, not a placeholder.
 */
export interface HomeAlerts {
  /**
   * «Що потребує відповіді: 12» with its kinds in the queue's order — «2 чернетки · 1 дубль · 8 без
   * категорії · 1 без джерела» — counted by `queueRow` over the same queue the screen opens, so the
   * two never disagree. `null` when nothing waits; the bank is never counted in it.
   */
  readonly queueRow: { readonly total: number; readonly label: string; readonly kinds: string } | null;
  /**
   * The actionable monobank row, when monobank needs the owner: what happened, and that it opens
   * the monobank screen. `null` the rest of the time, which is nearly always — a failed run over
   * fresh data puts nothing here (`needsOwner`). With рахунки linked and no token it is the
   * `bank-unheard` item instead (`bankUnheardRow`): not a failed run but no run at all.
   */
  readonly failureRow: string | null;
}

/** What the freshness line says, in the owner's words. */
export const SYNCING_LINE = 'Синхронізація…';
export const NEVER_SYNCED_LINE = 'Ще не синхронізовано з monobank';

/**
 * The two situations `needsOwner` can name, as the row the owner reads. The words live here and
 * not in `src/monobank/`: what appears on a screen is this capability's, and the engine answers
 * only *whether* and *which*.
 */
const ATTENTION_WORDS: Readonly<Record<OwnerSituation, string>> = {
  'token-rejected': 'monobank відхилив токен — оновіть його',
  'not-refreshed': 'Дані monobank не оновлюються',
};

/**
 * The `bank-unheard` attention item (main-screen, "A linked bank without a token is stated under
 * the header"): рахунки are linked, no token is kept, so nothing is read — said with how many and
 * since when. The дата is the oldest completed sync among the linked рахунки that ever synced
 * (`syncCoverage`'s `oldestSyncedMs`), so one that never synced does not hide the others'; with none
 * synced there is no дата to name. «дані 2 рахунків» — the genitive, which «дані» takes for every
 * number: «1 рахунку», «21 рахунку», «9 рахунків».
 */
function bankUnheardRow(linked: number, oldestSyncedAtMs: number | undefined, now: Date): string {
  const whose = `дані ${linked} ${plural(linked, 'рахунку', 'рахунків', 'рахунків')}`;
  return oldestSyncedAtMs === undefined
    ? `Немає токена monobank — ${whose} ще не синхронізовано`
    : `Немає токена monobank — ${whose} не оновлюються з ${calendarLabel(dateOfEpochMs(oldestSyncedAtMs), now)}`;
}

/** The monobank line on Головний: how fresh the bank data is, and nothing else. */
export interface HomeMonobank {
  /**
   * «оновлено 3 хв тому» once every linked рахунок has synced, «Синхронізовано 3 з 9 рахунків»
   * while only some have, «Синхронізація…» while a run is going on, or that nothing has synced
   * yet.
   */
  readonly freshness: string;
}

/**
 * The freshness line, in Головний's shorter words — the same three-way reading the monobank
 * screen states at length, over the same coverage.
 *
 * The age is the **oldest** completed sync's, and only when every linked рахунок has one: an age
 * read off the рахунки that did sync would tell the owner their picture is fresh while most of
 * their money is missing from it. While it is partial the count replaces the age outright, so
 * there is no flattering number on the screen to misread.
 */
function freshnessOf(
  bank: {
    readonly linked: number;
    readonly synced: number;
    readonly oldestCompletedAtMs?: number;
    readonly syncing: boolean;
  },
  now: Date,
): string {
  if (bank.syncing) {
    return SYNCING_LINE;
  }
  if (bank.synced === 0) {
    return NEVER_SYNCED_LINE;
  }
  if (bank.oldestCompletedAtMs === undefined) {
    return syncedCountLine({ linked: bank.linked, synced: bank.synced });
  }
  return `оновлено ${freshnessLabel(bank.oldestCompletedAtMs, now)}`;
}

export interface HomeViewModel {
  readonly month: Month;
  readonly status: HomeMonthStatus;
  /** `null` when no unarchived рахунок exists — the screen says so instead. */
  readonly held: HomeHeld | null;
  readonly alerts: HomeAlerts;
  /**
   * `null` when monobank is not configured or nothing is linked: an owner who never connected a
   * bank is told nothing about one.
   */
  readonly monobank: HomeMonobank | null;
}

/**
 * What the month card says instead of an amount: no транзакція at all this month, or ordinary
 * unclassified перекази alone — two different situations that would otherwise look like the same
 * blank card (main-screen, "Empty and transfer-only months are distinct"). Its own wording, not
 * `month-screen.ts`'s `emptyMessageFor`: that one is Місяць's, and this is not a redesign of
 * Місяць — sharing the function would mean sharing the words, which the two screens no longer do.
 */
function monthEmptyMessage(currencyCount: number, hasTransactions: boolean): string | null {
  if (currencyCount > 0) {
    return null;
  }
  return hasTransactions ? 'Цього місяця лише перекази.' : 'Цього місяця ще немає транзакцій.';
}

/** The monobank connection as Головний and the queue see it — `syncCoverage`'s answer and the run. */
export interface RailMonobank {
  readonly configured: boolean;
  readonly linked: number;
  /** How many linked рахунки a sync has ever completed for. */
  readonly synced: number;
  /** The oldest of those moments — present only when every linked рахунок has one. */
  readonly oldestCompletedAtMs?: number;
  /**
   * The oldest of those moments among the рахунки that have one — `syncCoverage`'s
   * `oldestSyncedMs`, present whenever any has synced. Read only by the no-token row.
   */
  readonly oldestSyncedAtMs?: number;
  readonly syncing: boolean;
  readonly attempt?: SyncAttempt;
}

/**
 * The rail's monobank row, or `null`: a linked bank without a token (`bankUnheardRow`), or monobank
 * needing the owner (`needsOwner`). One function, called by `homeViewModel` and by the queue «Що
 * потребує відповіді» alike, so the queue's bank entry says the same thing in the same words and
 * leaves exactly when this row leaves Головний (answer-queue design D1).
 */
export function monobankRailRow(bank: RailMonobank | undefined, now: Date): string | null {
  const connected = bank !== undefined && bank.configured && bank.linked > 0;
  // Linked and no token: not a failed run but no run at all, so `needsOwner` is not asked (and the
  // background task does not notify about it).
  if (bank !== undefined && !bank.configured && bank.linked > 0) {
    return bankUnheardRow(bank.linked, bank.oldestSyncedAtMs, now);
  }
  if (!connected) return null;
  const situation = needsOwner({
    attempt: bank.attempt,
    // The whole-bank moment, not the freshest рахунок's: a bank the app has never wholly heard
    // from is not fresh data whatever its best corner says, so a failing run over it is a failure
    // over stale data and the row appears. Deciding this from the newest moment is what let one
    // рахунок of nine silence the row entirely.
    ...(bank.oldestCompletedAtMs === undefined ? {} : { lastCompletedAtMs: bank.oldestCompletedAtMs }),
    nowMs: now.getTime(),
  });
  return situation === undefined ? null : ATTENTION_WORDS[situation];
}

export function homeViewModel(input: {
  month: Month;
  /** Every account, archived included: classifying a transfer needs its вид (design decision 8). */
  accounts: readonly Account[];
  /** The транзакції of `month`, as the screen loaded them. */
  transactions: readonly Transaction[];
  /** The розрахунковий баланс per account id — the same map Рахунки builds. */
  balances: ReadonlyMap<string, Money>;
  rates: readonly MonobankRate[];
  /** The queue «Що потребує відповіді», unnarrowed, as `answerQueue` read it for this screen. */
  queue: AnswerQueue;
  /**
   * The monobank connection as this screen sees it, or absent on a device with none.
   *
   * The coverage — `linked`, `synced` and `oldestCompletedAtMs` — is `syncCoverage`'s own answer,
   * read once where the links are and passed in whole. A reading, not a table: this view model
   * does not take links and should not start to. `syncing` is whether a run is going on right
   * now, whoever started it.
   */
  monobank?: RailMonobank;
  /** The moment the screen is drawn — every clock in this app is passed in. */
  now: Date;
}): HomeViewModel {
  const picture = monthlyPicture({
    month: input.month,
    accounts: input.accounts,
    transactions: input.transactions,
  });
  const currencies = [...picture.keys()].sort(byCurrency);
  const numbers = currencies.map((currency) => picture.get(currency)!);

  const totals = accountTotals(input.accounts, input.balances);

  // A bank the owner never connected, or connected and never linked a рахунок to, gets no line
  // and no row: nothing about monobank appears on this screen at all.
  const bank = input.monobank;
  const connected = bank !== undefined && bank.configured && bank.linked > 0;
  const monobank: HomeMonobank | null = connected
    ? { freshness: freshnessOf(bank, input.now) }
    : null;
  const failureRow = monobankRailRow(bank, input.now);

  return {
    month: input.month,
    status: {
      title: `${SPENT_LABEL} ${monthInLabel(input.month)}`,
      spent: totalsLine(numbers.map((n) => n.spent)),
      spentFigures: numbers.map((n) => ({ currency: n.spent.currency, text: wholeMoney(n.spent) })),
      emptyMessage: monthEmptyMessage(currencies.length, input.transactions.length > 0),
    },
    held:
      totals.total.length > 0
        ? {
            line: totalsLine(totals.total),
            approximate: approximateTotals(totals.total, input.rates),
          }
        : null,
    alerts: {
      queueRow: queueRow(input.queue),
      failureRow,
    },
    monobank,
  };
}
