import { money, type CurrencyCode, type Money } from '../domain/money';
import type { CapturedNotification } from './capture';

/**
 * Notification text → a money movement, or nothing readable.
 *
 * Total by construction: every path returns an outcome, no path throws, and no path produces a
 * floating-point number — an amount is assembled from its digits (design D4), exactly as the Saldo
 * and monobank parsers assemble theirs. Text the parser cannot read is not an error: it is
 * `unparsed`, which the чернетка lifecycle turns into a raw чернетка the owner finishes by hand.
 *
 * Per-bank parsers register against a package name (design D2); the generic parser below is the
 * fallback every unregistered bank gets, and it is deliberately conservative — it would rather
 * hand the owner a raw чернетка than a confident wrong сума.
 */

export type MovementDirection = 'out' | 'in';

/** What a notification said moved: which way, and how much in the currency the text named. */
export interface ParsedMovement {
  readonly direction: MovementDirection;
  readonly amount: Money;
}

export type ParseOutcome =
  | { readonly kind: 'movement'; readonly movement: ParsedMovement }
  | { readonly kind: 'unparsed' };

export type NotificationParser = (capture: CapturedNotification) => ParseOutcome;

const UNPARSED: ParseOutcome = { kind: 'unparsed' };

/**
 * What the parsers read and what a чернетка carries as its text: title and text joined, title
 * first, runs of whitespace collapsed (design D10). Some banks put the whole payload in the title
 * and some in the text; правила match by substring wherever the merchant sits, so joining rescues
 * the former and costs the latter nothing. The fingerprint keeps the two fields apart (D3), so
 * joining here does not weaken deduplication.
 */
export function parseInputOf(capture: CapturedNotification): string {
  return `${capture.title} ${capture.text}`.replace(/\s+/gu, ' ').trim();
}

/** Ukrainian casing on both sides, as `matchRule` folds its patterns. */
function fold(text: string): string {
  return text.toLocaleLowerCase('uk');
}

/**
 * The closed set of currency marks (design D5). The app offers accounts in exactly these three
 * currencies, so an amount next to anything else — or next to nothing — is not a сума this parser
 * will guess a currency for.
 */
const CURRENCY_BY_MARK = new Map<string, CurrencyCode>([
  ['uah', 'UAH'],
  ['грн', 'UAH'],
  ['₴', 'UAH'],
  ['usd', 'USD'],
  ['$', 'USD'],
  ['eur', 'EUR'],
  ['€', 'EUR'],
]);

const MARK = '(uah|грн|₴|usd|\\$|eur|€)';
/** A mark right after the amount, one optional space between: "250.00UAH", "250,00 грн". */
const MARK_AFTER = new RegExp(`^ ?${MARK}`, 'iu');
/** A mark right before it, same tolerance: "$5.00", "USD 5.00". */
const MARK_BEFORE = new RegExp(`${MARK} ?$`, 'iu');

/**
 * A number as a bank writes one: digits, spaces allowed as thousands separators, an optional
 * decimal part after "." or ",". The decimal part is captured whole rather than limited to two
 * digits, so a longer one is recognised as *not an amount* instead of being silently truncated.
 */
const AMOUNT = /\d+(?: \d{3})*(?:[.,]\d+)?/gu;

/** Letters and digits — what a currency mark must not be glued to, or it is part of a word. */
function isWordish(char: string): boolean {
  return char !== '' && /[\p{L}\p{N}]/u.test(char);
}

function currencyAfter(input: string, end: number): CurrencyCode | undefined {
  const rest = input.slice(end);
  const match = MARK_AFTER.exec(rest);
  if (match === null || isWordish(rest.charAt(match[0].length))) return undefined;
  return CURRENCY_BY_MARK.get(fold(match[1] ?? ''));
}

function currencyBefore(input: string, start: number): CurrencyCode | undefined {
  const head = input.slice(0, start);
  const match = MARK_BEFORE.exec(head);
  if (match === null || isWordish(head.charAt(match.index - 1))) return undefined;
  return CURRENCY_BY_MARK.get(fold(match[1] ?? ''));
}

/**
 * A number token → integer minor units, digit by digit. `undefined` for anything that is not a
 * two-decimal amount: three decimal places is a rate or a European thousands separator, not money,
 * and an amount too large to be a safe integer is not one this app can hold.
 */
function minorUnitsOf(token: string): number | undefined {
  const separator = /[.,]/u.exec(token);
  const whole = (separator === null ? token : token.slice(0, separator.index)).replace(/ /gu, '');
  const fraction = separator === null ? '' : token.slice(separator.index + 1);
  if (fraction.length > 2) return undefined;
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : undefined;
}

/**
 * The marks that make a movement money in (design D6). Anything else is money out — the vision's
 * own default, "every transaction is spending until I mark it otherwise", applied to text.
 */
const MONEY_IN_MARKS = ['зарахування', 'поповнення', 'повернення', 'надходження'] as const;

function directionOf(input: string): MovementDirection {
  const folded = fold(input);
  return MONEY_IN_MARKS.some((mark) => folded.includes(mark)) ? 'in' : 'out';
}

/**
 * The first amount the text names that a currency stands next to.
 *
 * Amounts with no currency beside them are stepped over rather than failing the whole read: a
 * Ukrainian bank notification opens with a masked card number ("5168**1234"), and treating that as
 * "the amount, currency unknown" would make every real notification unreadable. What is never done
 * is guessing a currency for an amount that names none (D5) — the pairing is what makes an amount
 * a сума.
 */
function firstAmount(input: string): Money | undefined {
  AMOUNT.lastIndex = 0;
  for (let match = AMOUNT.exec(input); match !== null; match = AMOUNT.exec(input)) {
    const end = match.index + match[0].length;
    const trailing = /^[.,]?\d/u.test(input.slice(end));
    if (trailing) {
      // The token is a fragment of a longer number (a date, "1.234,56"): step past the whole run
      // rather than reading its tail as an amount of its own.
      AMOUNT.lastIndex = end + (/^[\d.,]*/u.exec(input.slice(end))?.[0].length ?? 0);
      continue;
    }
    const minor = minorUnitsOf(match[0]);
    if (minor === undefined) continue;
    const currency = currencyAfter(input, end) ?? currencyBefore(input, match.index);
    if (currency === undefined) continue;
    // A сума of zero is not money moving (design D11); the raw чернетка path takes it from here.
    return minor === 0 ? undefined : money(minor, currency);
  }
  return undefined;
}

/**
 * The parser every app gets until one is registered for it: the first amount paired with a
 * currency, money in when the text says so and money out otherwise.
 */
export function parseGeneric(capture: CapturedNotification): ParseOutcome {
  const input = parseInputOf(capture);
  const amount = firstAmount(input);
  if (amount === undefined) return UNPARSED;
  return { kind: 'movement', movement: { direction: directionOf(input), amount } };
}

/**
 * Parsers by app package. Empty today on purpose: a bank's real notification format is the owner's
 * own data on the owner's own phone, and a format guessed without samples is untested code. Adding
 * one is an entry here plus its tests — no requirement changes (design D2, proposal non-goals).
 */
export const PARSERS: ReadonlyMap<string, NotificationParser> = new Map();

/**
 * The registered parser for the posting app, or the generic one. The registry is an argument so
 * the engine keeps no hidden state: the same capture and the same registry always read the same.
 */
export function parseNotification(
  capture: CapturedNotification,
  parsers: ReadonlyMap<string, NotificationParser> = PARSERS,
): ParseOutcome {
  return (parsers.get(capture.packageName) ?? parseGeneric)(capture);
}
