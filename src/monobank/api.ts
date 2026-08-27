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
 * What a call to the personal API can answer. The three failures are the three the screen change
 * has to tell apart: re-enter the token, wait, or shrug and try later. None of them carries the
 * token, and none of them is a partially read answer.
 */
export type Outcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'invalid-token' }
  | { readonly kind: 'rate-limited' }
  | { readonly kind: 'unavailable' };

const INVALID_TOKEN: Outcome<never> = { kind: 'invalid-token' };
const RATE_LIMITED: Outcome<never> = { kind: 'rate-limited' };
const UNAVAILABLE: Outcome<never> = { kind: 'unavailable' };

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
const CURRENCY_BY_NUMERIC: Readonly<Record<number, CurrencyCode>> = {
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
 * what comes back. A thrown fetch, any status that is not a parsed 200-family answer, and a body
 * the parser cannot read all become `unavailable` — including a parser that throws, so a caller's
 * own `dateOf` cannot turn a bad payload into a crash.
 */
async function ask<T>(
  fetchImpl: AuthFetchLike,
  url: string,
  token: string,
  parse: (payload: unknown) => T | undefined,
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
  let value: T | undefined;
  try {
    value = parse(await response.json());
  } catch {
    return UNAVAILABLE;
  }
  return value === undefined ? UNAVAILABLE : { kind: 'ok', value };
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

function parseItem(row: unknown, ctx: StatementContext): StatementItem | undefined {
  if (!isRecord(row)) return undefined;
  const id = asNonEmptyString(row.id);
  const time = asMinorUnits(row.time);
  const mcc = asMinorUnits(row.mcc);
  const amount = asMinorUnits(row.amount);
  if (id === undefined || time === undefined || mcc === undefined || amount === undefined) {
    return undefined;
  }
  if (typeof row.description !== 'string' || typeof row.hold !== 'boolean') {
    return undefined;
  }

  // `currencyCode` on a statement row is the *account's* currency, not the operation's — the API
  // documents it so, and a monobank statement names no currency for `operationAmount` at all
  // (design D12). It is therefore read as what it is: a check that this really is the statement of
  // the рахунок we are importing into. A row saying otherwise is not a row we can read.
  const numeric = row.currencyCode;
  if (typeof numeric !== 'number' || CURRENCY_BY_NUMERIC[numeric] !== ctx.currency) {
    return undefined;
  }

  return {
    id,
    timeMs: time * 1000,
    date: ctx.dateOf(time),
    description: row.description,
    mcc,
    amount: money(amount, ctx.currency),
    hold: row.hold,
  };
}

/**
 * A statement payload → its items, or `undefined` for a payload that is not a list of readable
 * rows of this рахунок's currency. One unreadable row fails the whole answer on purpose
 * (design D4): the window is simply fetched again some later sync, nothing is marked as seen, and
 * no транзакція is ever lost in silence.
 *
 * A foreign purchase carries no original-currency сума. `operationAmount` is in the payload, but
 * nothing in it says *which* currency that сума is in, and money without a currency is not money
 * this app will hold. What it charges the рахунок is exact, and that is what is kept (design D12).
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
  );
}
