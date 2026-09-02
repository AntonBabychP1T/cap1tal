import type { CurrencyCode, Money } from '../domain/money';
import { formatMinorUnits } from '../ui/amount-input';

/**
 * How the пакет для аналізу writes a number down, and the only arithmetic it does that the domain
 * does not already do for it.
 *
 * Two decisions live here, and everything else in `src/analysis` inherits them.
 *
 * **A сума is exact decimal text with its currency, never a JSON number.** A float in the file
 * would be a float somewhere in the reader too, and minor units left bare — `412534` — is the
 * first hallucination a model makes, reading kopiykas as hryvnias. `"4125.34"` beside `"UAH"` is
 * read by a person and by a model the same way, and by neither as a number to recompute.
 *
 * **A ratio is an integer number of basis points, and its absence is an answer.** A share, a rate
 * or a change over a zero base is not zero and not infinite — it does not exist, and the пакет
 * says `null` rather than inventing a figure the file's own instructions then forbid the assistant
 * to invent.
 *
 * Rounding is half away from zero everywhere below, as `approximateUah` already rounds: −10000 is
 * worth exactly what +10000 is, with the other sign, and neither `Math.round` (which rounds toward
 * +∞) nor integer division (which truncates toward zero) is symmetric.
 */

/**
 * Exact decimal text of major units with its currency beside it: `{ amount: "4125.34", currency:
 * "UAH" }`. Declared here, where it is made, and re-exported by `package.ts`, which is the пакет's
 * contract surface — one declaration, so no two of them can drift.
 */
export interface Amount {
  readonly amount: string;
  readonly currency: CurrencyCode;
}

/** An integer number of basis points (1/100 of a percent): 2500 = 25.00 %. */
export type BasisPoints = number;

/**
 * Minor units as the exact decimal text of major units: `412534 UAH` → `"4125.34"`, `-30000 UAH`
 * → `"-300.00"`.
 *
 * `formatMinorUnits` is what an input field shows, so the digits are already the right ones and
 * cannot drift from what the app displays; only the separator differs. The comma is Ukrainian and
 * the file is read by a model too, so the data section writes the dot every JSON reader expects,
 * and `## Підсумок` writes the comma through `formatMoney`. No thousands separator: a grouping
 * space is for a person's eye and would have to be stripped before the text is a number again.
 *
 * Nothing is rounded here — minor units *are* the exact figure — so no safe integer can come out
 * of this as a rounding error.
 */
export function decimalOf(m: Money): Amount {
  return { amount: formatMinorUnits(m.amount).replace(',', '.'), currency: m.currency };
}

/**
 * The exact inverse of `decimalOf`: the пакет's own decimal text back as integer minor units.
 *
 * `## Підсумок` needs it — the summary shows every figure the way the app shows money, through
 * `formatMoney`, and `formatMoney` takes `Money`. Going back through the text rather than keeping a
 * second copy of the numbers is what makes «no summary figure is absent from the data section» true
 * by construction: the summary can only show what the data section already says.
 *
 * String arithmetic, so nothing is rounded on the way back.
 */
export function minorUnitsOf(amount: Amount): Money {
  if (!/^-?\d+\.\d{2}$/.test(amount.amount)) {
    throw new Error(`not a сума of the пакет: "${amount.amount}"`);
  }
  return { amount: Number(amount.amount.replace('.', '')), currency: amount.currency };
}

function requireSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`cannot compare ${a.currency} with ${b.currency}`);
  }
}

/**
 * A part of a whole, in basis points — `round(part × 10000 / |whole|)`, half away from zero — and
 * `null` when the whole is zero.
 *
 * The magnitude of the base, so the sign of the answer is the part's own: money back from an
 * інвестиційний рахунок is −3000 basis points of a positive дохід, and a share of a negative base
 * would otherwise silently flip every sign in the row.
 *
 * The two amounts must be one currency, for `overLimit`'s reason: comparing UAH against USD needs
 * a rate, no rate exists here, and a ratio across currencies is the cross-currency sum this whole
 * пакет is built not to make.
 */
export function bp(part: Money, whole: Money): BasisPoints | null {
  requireSameCurrency(part, whole);
  if (whole.amount === 0) {
    return null;
  }
  return roundedRatio(BigInt(part.amount) * 10000n, BigInt(Math.abs(whole.amount)));
}

/**
 * The change from one сума to another, in basis points: `bp(after − before, before)`. July's
 * 3000.00 UAH becoming August's 3600.00 UAH is +2000.
 *
 * A base of zero is `null` here too, and that is the honest answer rather than «+∞ %»: a категорія
 * that was not there last month did not grow, it appeared, and the пакет's trends leave such a
 * категорія unranked for exactly that reason.
 */
export function changeBp(before: Money, after: Money): BasisPoints | null {
  requireSameCurrency(before, after);
  return bp({ amount: after.amount - before.amount, currency: before.currency }, before);
}

/**
 * The mean of сумі of one currency, in whole minor units, rounded half away from zero.
 *
 * In BigInt like `approximateUah`, and for the same reason: twelve months of a large сума sum past
 * what a double holds exactly, and this figure — «в середньому на місяць» — is one an assistant is
 * told never to recompute, so it has to be right to the kopiyka.
 *
 * An empty list throws rather than answering 0: the average of no months is not a number, and
 * every caller here already knows whether it has months (a baseline of none is `null` in the
 * пакет, not a row of zeros).
 */
export function averageMinor(amounts: readonly Money[]): Money {
  if (amounts.length === 0) {
    throw new Error('an average needs at least one сума');
  }
  const currency = amounts[0]!.currency;
  let total = 0n;
  for (const m of amounts) {
    requireSameCurrency(m, amounts[0]!);
    total += BigInt(m.amount);
  }
  return { amount: roundedRatio(total, BigInt(amounts.length)), currency };
}

/**
 * `numerator / denominator` as a `number`, rounded half away from zero. The denominator is always
 * positive here, so the sign is the numerator's and the halves are symmetric about it.
 */
function roundedRatio(numerator: bigint, denominator: bigint): number {
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const whole = magnitude / denominator;
  const remainder = magnitude % denominator;
  const rounded = remainder * 2n >= denominator ? whole + 1n : whole;
  return Number(negative ? -rounded : rounded);
}
