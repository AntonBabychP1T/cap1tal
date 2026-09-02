import { describe, expect, it } from 'vitest';

import { inMemoryFiscalReceiptProvider } from './lookup';
import { readReceiptQr, type ReceiptLookup } from './qr';

/**
 * The double's own semantics, because the screen tests rest on them: what it answers, what it
 * records, and that a seeded чек is found by its реквізити and by no others.
 */

function lookupOf(query: string): ReceiptLookup {
  const reading = readReceiptQr(`https://cabinet.tax.gov.ua/cashregs/check?${query}`);
  if (reading.kind !== 'lookup') throw new Error('not реквізити');
  return reading.lookup;
}

const REF = lookupOf('id=696582&fn=3000909908&date=20260429&time=222006&sm=437.40');
const OTHER = lookupOf('id=696583&fn=3000909908&date=20260429&time=222006&sm=437.40');

describe('the in-memory provider', () => {
  it('answers not-found until something is seeded', async () => {
    const provider = inMemoryFiscalReceiptProvider();

    expect(await provider.lookup(REF)).toEqual({ kind: 'not-found' });
  });

  it('finds a seeded чек by its реквізити and nothing else by them', async () => {
    const provider = inMemoryFiscalReceiptProvider();
    provider.seed(REF, '<RQ/>');

    expect(await provider.lookup(REF)).toEqual({ kind: 'found', document: '<RQ/>' });
    expect(await provider.lookup(OTHER)).toEqual({ kind: 'not-found' });
  });

  it('answers with whatever outcome the test asks for', async () => {
    const provider = inMemoryFiscalReceiptProvider();

    for (const outcome of [
      { kind: 'unavailable' },
      { kind: 'request-rejected' },
      { kind: 'unreadable' },
    ] as const) {
      provider.answerWith(outcome);
      expect(await provider.lookup(REF)).toEqual(outcome);
    }
  });

  it('lets a seeded чек be found while everything else is unavailable', async () => {
    const provider = inMemoryFiscalReceiptProvider({ kind: 'unavailable' });
    provider.seed(REF, '<RQ/>');

    expect(await provider.lookup(REF)).toEqual({ kind: 'found', document: '<RQ/>' });
    expect(await provider.lookup(OTHER)).toEqual({ kind: 'unavailable' });
  });

  it('records every lookup in order, which is how a retry is counted', async () => {
    const provider = inMemoryFiscalReceiptProvider();

    await provider.lookup(REF);
    await provider.lookup(REF);
    await provider.lookup(OTHER);

    expect(provider.calls()).toHaveLength(3);
    expect(provider.calls().map((c) => c.fiscalNumber)).toEqual(['696582', '696582', '696583']);
  });

  it('never throws, whatever it is asked', async () => {
    const provider = inMemoryFiscalReceiptProvider();

    await expect(provider.lookup(REF)).resolves.toBeDefined();
  });
});
