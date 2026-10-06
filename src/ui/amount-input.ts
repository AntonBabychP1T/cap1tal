import { MAX_AMOUNT_MINOR, money, type CurrencyCode, type Money } from '../domain/money';
import { Refusal } from '../domain/refusal';

/**
 * The one place a typed amount becomes `Money`, and the one place `Money` becomes text. It lives
 * outside `src/domain/` on purpose: the domain never parses "12.50" (rules/domain.md). Parsing is
 * integer string arithmetic — the digits are counted and padded, never divided — so no float ever
 * touches an amount.
 */

/** Minor units per major unit, as a digit count. UAH, EUR and USD all have two. */
const MINOR_DIGITS = 2;

/**
 * Digits with an optional fraction after a dot or a comma — or a fraction alone, «,5» being
 * 0,50 the way it is said. The whole part may be grouped in thousands by a space: a plain one
 * from the keyboard, the no-break space this module itself prints (`THOUSANDS`), or the narrow
 * no-break space a number pasted from elsewhere carries. Only proper groups are read as grouping —
 * one to three digits, then groups of exactly three — so «1 000» is a thousand while «1 00» or
 * «12 5» is refused rather than guessed at: a stray space between digits is as likely two amounts
 * run together as one amount with a typo.
 */
const TYPED_AMOUNT =
  /^(?:(\d+|\d{1,3}(?:[ \u00A0\u202F]\d{3})+)(?:[.,](\d+))?|[.,](\d+))$/;
const GROUP_SPACES = /[ \u00A0\u202F]/g;

/**
 * The most whole-part digits a typed сума can have and still be read by `Number` exactly —
 * counted before `Number` is ever called, so a twenty-digit paste is refused in Ukrainian here
 * instead of reaching `money` as 1e+22 and its English invariant text. Anything this long is
 * already far above `MAX_AMOUNT_MINOR`; the exact comparison happens after.
 */
const SAFE_WHOLE_DIGITS = String(Number.MAX_SAFE_INTEGER).length - 1 - MINOR_DIGITS;

/**
 * Parses what the owner typed in the account's own currency: "125.50" and "125,50" are the same
 * 12550 kopiykas — the comma is the Ukrainian decimal separator, so both are accepted, as are
 * «,5» for 0,50 and «1 000,50» with its thousands grouped (`TYPED_AMOUNT`). Anything that is not
 * a number, is not positive, carries more fractional digits than the currency has minor units, or
 * is above `MAX_AMOUNT_MINOR` is rejected; nothing is rounded behind the owner's back.
 *
 * The ceiling is what keeps one mistyped row from breaking the app: a сума of
 * `Number.MAX_SAFE_INTEGER` kopiykas used to be accepted, and every total it entered then left the
 * safe-integer range and crashed Головний on each start (QA).
 *
 * The four refusals are in the owner's own language, and each one says what about what they typed
 * is wrong. They are read, not logged: `failureMessage` puts them straight into an Alert on every
 * form where a сума is typed — recording, opening a рахунок, a ліміт, a ціль. The domain's own
 * invariant text stays English (rules/domain.md); this parser is the boundary, and the boundary
 * speaks Ukrainian.
 */
export function parseAmount(typed: string, currency: CurrencyCode): Money {
  return money(magnitudeOf(typed.trim(), typed, currency), currency);
}

/**
 * `parseAmount`'s work on `digits`, with every refusal quoting `typed` — which is not the same
 * string when a signed field has taken its sign off first. The owner who typed «--5» must be told
 * «--5» is not a сума, not «-5» (QA): what they read back has to be what they typed.
 *
 * The ceiling is checked here, on the magnitude, so a signed field is bounded on both sides by
 * the one check: −999 999 999,99 is the lowest balance there is, as 999 999 999,99 is the highest.
 */
function magnitudeOf(digits: string, typed: string, currency: CurrencyCode): number {
  // An empty сума and a negative one are named for what they are, before the number test
  // (main-screen). Only where no sign was taken off: a signed field's «-» and «--5» are still
  // quoted back as not a сума.
  const unsigned = digits === typed.trim();
  if (unsigned && digits === '') {
    throw new Refusal('Напишіть суму');
  }
  if (unsigned && digits.startsWith('-')) {
    throw new Refusal('Сума має бути більшою за нуль');
  }
  const match = TYPED_AMOUNT.exec(digits);
  if (!match) {
    throw new Refusal(`«${typed}» — це не сума; напишіть число, напр. 125,50`);
  }
  const [, grouped = '', fractionAfterWhole, fractionAlone] = match;
  const fraction = fractionAfterWhole ?? fractionAlone ?? '';
  if (fraction.length > MINOR_DIGITS) {
    throw new Refusal(
      `у сумі в ${currency} щонайбільше ${MINOR_DIGITS} цифри після коми, ` +
        `а «${typed}» має ${fraction.length}`,
    );
  }
  // Leading zeros are not size — «0005» is five — so they go before the digits are counted.
  const whole = grouped.replace(GROUP_SPACES, '').replace(/^0+/, '');
  const tooBig = () =>
    new Error(
      `сума завелика: щонайбільше ${formatMinorUnitsGrouped(MAX_AMOUNT_MINOR)}, а не «${typed}»`,
    );
  if (whole.length > SAFE_WHOLE_DIGITS) {
    throw tooBig();
  }
  const minorUnits = Number(`${whole}${fraction.padEnd(MINOR_DIGITS, '0')}`);
  if (minorUnits <= 0) {
    // The words a negative сума gets above: zero and below are one refusal (main-screen), on the
    // entry form and on every other form a сума is typed into, a ліміт's included.
    throw new Refusal('Сума має бути більшою за нуль');
  }
  if (minorUnits > MAX_AMOUNT_MINOR) {
    throw tooBig();
  }
  return minorUnits;
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
    return TYPED_ZERO.test(trimmed) ? money(0, currency) : parseAmount(typed, currency);
  }
  const rest = trimmed.slice(1);
  if (TYPED_ZERO.test(rest)) {
    return money(0, currency);
  }
  // The digits after the sign are parsed, but every refusal quotes what the owner typed, sign
  // included — `magnitudeOf` is told both.
  return money(-magnitudeOf(rest, typed, currency), currency);
}

/** Zero however it is typed: «0», «0,00», «000», and «,0» / «.00» with the whole part left off. */
const TYPED_ZERO = /^(?:0+(?:[.,]0{1,2})?|[.,]0{1,2})$/;

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
    throw new Refusal('напишіть фактичний залишок — скільки насправді на рахунку');
  }
  return parseOpeningBalance(typed, currency);
}

/**
 * A поточна вартість — what the owner says an інвестиційний рахунок is worth today. It is neither
 * of the two above: zero is a real answer (an інвестиція may be worth nothing) and below zero is
 * not one (it may never be worth less than nothing), so it gets its own entry point rather than a
 * caller that parses one of the others and then post-checks a sign. What each kind of amount may
 * be stays in the one module that parses amounts.
 *
 * An empty field is refused for `parseActualBalance`'s reason: «I have not typed it yet» must not
 * silently become «it is worth nothing».
 */
export function parseCurrentValue(typed: string, currency: CurrencyCode): Money {
  const trimmed = typed.trim();
  if (trimmed === '') {
    throw new Refusal('напишіть поточну вартість — скільки цей рахунок вартий зараз');
  }
  if (trimmed.startsWith('-') || trimmed.startsWith('\u2212')) {
    throw new Refusal(
      `поточна вартість не може бути меншою за нуль, а «${typed}» — менша; ` +
        'інвестиція може коштувати нічого, але не менше',
    );
  }
  return TYPED_ZERO.test(trimmed) ? money(0, currency) : parseAmount(trimmed, currency);
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
 * The thousands separator: a no-break space, as Ukrainian writes one — «120 425,99». No-break so
 * a сума can never be split across two lines with its thousands left behind on the first.
 *
 * Grouping is a display decision and lives on the display side: `formatMinorUnits` above fills
 * input fields ungrouped, so the field shows the digits the owner is about to edit. The parsers
 * take grouped text back all the same (`TYPED_AMOUNT`) — a number copied off a card must not be
 * refused for the separator the app itself printed.
 */
const THOUSANDS = '\u00A0';

function grouped(whole: string): string {
  let out = '';
  for (let i = 0; i < whole.length; i += 1) {
    // Every three digits counted from the right, and never a separator before the first digit.
    if (i > 0 && (whole.length - i) % 3 === 0) {
      out += THOUSANDS;
    }
    out += whole[i];
  }
  return out;
}

/**
 * Minor units as text for display, grouped and without a currency: "120425990" reads as
 * "1 204 259,90". For the «≈ … грн» line and nothing that has to be parsed back.
 */
export function formatMinorUnitsGrouped(amount: number): string {
  const negative = amount < 0;
  const digits = String(Math.abs(amount)).padStart(MINOR_DIGITS + 1, '0');
  return `${negative ? '−' : ''}${grouped(digits.slice(0, -MINOR_DIGITS))},${digits.slice(-MINOR_DIGITS)}`;
}

/**
 * Minor units back to text for display: "12550 UAH" reads as "125,50 UAH", and "12042599 UAH" as
 * "120 425,99 UAH" — the thousands grouped, because this is the number the owner reads off a card
 * rather than one they type. A negative amount keeps its sign — a correction below zero is shown
 * as it is stored.
 */
export function formatMoney(m: Money): string {
  const negative = m.amount < 0;
  const digits = String(Math.abs(m.amount)).padStart(MINOR_DIGITS + 1, '0');
  const whole = grouped(digits.slice(0, -MINOR_DIGITS));
  const fraction = digits.slice(-MINOR_DIGITS);
  return `${negative ? '−' : ''}${whole},${fraction} ${m.currency}`;
}

/**
 * `formatMoney`'s two parts, for a place that draws the number and its currency on separate lines
 * — the centre of the category ring, where one line is wider than the hole (main-screen, "The
 * ring's total stays inside the ring"). Split from `formatMoney`'s own output, so the number can
 * never be formatted any other way than the one every other screen shows.
 */
export function splitMoney(m: Money): { readonly number: string; readonly currency: string } {
  const text = formatMoney(m);
  return { number: text.slice(0, -(m.currency.length + 1)), currency: m.currency };
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
