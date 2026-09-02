import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import { parseCheck01 } from './check01';
import { readXml, type ParsedReceipt, type XmlNode } from './document';

/**
 * The ПРРО dialect against the official ЄВПЕЗ examples and two real receipts. The two
 * `synthetic-` fixtures cover the shapes no observed ПРРО document carried — a barcode, and a
 * shift document — and say so in their own text.
 */

function parse(name: string) {
  const text = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  const root = readXml(text)?.CHECK as XmlNode;
  return parseCheck01(root);
}

function receiptOf(name: string): ParsedReceipt {
  const outcome = parse(name);
  if (outcome.kind !== 'parsed') throw new Error(`expected a чек, got ${outcome.kind}`);
  return outcome.receipt;
}

describe('the official ЄВПЕЗ examples', () => {
  it('A weighed product keeps its fractional quantity', () => {
    const receipt = receiptOf('check01-official-tovar.xml');
    const [chicken] = receipt.items;

    expect(chicken).toEqual({
      line: 1,
      // Verbatim: the fixture prints it with a capital С, and «exactly as printed» means exactly.
      rawName: 'Куряче Стегно',
      quantityThousandths: 5701,
      unit: 'кг',
      unitPrice: money(5230, 'UAH'),
      lineTotal: money(29816, 'UAH'),
      uktzed: '876543',
      code: '98765',
    });
    // 5.701 × 52.30 is 298.1623 — the document's 298.16 is kept, not a recomputation.
    expect(chicken?.lineTotal).toEqual(money(29816, 'UAH'));
  });

  it('reads a row whose quantity is a bare integer', () => {
    const receipt = receiptOf('check01-official-tovar.xml');

    expect(receipt.items[1]).toMatchObject({
      rawName: 'Пиво',
      quantityThousandths: 6000,
      unit: 'бут',
      unitPrice: money(1650, 'UAH'),
      lineTotal: money(9900, 'UAH'),
    });
  });

  it('takes the чек total from the document and the seller from its header', () => {
    const receipt = receiptOf('check01-official-tovar.xml');

    expect(receipt.total).toEqual(money(41766, 'UAH'));
    expect(receipt.sellerName).toBe('ТОВ "ФОЗЗІ-ФУД"');
    expect(receipt.pointName).toBe('магазин "СІЛЬПО"');
    expect(receipt.issuedDate).toBe('2015-11-18');
    expect(receipt.issuedTime).toBe('20:15:43');
    expect(receipt.dialect).toBe('prro');
    expect(receipt.items).toHaveLength(3);
  });

  it("A line discount is kept beside its позиція and the total is the document's", () => {
    const receipt = receiptOf('check01-official-znyzhky.xml');

    expect(receipt.items.map((i) => [i.rawName, i.lineTotal.amount, i.discount?.amount])).toEqual([
      ['морква', 10000, 5000],
      ['цибуля', 20000, 4000],
    ]);
    expect(receipt.total).toEqual(money(21000, 'UAH'));
  });

  it('A чек-level discount figure is not kept', () => {
    // CHECKTOTAL states DISCOUNTSUM 90.00 beside the line discounts of 50.00 and 40.00. Keeping it
    // would be a second number that can drift from the total the чек was actually paid at.
    const receipt = receiptOf('check01-official-znyzhky.xml');

    expect(JSON.stringify(receipt)).not.toContain('9000');
    expect(receipt.total.amount).toBe(21000);
    // The позиції deliberately do not sum to the total — 300,00 of goods, 210,00 paid.
    expect(receipt.items.reduce((sum, i) => sum + i.lineTotal.amount, 0)).toBe(30000);
  });

  it('A return document is a return', () => {
    const receipt = receiptOf('check01-official-povernennia.xml');

    expect(receipt.kind).toBe('return');
    expect(receipt.items.length).toBeGreaterThan(0);
    expect(receipt.items[0]).toMatchObject({ rawName: 'Куряче Стегно', quantityThousandths: 5701 });
  });

  it('reads a sale as a sale', () => {
    expect(receiptOf('check01-official-tovar.xml').kind).toBe('sale');
  });
});

describe('the two real ПРРО receipts', () => {
  it('parses a pretty-printed and a minified document identically in shape', () => {
    const minified = receiptOf('prro-real-1-item-test-payer.xml');
    const pretty = receiptOf('prro-real-1-item-fop.xml');

    for (const receipt of [minified, pretty]) {
      expect(receipt.dialect).toBe('prro');
      expect(receipt.kind).toBe('sale');
      expect(receipt.items).toHaveLength(1);
      expect(receipt.sellerName).toBe('ТОВ "ПРОДАВЕЦЬ"');
    }
    expect(minified.total).toEqual(money(9999, 'UAH'));
    expect(pretty.total).toEqual(money(84000, 'UAH'));
    expect(minified.documentRegistrarNumber).toBe('4000146829');
    expect(pretty.documentRegistrarNumber).toBe('4000191957');
  });

  it('names no fiscal number when the document carries none', () => {
    // Neither real receipt has ORDERTAXNUM — which is exactly why the identity comes from the
    // реквізити the чек was looked up with.
    expect(receiptOf('prro-real-1-item-test-payer.xml').documentFiscalNumber).toBeUndefined();
    expect(receiptOf('prro-real-1-item-fop.xml').documentFiscalNumber).toBeUndefined();
  });

  it('keeps a row that names no unit and no code', () => {
    expect(receiptOf('prro-real-1-item-fop.xml').items[0]).toEqual({
      line: 1,
      rawName: 'ЗК-00626',
      quantityThousandths: 1000,
      unitPrice: money(84000, 'UAH'),
      lineTotal: money(84000, 'UAH'),
    });
  });

  it('reads the same чек whether the document is pretty-printed or minified', () => {
    const text = readFileSync(
      new URL('./fixtures/prro-real-1-item-test-payer.xml', import.meta.url),
      'utf8',
    );
    const spaced = text.replace(/></g, '>\n  <');

    const asIs = parseCheck01(readXml(text)?.CHECK as XmlNode);
    const reformatted = parseCheck01(readXml(spaced)?.CHECK as XmlNode);

    expect(reformatted).toEqual(asIs);
  });
});

describe('the shapes no observed ПРРО receipt carried', () => {
  it('A barcode is kept when present and absent when not', () => {
    const receipt = receiptOf('synthetic-prro-barcode.xml');

    expect(receipt.items[0]?.barcode).toBe('40084725');
    expect(receipt.items[0]?.uktzed).toBe('1806903100');
    expect(receipt.items[1]?.barcode).toBeUndefined();
    expect(receipt.items[1]?.uktzed).toBeUndefined();
    expect('barcode' in (receipt.items[1] as object)).toBe(false);
  });

  it('refuses a service document as not a sale or return', () => {
    expect(parse('synthetic-prro-shift.xml')).toEqual({ kind: 'not-a-sale-or-return' });
  });
});

describe('a document this parser cannot hold', () => {
  const check = (body: string) =>
    parseCheck01(
      readXml(`<CHECK>${body}</CHECK>`)?.CHECK as XmlNode,
    );

  it('refuses one with no total, no date or no time', () => {
    expect(check('<CHECKHEAD><DOCTYPE>0</DOCTYPE><ORDERDATE>18112015</ORDERDATE><ORDERTIME>201543</ORDERTIME></CHECKHEAD>')).toEqual(
      { kind: 'not-a-fiscal-document' },
    );
    expect(
      check(
        '<CHECKHEAD><DOCTYPE>0</DOCTYPE><ORDERTIME>201543</ORDERTIME></CHECKHEAD><CHECKTOTAL><SUM>1.00</SUM></CHECKTOTAL>',
      ),
    ).toEqual({ kind: 'not-a-fiscal-document' });
  });

  it('refuses a сума with more fraction digits than kopiykas', () => {
    expect(
      check(
        '<CHECKHEAD><DOCTYPE>0</DOCTYPE><ORDERDATE>18112015</ORDERDATE><ORDERTIME>201543</ORDERTIME></CHECKHEAD><CHECKTOTAL><SUM>1.005</SUM></CHECKTOTAL>',
      ),
    ).toEqual({ kind: 'not-a-fiscal-document' });
  });

  it('refuses the whole document when one row is unreadable', () => {
    const head =
      '<CHECKHEAD><DOCTYPE>0</DOCTYPE><ORDERDATE>18112015</ORDERDATE><ORDERTIME>201543</ORDERTIME></CHECKHEAD><CHECKTOTAL><SUM>10.00</SUM></CHECKTOTAL>';

    expect(
      check(
        `${head}<CHECKBODY><ROW ROWNUM="1"><NAME>Молоко</NAME><COST>10.00</COST></ROW><ROW ROWNUM="2"><NAME>Хліб</NAME></ROW></CHECKBODY>`,
      ),
    ).toEqual({ kind: 'not-a-fiscal-document' });
  });

  it('refuses a document dated impossibly', () => {
    expect(
      check(
        '<CHECKHEAD><DOCTYPE>0</DOCTYPE><ORDERDATE>31022015</ORDERDATE><ORDERTIME>201543</ORDERTIME></CHECKHEAD><CHECKTOTAL><SUM>1.00</SUM></CHECKTOTAL>',
      ),
    ).toEqual({ kind: 'not-a-fiscal-document' });
  });
});
