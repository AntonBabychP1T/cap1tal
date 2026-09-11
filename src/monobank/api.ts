import { money, subtract, type CurrencyCode, type Money } from '../domain/money';
import type { IsoDate } from '../domain/transaction';

/**
 * monobank's **personal** API — the one that needs the owner's token, sibling of the tokenless
 * `currency.ts` and deliberately not part of it: that module's comment promises no token comes
 * near it, so the token-aware seam lives here instead (design D2).
 *
 * Two things are true of everything below. Failures are values, never exceptions: every call
 * answers with exactly one `Outcome`, and the token appears in none of them, so nothing
 * downstream can log what it must not (design D3). And parsing is total *and* whole: an
 * unexpected payload yields `unavailable` rather than a half-read list, because a statement row
 * is the owner's money — unlike a rate row, dropping one silently would break the trust the whole
 * app rests on (design D4).
 *
 * This is also, like `currency.ts`, a boundary where floats would stop — except that the personal
 * API speaks in minor units already, so every amount here is an integer from the start and any
 * number that is not one makes its row unreadable.
 */

export const MONOBANK_API_BASE = 'https://api.monobank.ua';
export const MONOBANK_CLIENT_INFO_URL = `${MONOBANK_API_BASE}/personal/client-info`;

/** The API's own limit on one statement request: 31 days and one hour, in milliseconds. */
export const MAX_STATEMENT_WINDOW_MS = (31 * 24 * 60 * 60 + 60 * 60) * 1000;

/** The API's page size. An answer holding exactly this many has more behind it. */
export const STATEMENT_PAGE_SIZE = 500;

/**
 * Only what this module needs of `fetch`, with the header slot the personal API requires — the
 * seam that keeps tests off the network exactly as `FetchLike` does for the rate endpoint.
 */
export type AuthFetchLike = (
  url: string,
  headers: Readonly<Record<string, string>>,
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}>;

/**
 * Why an `unavailable` answer came to that after the bank *did* respond — absent when it never
 * got that far (the fetch itself rejected, or the bank refused the request with a status the run
 * names on its own), since those already read as themselves on the request's own `network`
 * журнал entry and naming them again here would be the app quoting itself.
 *
 * There were three of these once. `currency-mismatch` named a statement row whose currency was not
 * the рахунок's — retired, because that field names the currency of the транзакція the bank carried
 * out and never was a fact about the рахунок, so nothing can produce the word any more and the
 * журнал must not carry one it can never write.
 */
export type UnavailableReason = 'unparseable-body' | 'unreadable-payload';

/**
 * What a call to the personal API can answer. The three failures are the three the screen change
 * has to tell apart: re-enter the token, wait, or shrug and try later. None of them carries the
 * token, and none of them is a partially read answer.
 */
export type Outcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'invalid-token' }
  | { readonly kind: 'rate-limited' }
  | { readonly kind: 'unavailable'; readonly reason?: UnavailableReason };

const INVALID_TOKEN: Outcome<never> = { kind: 'invalid-token' };
const RATE_LIMITED: Outcome<never> = { kind: 'rate-limited' };
const UNAVAILABLE: Outcome<never> = { kind: 'unavailable' };

function unavailable(reason: UnavailableReason): Outcome<never> {
  return { kind: 'unavailable', reason };
}

/** One of the owner's monobank accounts: a card, or a банка (jar). */
export interface MonobankAccount {
  readonly id: string;
  /** A card suggests a рахунок of вид `spending`, a банка one of вид `savings` (see `link.ts`). */
  readonly kind: 'card' | 'jar';
  readonly currency: CurrencyCode;
  /** A card by its type and masked number, a банка by its title. */
  readonly name: string;
  /** What the bank reports, the credit limit included — not all of it is the owner's money. */
  readonly balance: Money;
  /** The bank's money inside `balance`. Zero for a банка and for a card without a limit. */
  readonly creditLimit: Money;
  /**
   * Баланс банку: `balance − creditLimit`, the owner's own money, which may be negative when the
   * card is deep in its limit. Derived here, in one place, so nothing downstream re-derives it.
   */
  readonly bankBalance: Money;
}

/** One row of a statement, read whole. */
export interface StatementItem {
  /** monobank's own id for the operation — what deduplication is done on, forever. */
  readonly id: string;
  /**
   * The moment of the operation, epoch milliseconds. Kept beside the calendar date because a
   * window whose answer was full is continued at the oldest received item's *moment* — a
   * calendar day is far too coarse to page on (design D6).
   */
  readonly timeMs: number;
  readonly date: IsoDate;
  readonly description: string;
  readonly mcc: number;
  /** Signed, in the account's currency: negative money left, positive money arrived. */
  readonly amount: Money;
  readonly hold: boolean;
}

/**
 * ISO-4217 numeric → the code the app uses. Exactly the currencies a рахунок can be opened in
 * (`OFFERED_CURRENCIES` in `src/ui/labels.ts`, which a test here holds this table against), and
 * they share one property the app depends on: two minor digits, so a payload's minor units are
 * this app's minor units with no exponent in between.
 *
 * An account in any other currency is left out — the app cannot hold it.
 */
export const CURRENCY_BY_NUMERIC: Readonly<Record<number, CurrencyCode>> = {
  840: 'USD',
  978: 'EUR',
  980: 'UAH',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A field that must be an integer number of minor units. Anything else makes the row unreadable. */
function asMinorUnits(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The one place a call to the personal API becomes an `Outcome`. The token goes out in the header
 * and stays there: it is never put in a URL (where it would land in any log of one) and never in
 * what comes back. A thrown fetch and any status that is not a parsed 200-family answer both
 * become `unavailable` with no `reason` — the request's own журнал entry already names them. A
 * body that will not even parse as JSON is `unavailable` with reason `unparseable-body`; a body
 * that parses but that `parse` rejects — including a parser that throws, so a caller's own
 * `dateOf` cannot turn a bad payload into a crash — is `unavailable` with whatever `classify`
 * answers for it, or `unreadable-payload` when no `classify` was given.
 */
async function ask<T>(
  fetchImpl: AuthFetchLike,
  url: string,
  token: string,
  parse: (payload: unknown) => T | undefined,
  classify?: (payload: unknown) => UnavailableReason,
): Promise<Outcome<T>> {
  let response: Awaited<ReturnType<AuthFetchLike>>;
  try {
    response = await fetchImpl(url, { 'X-Token': token });
  } catch {
    return UNAVAILABLE;
  }
  if (response.status === 401 || response.status === 403) {
    return INVALID_TOKEN;
  }
  if (response.status === 429) {
    return RATE_LIMITED;
  }
  if (!response.ok) {
    return UNAVAILABLE;
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return unavailable('unparseable-body');
  }
  let value: T | undefined;
  try {
    value = parse(payload);
  } catch {
    return unavailable(classify ? classify(payload) : 'unreadable-payload');
  }
  return value === undefined
    ? unavailable(classify ? classify(payload) : 'unreadable-payload')
    : { kind: 'ok', value };
}

/** `black ··1234`, or the bare type when the payload carries no card number to mask. */
function cardName(type: string, maskedPan: unknown): string {
  const pan = Array.isArray(maskedPan) ? maskedPan.find((p) => typeof p === 'string') : undefined;
  const last4 = typeof pan === 'string' ? pan.slice(-4) : '';
  return last4 ? `${type} ··${last4}` : type;
}

/**
 * A card row → an account, `undefined` when the row is unreadable, `null` when it is perfectly
 * readable but in a currency the app does not offer — the two are not the same answer: the first
 * fails the whole payload, the second is simply left out.
 */
function parseCard(row: unknown): MonobankAccount | null | undefined {
  if (!isRecord(row)) return undefined;
  const numeric = row.currencyCode;
  if (typeof numeric !== 'number') return undefined;
  const currency = CURRENCY_BY_NUMERIC[numeric];
  if (!currency) return null;

  const id = asNonEmptyString(row.id);
  const type = asNonEmptyString(row.type);
  const balance = asMinorUnits(row.balance);
  const creditLimit = asMinorUnits(row.creditLimit);
  if (id === undefined || type === undefined || balance === undefined || creditLimit === undefined) {
    return undefined;
  }
  const asReported = money(balance, currency);
  const credit = money(creditLimit, currency);
  return {
    id,
    kind: 'card',
    currency,
    name: cardName(type, row.maskedPan),
    balance: asReported,
    creditLimit: credit,
    bankBalance: subtract(asReported, credit),
  };
}

/** A банка row → an account. It has no credit limit, so its balance is the owner's money whole. */
function parseJar(row: unknown): MonobankAccount | null | undefined {
  if (!isRecord(row)) return undefined;
  const numeric = row.currencyCode;
  if (typeof numeric !== 'number') return undefined;
  const currency = CURRENCY_BY_NUMERIC[numeric];
  if (!currency) return null;

  const id = asNonEmptyString(row.id);
  const title = asNonEmptyString(row.title);
  const balance = asMinorUnits(row.balance);
  if (id === undefined || title === undefined || balance === undefined) {
    return undefined;
  }
  return {
    id,
    kind: 'jar',
    currency,
    name: title,
    balance: money(balance, currency),
    creditLimit: money(0, currency),
    bankBalance: money(balance, currency),
  };
}

/**
 * A client-info payload → the owner's monobank accounts, or `undefined` for anything that is not
 * one. `accounts` must be there and must be a list: without that check an arbitrary JSON object
 * would parse to "no accounts", which reads as "the owner has none" instead of "this is not
 * client-info". `jars` may be absent — a client with no банки is an ordinary client.
 */
export function parseClientInfo(payload: unknown): MonobankAccount[] | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.accounts)) {
    return undefined;
  }
  const jars = payload.jars ?? [];
  if (!Array.isArray(jars)) {
    return undefined;
  }
  const accounts: MonobankAccount[] = [];
  for (const row of payload.accounts) {
    const parsed = parseCard(row);
    if (parsed === undefined) return undefined;
    if (parsed !== null) accounts.push(parsed);
  }
  for (const row of jars) {
    const parsed = parseJar(row);
    if (parsed === undefined) return undefined;
    if (parsed !== null) accounts.push(parsed);
  }
  return accounts;
}

/** What a statement row needs from outside itself: the account's currency and a calendar. */
export interface StatementContext {
  readonly currency: CurrencyCode;
  /**
   * Unix seconds → the calendar date of that moment in the device's timezone. Injected because the
   * domain has no Date objects and no timezone opinion; tests pass a fixed zone (design D5).
   */
  readonly dateOf: (unixSeconds: number) => IsoDate;
}

/** `readItem`'s answer: the row read whole, or why it could not be — never a thrown exception. */
type ItemResult =
  | { readonly ok: true; readonly value: StatementItem }
  | { readonly ok: false; readonly reason: UnavailableReason };

const UNREADABLE_ROW: ItemResult = { ok: false, reason: 'unreadable-payload' };

/**
 * One statement row, read whole — the one place that decision is made, so `parseItem` (which
 * decides what a рахунок imports) and `statementUnavailableReason` (which only explains a rejected
 * payload to the owner) can never disagree about which row failed or why.
 *
 * Total: this never throws. `ctx.dateOf` is the one converter a row's own fields cannot prove safe
 * ahead of calling it — unlike `money`, whose `amount` is already a proven safe integer and whose
 * `ctx.currency` is always one this app offers — so it alone is wrapped. A `dateOf` that throws
 * reads as an unreadable row, exactly as every other malformed one does.
 */
function readItem(row: unknown, ctx: StatementContext): ItemResult {
  if (!isRecord(row)) return UNREADABLE_ROW;
  const id = asNonEmptyString(row.id);
  const time = asMinorUnits(row.time);
  const mcc = asMinorUnits(row.mcc);
  const amount = asMinorUnits(row.amount);
  if (id === undefined || time === undefined || mcc === undefined || amount === undefined) {
    return UNREADABLE_ROW;
  }
  if (typeof row.description !== 'string' || typeof row.hold !== 'boolean') {
    return UNREADABLE_ROW;
  }

  // `currencyCode` on a statement row is *not* read. The API documents it as the account's
  // currency, but it is the currency of the транзакція the bank carried out: `platinum ··6628`
  // (UAH) answered with 64 rows naming 980 and two naming 840, whose `amount ÷ operationAmount`
  // was the hryvnia-to-dollar rate and whose running balance lay inside the hryvnia rows' range.
  // So it never held the fact the old check asked it for, and checking it only wedged a рахунок
  // that had spent abroad. What identifies the рахунок is the account this request named;
  // `amount` is in that рахунок's currency, which is what the API documents `amount` to be.

  let date: IsoDate;
  try {
    date = ctx.dateOf(time);
  } catch {
    return UNREADABLE_ROW;
  }

  return {
    ok: true,
    value: {
      id,
      timeMs: time * 1000,
      date,
      description: row.description,
      mcc,
      amount: money(amount, ctx.currency),
      hold: row.hold,
    },
  };
}

function parseItem(row: unknown, ctx: StatementContext): StatementItem | undefined {
  const result = readItem(row, ctx);
  return result.ok ? result.value : undefined;
}

/**
 * Why `parseStatement` could not read a payload the bank did answer with — the one thing it
 * deliberately does not say itself (design D4: total and whole, a рядок's fate is never half told).
 * Walks the same array with the same `readItem`, so it can only ever name the same row and the same
 * cause `parseStatement` itself stopped at.
 */
export function statementUnavailableReason(
  payload: unknown,
  ctx: StatementContext,
): UnavailableReason {
  if (!Array.isArray(payload)) return 'unreadable-payload';
  for (const row of payload) {
    const result = readItem(row, ctx);
    if (!result.ok) return result.reason;
  }
  // Unreachable in practice: every row read, so `parseStatement` would have returned a value and
  // `ask` would never have called this at all.
  return 'unreadable-payload';
}

/**
 * A statement payload → its items, or `undefined` for a payload that is not a list of readable
 * rows. One unreadable row fails the whole answer on purpose (design D4): the window is simply
 * fetched again some later sync, nothing is marked as seen, and no транзакція is ever lost in
 * silence.
 *
 * A foreign purchase carries no original-currency сума, and that is now a deferral rather than an
 * impossibility: `operationAmount` is in the payload and `currencyCode` does name the currency it
 * is in. What is missing is that `mapStatement` does not read the pair and that no screen shows
 * one on an imported витрата. What the bank charged the рахунок is exact, and until then that is
 * the one сума kept.
 */
export function parseStatement(payload: unknown, ctx: StatementContext): StatementItem[] | undefined {
  if (!Array.isArray(payload)) {
    return undefined;
  }
  const items: StatementItem[] = [];
  for (const row of payload) {
    const item = parseItem(row, ctx);
    if (item === undefined) return undefined;
    items.push(item);
  }
  return items;
}

/**
 * The URL of one statement window. The moments are seconds, floored: a window boundary landing
 * mid-second must not round *up* into a moment the window does not cover.
 */
export function monobankStatementUrl(
  accountId: string,
  fromMs: number,
  toMs: number,
): string {
  const from = Math.floor(fromMs / 1000);
  const to = Math.floor(toMs / 1000);
  return `${MONOBANK_API_BASE}/personal/statement/${encodeURIComponent(accountId)}/${from}/${to}`;
}

/** The owner's monobank accounts, or the one typed reason there are none to show. */
export function fetchClientInfo(
  fetchImpl: AuthFetchLike,
  token: string,
): Promise<Outcome<MonobankAccount[]>> {
  return ask(fetchImpl, MONOBANK_CLIENT_INFO_URL, token, parseClientInfo);
}

/**
 * One window of one account's statement. The caller owns the loop and the pacing between calls —
 * `rate-limited` is an answer here, never a sleep (design D6).
 */
export function fetchStatement(
  fetchImpl: AuthFetchLike,
  token: string,
  request: {
    readonly accountId: string;
    readonly fromMs: number;
    readonly toMs: number;
    readonly context: StatementContext;
  },
): Promise<Outcome<StatementItem[]>> {
  return ask(
    fetchImpl,
    monobankStatementUrl(request.accountId, request.fromMs, request.toMs),
    token,
    (payload) => parseStatement(payload, request.context),
    (payload) => statementUnavailableReason(payload, request.context),
  );
}
