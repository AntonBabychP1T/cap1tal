import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import { readReceiptQr, type ReceiptLookup } from './qr';

/**
 * The one step of the flow that reads text a camera produced. Every case here is a string in and
 * a value out — the reading is total, so there is no case that throws and none that is left over.
 */

function lookupOf(text: string): ReceiptLookup {
  const reading = readReceiptQr(text);
  if (reading.kind !== 'lookup') {
    throw new Error(`expected реквізити, got ${reading.kind}`);
  }
  return reading.lookup;
}

describe('a чек QR is read into реквізити', () => {
  it('A ПРРО QR with seconds and a MAC is read', () => {
    const lookup = lookupOf(
      'https://cabinet.tax.gov.ua/cashregs/check?mac=ABCD&date=20260429&time=222006&id=696582&sm=437.40&fn=4000146829',
    );

    expect(lookup).toEqual({
      fiscalNumber: '696582',
      registrarNumber: '4000146829',
      date: '2026-04-29',
      time: '22:20',
      seconds: '06',
      total: money(43740, 'UAH'),
      sumText: '437.40',
    });
  });

  it('A QR with the time to the minute and another parameter order is read', () => {
    const lookup = lookupOf(
      'https://cabinet.tax.gov.ua/cashregs/check?fn=3000898168&id=45&date=20220904&time=1130&sm=780.00',
    );

    expect(lookup).toEqual({
      fiscalNumber: '45',
      registrarNumber: '3000898168',
      date: '2022-09-04',
      time: '11:30',
      total: money(78000, 'UAH'),
      sumText: '780.00',
    });
    // No seconds means no seconds — the adapter, not this module, decides what to send instead.
    expect('seconds' in lookup).toBe(false);
  });

  it('reads the same реквізити whatever the order of the parameters', () => {
    const orders = [
      'https://cabinet.tax.gov.ua/cashregs/check?id=45&fn=3000898168&date=20220904&time=1130&sm=780.00',
      'https://cabinet.tax.gov.ua/cashregs/check?sm=780.00&time=1130&date=20220904&fn=3000898168&id=45',
      'https://cabinet.tax.gov.ua/cashregs/check?date=20220904&sm=780.00&id=45&time=1130&fn=3000898168',
    ];

    const readings = orders.map(lookupOf);
    expect(readings[1]).toEqual(readings[0]);
    expect(readings[2]).toEqual(readings[0]);
  });

  it('accepts the http scheme and the «sum» alias', () => {
    const lookup = lookupOf(
      'http://cabinet.tax.gov.ua/cashregs/check?id=45&fn=3000898168&date=20220904&time=1130&sum=780.00',
    );

    expect(lookup.total).toEqual(money(78000, 'UAH'));
    expect(lookup.sumText).toBe('780.00');
  });

  it('accepts the host and path in any case, and a trailing slash', () => {
    const lookup = lookupOf(
      'HTTPS://Cabinet.Tax.Gov.UA/CashRegs/Check/?id=45&fn=3000898168&date=20220904&time=1130&sm=780',
    );

    expect(lookup.fiscalNumber).toBe('45');
  });

  it('ignores a fragment and any parameter it does not know', () => {
    const lookup = lookupOf(
      'https://cabinet.tax.gov.ua/cashregs/check?id=45&fn=3000898168&date=20220904&time=1130&sm=780.00&mac=DEAD&lang=uk#top',
    );

    expect(lookup.fiscalNumber).toBe('45');
    expect(lookup.total).toEqual(money(78000, 'UAH'));
  });
});

describe('a text that is not a чек QR', () => {
  it('A QR that is not a чек is refused', () => {
    expect(readReceiptQr('https://example.com/promo')).toEqual({ kind: 'not-a-receipt' });
    expect(readReceiptQr('WIFI:S:home;P:secret;;')).toEqual({ kind: 'not-a-receipt' });
  });

  it('refuses another page of the same site, and another site with the same path', () => {
    expect(readReceiptQr('https://cabinet.tax.gov.ua/login?id=45')).toEqual({
      kind: 'not-a-receipt',
    });
    expect(readReceiptQr('https://evil.example/cashregs/check?id=45&fn=1&date=20220904&time=1130&sm=1')).toEqual(
      { kind: 'not-a-receipt' },
    );
  });

  it('refuses empty text, plain text and a non-http scheme', () => {
    for (const text of ['', '   ', 'просто текст', 'ftp://cabinet.tax.gov.ua/cashregs/check?id=45']) {
      expect(readReceiptQr(text)).toEqual({ kind: 'not-a-receipt' });
    }
  });
});

describe('a чек QR that does not carry what the lookup needs', () => {
  it('A чек QR without the сума or the time is incomplete', () => {
    expect(
      readReceiptQr('https://cabinet.tax.gov.ua/cashregs/check?id=133104756&fn=4000096193&date=20211212'),
    ).toEqual({ kind: 'incomplete', missing: ['time', 'total'] });
  });

  it('names every реквізит a bare link lacks', () => {
    expect(readReceiptQr('https://cabinet.tax.gov.ua/cashregs/check')).toEqual({
      kind: 'incomplete',
      missing: ['fiscalNumber', 'registrarNumber', 'date', 'time', 'total'],
    });
  });

  it('counts a malformed реквізит as a missing one', () => {
    const base = 'https://cabinet.tax.gov.ua/cashregs/check?id=45&fn=3000898168&date=20220904&time=1130&sm=780.00';

    // «780,00» is what the tax service answers 400 to; the owner is told the сума is wrong here
    // rather than after a request that could not have worked.
    expect(readReceiptQr(base.replace('sm=780.00', 'sm=780,00'))).toEqual({
      kind: 'incomplete',
      missing: ['total'],
    });
    expect(readReceiptQr(base.replace('sm=780.00', 'sm=780.000'))).toEqual({
      kind: 'incomplete',
      missing: ['total'],
    });
    expect(readReceiptQr(base.replace('date=20220904', 'date=20220931'))).toEqual({
      kind: 'incomplete',
      missing: ['date'],
    });
    expect(readReceiptQr(base.replace('time=1130', 'time=2570'))).toEqual({
      kind: 'incomplete',
      missing: ['time'],
    });
    expect(readReceiptQr(base.replace('id=45', 'id=abc'))).toEqual({
      kind: 'incomplete',
      missing: ['fiscalNumber'],
    });
    expect(readReceiptQr(base.replace('fn=3000898168', 'fn='))).toEqual({
      kind: 'incomplete',
      missing: ['registrarNumber'],
    });
  });
});

describe('the сума', () => {
  it('A сума is read without floating point', () => {
    const withSum = (sm: string) =>
      lookupOf(
        `https://cabinet.tax.gov.ua/cashregs/check?id=45&fn=3000898168&date=20220904&time=1130&sm=${sm}`,
      ).total;

    expect(withSum('99.99')).toEqual(money(9999, 'UAH'));
    expect(withSum('780')).toEqual(money(78000, 'UAH'));
  });

  it('reads one and two fraction digits alike, and keeps the text as written', () => {
    const withSum = (sm: string) =>
      lookupOf(
        `https://cabinet.tax.gov.ua/cashregs/check?id=45&fn=3000898168&date=20220904&time=1130&sm=${sm}`,
      );

    expect(withSum('780.5').total).toEqual(money(78050, 'UAH'));
    expect(withSum('780.5').sumText).toBe('780.5');
    expect(withSum('0780.00').sumText).toBe('0780.00');
    expect(withSum('0.01').total).toEqual(money(1, 'UAH'));
  });

  it('reads the сума of the один real чек the fixtures came from exactly', () => {
    // 437.40 is the total of `rro-real-grocery-8-items.xml`, in kopiykas and nothing else — the
    // arithmetic that a float would get wrong is the ×100 of a two-decimal figure.
    expect(
      lookupOf(
        'https://cabinet.tax.gov.ua/cashregs/check?id=696582&fn=3000909908&date=20260429&time=222006&sm=437.40',
      ).total,
    ).toEqual(money(43740, 'UAH'));
  });
});
