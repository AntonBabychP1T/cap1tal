/**
 * The numbers a fiscal document carries, read out of their digits.
 *
 * Both dialects state money and quantities as text, and both are read here by string arithmetic —
 * never `parseFloat`, never `Number('52.30') * 100`. A registrar's figure is exact and the app's
 * copy of it must be the same integer every time, on every device.
 *
 * A value with more fraction digits than its scale is a *failure*, not something to round: the
 * document would be saying something this app cannot hold, and quietly halving a kopiyka is how a
 * total stops matching the чек it came from.
 */

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;
const INTEGER = /^-?\d+$/;

/**
 * A decimal in text → an integer at the given scale: `('52.30', 2)` is 5230, `('5.701', 3)` is
 * 5701, `('6', 3)` is 6000. Nothing at all when the text is not a decimal, when it carries more
 * fraction digits than the scale allows, or when the result would leave the safe integer range.
 */
export function scaledInteger(text: string, scale: number): number | undefined {
  const match = DECIMAL.exec(text.trim());
  if (!match) return undefined;
  const [, sign = '', whole = '', fraction = ''] = match;
  if (fraction.length > scale) return undefined;

  const padded = fraction.padEnd(scale, '0');
  const total = Number(whole) * 10 ** scale + Number(padded === '' ? '0' : padded);
  if (!Number.isSafeInteger(total)) return undefined;
  return sign === '-' ? -total : total;
}

/**
 * A plain integer in text, as the classic РРО packet writes its kopiykas (`SM="5180"`) and its
 * thousandths (`Q="2000"`). A decimal point here is not a spelling of the same number — it is a
 * document that does not mean what this parser thinks it means, and is refused.
 */
export function plainInteger(text: string): number | undefined {
  const trimmed = text.trim();
  if (!INTEGER.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : undefined;
}
