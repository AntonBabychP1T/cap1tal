import type { ReceiptLookup } from './qr';

/**
 * The seam between the app and the tax service.
 *
 * The port and its double only — `chk-all-web.ts` is the one file that knows an address, a query
 * format or an error text, and nothing outside it may. That is what makes «the app depends on no
 * particular address» a property of the code rather than a promise: every rule about what happens
 * on each outcome is proven here against the double, and the screen never learns how the чек was
 * fetched.
 *
 * Failures are values, as everywhere else in this repo. A lookup never throws: offline, a timeout,
 * a refused request and an answer in a shape this version cannot read are four different sentences
 * the owner reads, and none of them is an exception for a caller to remember to catch.
 */

export type LookupOutcome =
  /** The tax service served the document; `document` is the decoded text, ready to parse. */
  | { readonly kind: 'found'; readonly document: string }
  /** The service knows no чек for these реквізити — or knows one with another сума. */
  | { readonly kind: 'not-found' }
  /** The service refused the request as one it cannot process: the contract has changed. */
  | { readonly kind: 'request-rejected' }
  /** Offline, timed out, rate-limited, or the service is down. Worth another tap later. */
  | { readonly kind: 'unavailable' }
  /** An answer that is not the shape this version expects, or a payload it cannot decode. */
  | { readonly kind: 'unreadable' };

export interface FiscalReceiptProvider {
  /** One lookup, one outcome. Stores nothing, so retrying is always safe. */
  lookup(ref: ReceiptLookup): Promise<LookupOutcome>;
}

/** How a seeded double is keyed: the three реквізити a чек is identified by. */
function keyOf(ref: Pick<ReceiptLookup, 'registrarNumber' | 'fiscalNumber' | 'date'>): string {
  return `${ref.registrarNumber}/${ref.fiscalNumber}/${ref.date}`;
}

export interface InMemoryFiscalReceiptProvider extends FiscalReceiptProvider {
  /** The document this provider answers with for exactly these реквізити. */
  seed(ref: Pick<ReceiptLookup, 'registrarNumber' | 'fiscalNumber' | 'date'>, document: string): void;
  /** What every unseeded lookup answers. `not-found` unless something else is asked for. */
  answerWith(outcome: LookupOutcome): void;
  /** Every lookup made, in order — how a test proves that a retry made exactly one more. */
  readonly calls: () => readonly ReceiptLookup[];
}

/**
 * The port the tests use, and the only implementation `verify` ever loads.
 *
 * Two things it records are the point of it: which реквізити were asked for, and how many times.
 * «Nothing is retried on its own» and «one request per lookup» are not properties anyone can read
 * off the screen code — they are properties of how often this double was called.
 */
export function inMemoryFiscalReceiptProvider(
  initial: LookupOutcome = { kind: 'not-found' },
): InMemoryFiscalReceiptProvider {
  const seeded = new Map<string, string>();
  const calls: ReceiptLookup[] = [];
  let fallback = initial;

  return {
    seed(ref, document) {
      seeded.set(keyOf(ref), document);
    },
    answerWith(outcome) {
      fallback = outcome;
    },
    calls: () => calls,
    lookup(ref) {
      calls.push(ref);
      const document = seeded.get(keyOf(ref));
      // A seeded чек wins over the fallback, so a test can say «the service is otherwise down»
      // and still have one чек be findable.
      return Promise.resolve<LookupOutcome>(
        document === undefined ? fallback : { kind: 'found', document },
      );
    },
  };
}
