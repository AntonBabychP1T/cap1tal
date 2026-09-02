import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import { attachable, parseFiscalDocument, type ParsedReceipt } from './parse';
import { readReceiptQr, type ReceiptLookup } from './qr';

/**
 * The door into parsing, and the check that a document is *the* чек. Every case here goes in as
 * the decoded text of a whole document, exactly as the adapter would hand it over.
 */

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function receiptOf(name: string): ParsedReceipt {
  const outcome = parseFiscalDocument(fixture(name));
  if (outcome.kind !== 'parsed') throw new Error(`expected a чек, got ${outcome.kind}`);
  return outcome.receipt;
}

function lookupFrom(query: string): ReceiptLookup {
  const reading = readReceiptQr(`https://cabinet.tax.gov.ua/cashregs/check?${query}`);
  if (reading.kind !== 'lookup') throw new Error(`expected реквізити, got ${reading.kind}`);
  return reading.lookup;
}

describe('dispatching on the root element', () => {
  it('reads a ПРРО <CHECK> document through the check01 parser', () => {
    const receipt = receiptOf('prro-real-1-item-test-payer.xml');

    expect(receipt.dialect).toBe('prro');
    expect(receipt.total).toEqual(money(9999, 'UAH'));
  });

  it('reads a classic РРО <RQ> packet through the ФСКО parser', () => {
    const receipt = receiptOf('rro-real-grocery-8-items.xml');

    expect(receipt.dialect).toBe('rro');
    expect(receipt.items).toHaveLength(8);
  });

  it('An unknown document is refused whole', () => {
    for (const text of [
      '<SOMETHINGELSE><A/></SOMETHINGELSE>',
      'not xml at all',
      '',
      '   ',
      '{"json":true}',
      '<?xml version="1.0"?><html><body>Помилка</body></html>',
    ]) {
      expect(parseFiscalDocument(text), text).toEqual({ kind: 'not-a-fiscal-document' });
    }
  });

  it('refuses a service document by its own reason, not as an unknown one', () => {
    expect(parseFiscalDocument(fixture('synthetic-prro-shift.xml'))).toEqual({
      kind: 'not-a-sale-or-return',
    });
  });

  it('A чек-level discount figure is not kept, in either dialect', () => {
    const prro = receiptOf('check01-official-znyzhky.xml');
    const rro = receiptOf('synthetic-rro-return-discount.xml');

    // The ПРРО document states CHECKTOTAL/DISCOUNTSUM 90.00 and the РРО packet a <D> with no NI;
    // in both the line discounts survive on their позиції and the чек-level figure does not.
    expect(prro.items.map((i) => i.discount?.amount)).toEqual([5000, 4000]);
    expect(prro.total.amount).toBe(21000);
    expect(rro.items.map((i) => i.discount?.amount)).toEqual([500, undefined]);
    expect(rro.total.amount).toBe(7500);
  });
});

describe('whether the document is the чек that was looked up', () => {
  it('A ПРРО document without a fiscal number takes its identity from the реквізити', () => {
    const receipt = receiptOf('prro-real-1-item-test-payer.xml');
    const lookup = lookupFrom('id=1384600901&fn=4000146829&date=20230930&time=145454&sm=99.99');

    const outcome = attachable(receipt, lookup);

    expect(outcome.kind).toBe('attachable');
    if (outcome.kind === 'attachable') {
      expect(outcome.attachable.registrarNumber).toBe('4000146829');
      expect(outcome.attachable.fiscalNumber).toBe('1384600901');
      expect(outcome.attachable.issuedDate).toBe('2023-09-30');
    }
    // The document itself claimed no fiscal number at all — the реквізити are where it came from.
    expect(receipt.documentFiscalNumber).toBeUndefined();
  });

  it('A document that disagrees with the реквізити is refused', () => {
    const receipt = receiptOf('prro-real-1-item-test-payer.xml');

    expect(
      attachable(receipt, lookupFrom('id=1&fn=3000909908&date=20230930&time=145454&sm=99.99')),
    ).toEqual({ kind: 'not-this-receipt', disagreesOn: 'registrar' });
    expect(
      attachable(receipt, lookupFrom('id=1&fn=4000146829&date=20230929&time=145454&sm=99.99')),
    ).toEqual({ kind: 'not-this-receipt', disagreesOn: 'date' });
    expect(
      attachable(receipt, lookupFrom('id=1&fn=4000146829&date=20230930&time=145454&sm=99.98')),
    ).toEqual({ kind: 'not-this-receipt', disagreesOn: 'total' });
  });

  it('refuses a document whose own fiscal number is not the one asked for', () => {
    const receipt = receiptOf('rro-real-grocery-8-items.xml');

    // The packet names <E NO="696582">; asking for 696583 is asking for another чек.
    expect(
      attachable(receipt, lookupFrom('id=696583&fn=3000909908&date=20260429&time=222006&sm=437.40')),
    ).toEqual({ kind: 'not-this-receipt', disagreesOn: 'fiscalNumber' });
  });

  it('accepts the real grocery packet under its own реквізити', () => {
    const receipt = receiptOf('rro-real-grocery-8-items.xml');
    const outcome = attachable(
      receipt,
      lookupFrom('id=696582&fn=3000909908&date=20260429&time=222006&sm=437.40'),
    );

    expect(outcome.kind).toBe('attachable');
    if (outcome.kind === 'attachable') {
      expect(outcome.attachable).toMatchObject({
        registrarNumber: '3000909908',
        fiscalNumber: '696582',
        issuedDate: '2026-04-29',
      });
    }
  });
});
