import { bytesFromBase64, decodeFiscalDocument } from './cp1251';
import type { FiscalReceiptProvider, LookupOutcome } from './lookup';
import type { ReceiptLookup } from './qr';

/**
 * The one file that knows the tax service exists.
 *
 * `chkAllWeb` is what the tax service's own receipt-check page calls. It is undocumented and
 * unauthenticated, it may start enforcing the captcha its page already executes, and it may change
 * shape without notice — which is exactly why all of it is here, behind `FiscalReceiptProvider`,
 * and why every failure is one of five values rather than an exception. When it changes, this file
 * and its fixtures change; nothing else does.
 *
 * What leaves the phone is one GET carrying the реквізити and nothing else: no транзакція, no
 * рахунок, no опис, no identifier of this device or this owner. The URL is never logged and never
 * appears in an outcome, because it carries the реквізити of a purchase.
 */

/** Only what this module needs of `fetch` — the same seam the rate endpoint already uses. */
export type FetchLike = (url: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}>;

const ENDPOINT = 'https://cabinet.tax.gov.ua/ws/api_public/rro/chkAllWeb';

/**
 * `type` is required and its value does not matter — 0, 1, 2, 3 and 9 all answer with the same
 * receipt, while omitting it or sending a non-number answers 400. 3 is what the service's own page
 * sends, so 3 is what we send.
 */
const TYPE = '3';

/**
 * The prefix every «no such чек» carries, whatever follows it: «Не знайдено.», «не вірна сума»,
 * and the misleading «Сервіс тимчасово недоступний .» that an empty `id` produces — which this
 * builder can never send, since `readReceiptQr` refuses реквізити without one.
 *
 * A wrong сума landing here is deliberate and is the honest answer: the tax service will not serve
 * the чек for the сума asked for, and no retry of the same QR can change that.
 */
const NOT_FOUND_PREFIX = 'Інформація відсутня';

/**
 * The moment as `chkAllWeb` wants it: `YYYY-MM-DD HH:mm:ss`.
 *
 * The service matches to the minute — 11:30:24 and 11:30:59 both find the чек registered at
 * 11:30, while 11:29 and 11:35 do not — so a QR that gives only `HHmm` is sent with `:00` and
 * finds its чек all the same. A date without a time, or a time without seconds, answers 400.
 */
function momentOf(ref: ReceiptLookup): string {
  return `${ref.date} ${ref.time}:${ref.seconds ?? '00'}`;
}

/**
 * The URL of one lookup.
 *
 * `sm` goes as the QR wrote it. The service is particular about it in ways no re-formatting can
 * predict — `780`, `780.0` and `0780.00` are all accepted, `780,00` is a 400 — and a сума that has
 * been through a number on the way here is a сума this app made up. Exported so a test can read
 * exactly what would be sent without a transport in the way.
 */
export function chkAllWebUrl(ref: ReceiptLookup): string {
  const query = [
    ['id', ref.fiscalNumber],
    ['fn', ref.registrarNumber],
    ['sm', ref.sumText],
    ['date', momentOf(ref)],
    ['type', TYPE],
    // Sent empty, as the page does when its invisible reCAPTCHA yields nothing. Omitting it also
    // answers 200 today; sending it is what the service's own client does.
    ['captcha', ''],
  ];
  return `${ENDPOINT}?${query
    .map(([name, value]) => `${name as string}=${encodeURIComponent(value as string)}`)
    .join('&')}`;
}

const NOT_FOUND: LookupOutcome = { kind: 'not-found' };
const REQUEST_REJECTED: LookupOutcome = { kind: 'request-rejected' };
const UNAVAILABLE: LookupOutcome = { kind: 'unavailable' };
const UNREADABLE: LookupOutcome = { kind: 'unreadable' };

function json(body: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(body);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A 400 read as either «no such чек» or «the contract changed».
 *
 * The distinction matters to the owner: not-found means wait and try again in a few days, while
 * request-rejected means this version of the app is asking the wrong question and no amount of
 * waiting will help.
 */
function refusal(body: string): LookupOutcome {
  const described = json(body)?.error_description;
  if (typeof described !== 'string') return REQUEST_REJECTED;
  return described.trimStart().startsWith(NOT_FOUND_PREFIX) ? NOT_FOUND : REQUEST_REJECTED;
}

/**
 * A 200 read as the document, or as an answer this version cannot make sense of.
 *
 * Only `checkXml` is read. `check` is the same чек as plain text the page displays, and
 * `checkP7s` is its signature — neither is stored, neither is parsed, and a change to either
 * cannot affect this app.
 */
function served(body: string): LookupOutcome {
  const payload = json(body)?.checkXml;
  if (typeof payload !== 'string' || payload === '') return UNREADABLE;

  const bytes = bytesFromBase64(payload);
  if (bytes === undefined) return UNREADABLE;

  const document = decodeFiscalDocument(bytes);
  return document.trim() === '' ? UNREADABLE : { kind: 'found', document };
}

/**
 * The provider the app runs with. Takes its transport, so `verify` proves every mapping through a
 * fake one and the real `fetch` appears in no test.
 *
 * Exactly one request per call and no retry of its own: a чек that could not be fetched is the
 * owner's decision to try again, which is the only thing that keeps «one request per lookup» true
 * when the tax service is slow.
 */
export function chkAllWebProvider(fetchImpl: FetchLike): FiscalReceiptProvider {
  return {
    async lookup(ref: ReceiptLookup): Promise<LookupOutcome> {
      let response: Awaited<ReturnType<FetchLike>>;
      try {
        response = await fetchImpl(chkAllWebUrl(ref));
      } catch {
        // Offline, DNS, TLS, timeout — all the same thing to the owner: not now, try again.
        return UNAVAILABLE;
      }

      let body: string;
      try {
        body = await response.text();
      } catch {
        return UNREADABLE;
      }

      if (response.ok) return served(body);
      // 400 is the service saying something about the request. Everything else — 403 and 429 (the
      // captcha, or too many asks), 5xx, anything unexpected — is the service being unavailable,
      // which is a state that passes.
      return response.status === 400 ? refusal(body) : UNAVAILABLE;
    },
  };
}
