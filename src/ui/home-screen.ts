import type { Account } from '../domain/account';
import { monthlyPicture } from '../domain/monthly-picture';
import { type CurrencyCode, type Money } from '../domain/money';
import type { Month, Transaction } from '../domain/transaction';
import { needsOwner, type OwnerSituation, type SyncAttempt } from '../monobank/auto';
import type { MonobankRate } from '../monobank/currency';
import { accountTotals, approximateTotals, totalsLine } from './account-totals';
import { byCurrency } from './amount-input';
import { freshnessLabel } from './dates';
import { transactionCount } from './labels';
import { emptyMessageFor, NO_INCOME_NOTE } from './month-screen';
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

/** The glossary's words, as the two headings the status carries. */
const LEFT_LABEL = 'Залишилось';
const SPENT_LABEL = 'Витрачено';

export interface HomeMonthStatus {
  /** «Залишилось у вересні» — the figure's name and the month it is about, in one line. */
  readonly title: string;
  /**
   * The month's залишилось, per currency, joined by `totalsLine` — the same joiner the money held
   * uses, so the two lines cannot drift apart in how they refuse to become one figure: «60315,00
   * UAH · −70,00 USD». Empty exactly when `emptyMessage` is not null.
   */
  readonly left: string;
  /** «Витрачено», so the screen does not spell the glossary word itself. */
  readonly spentLabel: string;
  /** The month's витрачено, per currency, joined the same way. */
  readonly spent: string;
  /**
   * Why залишилось may be negative: no дохід is recorded in some currency of the month yet. The
   * sentence Місяць uses, naming the currencies when the month holds more than one. `null` when
   * every currency of the month has дохід above zero.
   */
  readonly note: string | null;
  /** What to say instead of the numbers when there are none; `null` when there are. */
  readonly emptyMessage: string | null;
}

export interface HomeHeld {
  /** «329 748,00 UAH · 700,00 USD» — per currency, never combined. */
  readonly line: string;
  /** The «≈ … грн» beside it, or `null` when there is nothing honest to show. */
  readonly approximate: string | null;
}

export interface HomeAttention {
  /**
   * The counted rows the section names — today only «Без категорії». The pending чернетки are the
   * screen's own block below them: they are answered in place, not counted.
   */
  readonly rows: readonly string[];
  /**
   * The monobank row, when monobank needs the owner: what happened, and that it opens the monobank
   * screen. `null` the rest of the time, which is nearly always — a failed run over fresh data
   * puts nothing here (`needsOwner`).
   */
  readonly monobank: string | null;
  /** Whether the section exists at all. False means no heading and no space held for one. */
  readonly present: boolean;
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

/** The monobank line on Головний: how fresh the bank data is, and nothing else. */
export interface HomeMonobank {
  /** «оновлено 3 хв тому», «Синхронізація…», or that nothing has synced yet. */
  readonly freshness: string;
}

export interface HomeViewModel {
  readonly month: Month;
  readonly status: HomeMonthStatus;
  /** `null` when no unarchived рахунок exists — the screen says so instead. */
  readonly held: HomeHeld | null;
  readonly attention: HomeAttention;
  /**
   * `null` when monobank is not configured or nothing is linked: an owner who never connected a
   * bank is told nothing about one.
   */
  readonly monobank: HomeMonobank | null;
}

/**
 * Which currencies of the month have no дохід to set their витрати against. Per currency, because
 * Місяць decides it per currency: a month with UAH дохід and USD-only витрати is honestly two
 * situations, and the negative one has to carry its reason where it is shown.
 */
function noteFor(currencies: readonly CurrencyCode[], without: readonly CurrencyCode[]): string | null {
  if (without.length === 0) {
    return null;
  }
  if (currencies.length === 1) {
    return NO_INCOME_NOTE;
  }
  return `У цьому місяці ще не записано дохід у ${without.join(' і ')}.`;
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
  /** How many stored витрати carry «Без категорії», counted over everything stored. */
  uncategorised: number;
  /** How many чернетки await an answer. Counted for nothing but whether the section exists. */
  pendingDrafts: number;
  /**
   * The monobank connection as this screen sees it, or absent on a device with none. `linked` is
   * how many рахунки are linked; `lastCompletedAtMs` the most recent completed sync among them,
   * absent when none ever has; `syncing` whether a run is going on right now, whoever started it.
   */
  monobank?: {
    readonly configured: boolean;
    readonly linked: number;
    readonly lastCompletedAtMs?: number;
    readonly syncing: boolean;
    readonly attempt?: SyncAttempt;
  };
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

  const rows: string[] = [];
  if (input.uncategorised > 0) {
    rows.push(`${transactionCount(input.uncategorised)} без категорії`);
  }

  // A bank the owner never connected, or connected and never linked a рахунок to, gets no line
  // and no row: nothing about monobank appears on this screen at all.
  const bank = input.monobank;
  const connected = bank !== undefined && bank.configured && bank.linked > 0;
  const situation = connected
    ? needsOwner({
        attempt: bank.attempt,
        ...(bank.lastCompletedAtMs === undefined
          ? {}
          : { lastCompletedAtMs: bank.lastCompletedAtMs }),
        nowMs: input.now.getTime(),
      })
    : undefined;
  const monobank: HomeMonobank | null = connected
    ? {
        freshness: bank.syncing
          ? SYNCING_LINE
          : bank.lastCompletedAtMs === undefined
            ? NEVER_SYNCED_LINE
            : `оновлено ${freshnessLabel(bank.lastCompletedAtMs, input.now)}`,
      }
    : null;
  const attentionRow = situation === undefined ? null : ATTENTION_WORDS[situation];

  return {
    month: input.month,
    status: {
      title: `${LEFT_LABEL} ${monthInLabel(input.month)}`,
      left: totalsLine(numbers.map((n) => n.left)),
      spentLabel: SPENT_LABEL,
      spent: totalsLine(numbers.map((n) => n.spent)),
      note: noteFor(
        currencies,
        currencies.filter((currency) => picture.get(currency)!.income.amount <= 0),
      ),
      emptyMessage: emptyMessageFor(currencies.length, input.transactions.length > 0),
    },
    held:
      totals.total.length > 0
        ? {
            line: totalsLine(totals.total),
            approximate: approximateTotals(totals.total, input.rates),
          }
        : null,
    attention: {
      rows,
      monobank: attentionRow,
      present: rows.length > 0 || input.pendingDrafts > 0 || attentionRow !== null,
    },
    monobank,
  };
}
