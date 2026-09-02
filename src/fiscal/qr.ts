import { money, type Money } from '../domain/money';
import { isoDate, type IsoDate } from '../domain/transaction';
import { scaledInteger } from './numbers';

/**
 * The text of a QR code → the реквізити чека, or a typed reason.
 *
 * Total and deterministic: the same text always yields the same answer, nothing throws, and no
 * network, device or clock takes part. It is the first step of the scan flow and the only one
 * that runs on text the owner pointed a camera at, so it is deliberately strict about what it
 * accepts and deliberately specific about what it refuses.
 *
 * The URL is taken apart by hand rather than through `URL`: Hermes' implementation of it is
 * partial, and `src/fiscal/` must behave identically in Node under `verify` and on the phone.
 */

/** The реквізити чека, as the lookup needs them. */
export interface ReceiptLookup {
  /** `id` — the фіскальний номер чека. */
  readonly fiscalNumber: string;
  /** `fn` — the фіскальний номер реєстратора. */
  readonly registrarNumber: string;
  readonly date: IsoDate;
  /** 'HH:mm' — the time of day the QR names, always to the minute. */
  readonly time: string;
  /** 'ss' — only when the QR gave the time to the second. */
  readonly seconds?: string;
  /** The чек's сума as integer minor units UAH. */
  readonly total: Money;
  /**
   * The сума exactly as the QR wrote it — «780.00», «99.99», «780».
   *
   * Kept beside `total` because the tax service matches `sm` as a string: it answers 200 for
   * `780`, `780.0` and `0780.00` alike but has its own idea of the canonical form, and
   * re-formatting an integer back into a decimal here would be this app inventing a spelling the
   * seller did not print. The adapter sends this, never a number (design D4).
   */
  readonly sumText: string;
}

/** Which реквізит a чек QR failed to carry, in the domain's words rather than the URL's. */
export type MissingRequisite = 'fiscalNumber' | 'registrarNumber' | 'date' | 'time' | 'total';

export type QrReading =
  | { readonly kind: 'lookup'; readonly lookup: ReceiptLookup }
  /** A чек link that does not carry everything the lookup needs, or carries it malformed. */
  | { readonly kind: 'incomplete'; readonly missing: readonly MissingRequisite[] }
  /** Not a чек QR at all: another site, or not a URL. */
  | { readonly kind: 'not-a-receipt' };

const NOT_A_RECEIPT: QrReading = { kind: 'not-a-receipt' };

/** The tax service's receipt-check page. The one address this module recognises. */
const RECEIPT_HOST = 'cabinet.tax.gov.ua';
const RECEIPT_PATH = '/cashregs/check';

/** `scheme://host/path?query`, with the fragment and everything after it dropped. */
const URL_SHAPE = /^(https?):\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i;

const DIGITS = /^\d+$/;
const DATE = /^(\d{4})(\d{2})(\d{2})$/;
const TIME = /^(\d{2})(\d{2})(\d{2})?$/;

/**
 * The query string as a map. Later occurrences of a parameter lose to earlier ones — a QR naming
 * `sm` twice is a QR we have no business guessing about, and the first is what the tax service's
 * own page reads.
 */
function queryOf(query: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (pair === '') continue;
    const at = pair.indexOf('=');
    const rawName = at === -1 ? pair : pair.slice(0, at);
    const rawValue = at === -1 ? '' : pair.slice(at + 1);
    let name: string;
    let value: string;
    try {
      // `+` is a space in a query string, and a malformed escape is a malformed QR, not a throw.
      name = decodeURIComponent(rawName.replace(/\+/g, ' ')).toLowerCase();
      value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch {
      continue;
    }
    if (!params.has(name)) {
      params.set(name, value);
    }
  }
  return params;
}

/**
 * A сума in minor units, through the module's one decimal reader — string arithmetic, never
 * `parseFloat`, for the reason `numbers.ts` gives.
 *
 * A leading `-` is refused here rather than in `scaledInteger`: a чек's сума is never negative,
 * and a QR carrying one is a QR this reader has no business believing.
 */
function minorUnits(text: string): number | undefined {
  return text.startsWith('-') ? undefined : scaledInteger(text, 2);
}

function calendarDate(text: string): IsoDate | undefined {
  const match = DATE.exec(text);
  if (!match) return undefined;
  try {
    return isoDate(`${match[1]}-${match[2]}-${match[3]}`);
  } catch {
    return undefined;
  }
}

function timeOfDay(text: string): { time: string; seconds?: string } | undefined {
  const match = TIME.exec(text);
  if (!match) return undefined;
  const [, hh = '', mm = '', ss] = match;
  if (Number(hh) > 23 || Number(mm) > 59 || (ss !== undefined && Number(ss) > 59)) {
    return undefined;
  }
  return { time: `${hh}:${mm}`, ...(ss === undefined ? {} : { seconds: ss }) };
}

/** A фіскальний номер, of a чек or of a реєстратор: digits, and nothing that is not. */
function fiscalNumber(text: string | undefined): string | undefined {
  return text !== undefined && DIGITS.test(text) ? text : undefined;
}

/**
 * The QR's text as реквізити, or the reason it is not.
 *
 * The two reasons are different questions and the screen asks them differently: `not-a-receipt`
 * means «point the camera at a чек», while `incomplete` means «this чек's QR does not carry what
 * the tax service needs», which no amount of rescanning the same code will fix. A malformed
 * реквізит counts as a missing one: a `sm` of «780,00» is a сума the lookup cannot send, and the
 * owner is told the сума is what is wrong rather than being handed a request that fails later.
 */
export function readReceiptQr(text: string): QrReading {
  const match = URL_SHAPE.exec(text.trim());
  if (!match) return NOT_A_RECEIPT;

  const [, , host = '', path = '', query = ''] = match;
  // No port, no userinfo, no other host: this is the one page whose parameters mean what we read
  // them to mean. A trailing slash is the same page.
  if (host.toLowerCase() !== RECEIPT_HOST) return NOT_A_RECEIPT;
  if (path.toLowerCase().replace(/\/$/, '') !== RECEIPT_PATH) return NOT_A_RECEIPT;

  const params = queryOf(query);
  // `mac` and anything else the page carries are read by nothing: the tax service ignores them
  // too, and a QR that gains a parameter must not stop being a чек QR.
  const id = fiscalNumber(params.get('id'));
  const fn = fiscalNumber(params.get('fn'));
  const date = calendarDate(params.get('date') ?? '');
  const when = timeOfDay(params.get('time') ?? '');
  // «sum» is the alias some registrars print; the tax service's own page reads `sm`.
  const sumText = params.get('sm') ?? params.get('sum');
  const total = sumText === undefined ? undefined : minorUnits(sumText);

  const missing: MissingRequisite[] = [];
  if (id === undefined) missing.push('fiscalNumber');
  if (fn === undefined) missing.push('registrarNumber');
  if (date === undefined) missing.push('date');
  if (when === undefined) missing.push('time');
  if (total === undefined) missing.push('total');
  // Written as one condition rather than `missing.length > 0` so the five values below are the
  // narrowed ones: the list and the reading can then never disagree about what was there.
  if (
    id === undefined ||
    fn === undefined ||
    date === undefined ||
    when === undefined ||
    sumText === undefined ||
    total === undefined
  ) {
    return { kind: 'incomplete', missing };
  }

  return {
    kind: 'lookup',
    lookup: {
      fiscalNumber: id,
      registrarNumber: fn,
      date,
      time: when.time,
      ...(when.seconds === undefined ? {} : { seconds: when.seconds }),
      total: money(total, 'UAH'),
      sumText,
    },
  };
}
