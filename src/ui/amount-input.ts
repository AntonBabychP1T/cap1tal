import { money, type CurrencyCode, type Money } from '../domain/money';

/**
 * The one place a typed amount becomes `Money`, and the one place `Money` becomes text. It lives
 * outside `src/domain/` on purpose: the domain never parses "12.50" (rules/domain.md). Parsing is
 * integer string arithmetic — the digits are counted and padded, never divided — so no float ever
 * touches an amount.
 */

/** Minor units per major unit, as a digit count. UAH, EUR and USD all have two. */
const MINOR_DIGITS = 2;

const TYPED_AMOUNT = /^(\d+)(?:[.,](\d+))?$/;

/**
 * Parses what the owner typed in the account's own currency: "125.50" and "125,50" are the same
 * 12550 kopiykas — the comma is the Ukrainian decimal separator, so both are accepted. Anything
 * that is not a number, is not positive, or carries more fractional digits than the currency has
 * minor units is rejected; nothing is rounded behind the owner's back.
 *
 * The three refusals are in the owner's own language, and each one says what about what they typed
 * is wrong. They are read, not logged: `failureMessage` puts them straight into an Alert on every
 * form where a сума is typed — recording, opening a рахунок, a ліміт, a ціль. The domain's own
 * invariant text stays English (rules/domain.md); this parser is the boundary, and the boundary
 * speaks Ukrainian.
 */
export function parseAmount(typed: string, currency: CurrencyCode): Money {
  const match = TYPED_AMOUNT.exec(typed.trim());
  if (!match) {
    throw new Error(`«${typed}» — це не сума; напишіть число, напр. 125,50`);
  }
  const [, whole = '', fraction = ''] = match;
  if (fraction.length > MINOR_DIGITS) {
    throw new Error(
      `у сумі в ${currency} щонайбільше ${MINOR_DIGITS} цифри після коми, ` +
        `а «${typed}» має ${fraction.length}`,
    );
  }
  const minorUnits = Number(`${whole}${fraction.padEnd(MINOR_DIGITS, '0')}`);
  if (minorUnits <= 0) {
    throw new Error(`сума має бути більша за нуль, а не «${typed}»`);
  }
  return money(minorUnits, currency);
}

/**
 * An opening balance, which — unlike a transaction amount — may be zero or negative: a card can
 * be in overdraft, and the accounts capability only requires the balance to be in the account's
 * own currency. Everything after the sign is parsed by `parseAmount`, so the digits obey exactly
 * the same rules.
 */
export function parseOpeningBalance(typed: string, currency: CurrencyCode): Money {
  const trimmed = typed.trim();
  if (trimmed === '') {
    return money(0, currency);
  }
  if (!trimmed.startsWith('-')) {
    return TYPED_ZERO.test(trimmed) ? money(0, currency) : parseAmount(trimmed, currency);
  }
  const rest = trimmed.slice(1);
  if (TYPED_ZERO.test(rest)) {
    return money(0, currency);
  }
  return money(-parseAmount(rest, currency).amount, currency);
}

const TYPED_ZERO = /^0+(?:[.,]0{1,2})?$/;

/**
 * A фактичний залишок — what the owner counted, typed to be звірено against the розрахунковий
 * баланс. It obeys exactly the opening balance's rules, sign and zero included: a рахунок can be
 * at zero, and a card can be in overdraft.
 *
 * The one difference is the empty string. `parseOpeningBalance` reads `''` as `0,00`, which is
 * right for a field the owner may leave alone when creating a рахунок — and exactly wrong here,
 * where it would turn an untouched field into «I recounted and there is nothing». So an empty
 * фактичний залишок is refused, in the owner's own words like the other refusals in this module.
 */
export function parseActualBalance(typed: string, currency: CurrencyCode): Money {
  if (typed.trim() === '') {
    throw new Error('напишіть фактичний залишок — скільки насправді на рахунку');
  }
  return parseOpeningBalance(typed, currency);
}

/**
 * Minor units as the major-unit text an input field shows and can parse back — no currency code,
 * so it round-trips through `parseOpeningBalance` unchanged.
 */
export function formatMinorUnits(amount: number): string {
  const negative = amount < 0;
  const digits = String(Math.abs(amount)).padStart(MINOR_DIGITS + 1, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -MINOR_DIGITS)},${digits.slice(-MINOR_DIGITS)}`;
}

/**
 * Minor units back to text for display: "12550 UAH" reads as "125,50 UAH". A negative amount
 * keeps its sign — a correction below zero is shown as it is stored.
 */
export function formatMoney(m: Money): string {
  const negative = m.amount < 0;
  const digits = String(Math.abs(m.amount)).padStart(MINOR_DIGITS + 1, '0');
  const whole = digits.slice(0, -MINOR_DIGITS);
  const fraction = digits.slice(-MINOR_DIGITS);
  return `${negative ? '−' : ''}${whole},${fraction} ${m.currency}`;
}

/**
 * The same amount with its sign always written out: "+30,00 UAH" as well as "−30,00 UAH". Used
 * where the amount *is* a difference — a коригування named before it is created — and where
 * reading "30,00 UAH" as "thirty more" rather than "thirty" is the whole question.
 */
export function formatSignedMoney(m: Money): string {
  return m.amount > 0 ? `+${formatMoney(m)}` : formatMoney(m);
}

/**
 * The order currencies are listed in wherever more than one is shown: UAH first — the owner's own
 * currency — then the rest alphabetically, so the sequence never depends on the order rows were
 * loaded in. One rule, shared by the monthly groups and the account totals; two copies of it would
 * drift the day a third screen shows money in two currencies.
 */
export function byCurrency(a: CurrencyCode, b: CurrencyCode): number {
  if (a === b) return 0;
  if (a === 'UAH') return -1;
  if (b === 'UAH') return 1;
  return a < b ? -1 : 1;
}
