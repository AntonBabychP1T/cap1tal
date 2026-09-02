import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import { readXml, type ParsedReceipt, type XmlNode } from './document';
import { parseRroPacket } from './rro-packet';

/**
 * The classic РРО dialect against one real grocery receipt, plus the two `synthetic-` fixtures
 * covering what that receipt does not contain: a return, both discount shapes, and a row carrying
 * neither a barcode nor a unit price.
 */

function parse(name: string) {
  const text = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  return parseRroPacket(readXml(text)?.RQ as XmlNode);
}

function receiptOf(name: string): ParsedReceipt {
  const outcome = parse(name);
  if (outcome.kind !== 'parsed') throw new Error(`expected a чек, got ${outcome.kind}`);
  return outcome.receipt;
}

describe('the real grocery receipt', () => {
  it('A classic РРО grocery document parses into eight позиції', () => {
    const receipt = receiptOf('rro-real-grocery-8-items.xml');

    expect(receipt.dialect).toBe('rro');
    expect(receipt.kind).toBe('sale');
    expect(receipt.total).toEqual(money(43740, 'UAH'));
    expect(receipt.items).toHaveLength(8);
    expect(receipt.issuedDate).toBe('2026-04-29');
    expect(receipt.issuedTime).toBe('22:20:06');
  });

  it('holds the fifth позиція exactly as the document printed it', () => {
    const receipt = receiptOf('rro-real-grocery-8-items.xml');

    expect(receipt.items[4]).toEqual({
      line: 9,
      rawName: 'Снек Кіндер Мілк Слайс 28г',
      quantityThousandths: 2000,
      unit: 'шт',
      unitPrice: money(2590, 'UAH'),
      lineTotal: money(5180, 'UAH'),
      barcode: '40084725',
      code: '1178',
    });
  });

  it('Free-text lines are not позиції', () => {
    const receipt = receiptOf('rro-real-grocery-8-items.xml');

    // The document holds ten <L> free-text lines, an <M> payment line with a masked card and an
    // <E> fiscal footer. Exactly the eight <P> rows became позиції.
    for (const item of receipt.items) {
      expect(item.rawName).not.toContain('рядок вільного тексту');
      expect(item.rawName).not.toBe('БЕЗГОТІВКОВА');
    }
    expect(receipt.items.map((i) => i.rawName)).toEqual([
      'ВодаНегазованаМиргородська1,5',
      'Напій Кока-Кола Зеро 1,75 л',
      'Сендвіч з бужениною 210г, шт',
      'Сендвіч з беконом та скремблом 190г, шт',
      'Снек Кіндер Мілк Слайс 28г',
      'Снек Кіндер Максі Кінг 35г',
      'Бісквіт молочний Барні 30г',
      'Чай Обліпиховий Смакуйте 40г',
    ]);
  });

  it('keeps the позиції in document order', () => {
    expect(receiptOf('rro-real-grocery-8-items.xml').items.map((i) => i.line)).toEqual([
      5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it('reads the реєстратор and the document number the packet names', () => {
    const receipt = receiptOf('rro-real-grocery-8-items.xml');

    expect(receipt.documentRegistrarNumber).toBe('3000909908');
    expect(receipt.documentFiscalNumber).toBe('696582');
  });

  it('A row without a unit price stays without one', () => {
    const receipt = receiptOf('rro-real-grocery-8-items.xml');
    const water = receipt.items[0];

    // The first four rows carry no PRC and no Q — the shape a till prints when the quantity is one.
    expect(water).toMatchObject({ quantityThousandths: 1000, lineTotal: money(2340, 'UAH') });
    expect(water?.unitPrice).toBeUndefined();
    expect(water?.unit).toBeUndefined();
  });
});

describe('the shapes the real receipt does not contain', () => {
  it('reads C@T=1 as a return', () => {
    const receipt = receiptOf('synthetic-rro-return-discount.xml');

    expect(receipt.kind).toBe('return');
    expect(receipt.total).toEqual(money(7500, 'UAH'));
  });

  it('lands a <D NI> discount on its line and keeps a <D> without NI nowhere', () => {
    const receipt = receiptOf('synthetic-rro-return-discount.xml');

    expect(receipt.items.map((i) => [i.line, i.lineTotal.amount, i.discount?.amount])).toEqual([
      [2, 5000, 500],
      [3, 3000, undefined],
    ]);
    // The <D SM="200"> naming no line is a чек-level figure and is kept nowhere at all.
    expect(JSON.stringify(receipt)).not.toContain('200,');
    expect(receipt.items.some((i) => i.discount?.amount === 200)).toBe(false);
  });

  it('A barcode is absent when the row carries none, and so is the unit price', () => {
    const receipt = receiptOf('synthetic-rro-no-barcode.xml');
    const [service, product] = receipt.items;

    expect(service).toEqual({
      line: 2,
      rawName: 'Послуга без штрихкоду',
      quantityThousandths: 1000,
      lineTotal: money(4500, 'UAH'),
      code: '12',
    });
    expect(product?.barcode).toBe('4820000000031');
    expect(product?.unitPrice).toEqual(money(1500, 'UAH'));
  });

  it('the позиції need not add up to the document total', () => {
    const receipt = receiptOf('synthetic-rro-return-discount.xml');

    expect(receipt.items.reduce((sum, i) => sum + i.lineTotal.amount, 0)).toBe(8000);
    expect(receipt.total.amount).toBe(7500);
  });
});

describe('a packet this parser cannot hold', () => {
  const packet = (body: string) => parseRroPacket(readXml(`<RQ>${body}</RQ>`)?.RQ as XmlNode);

  it('refuses one with no <C> at all', () => {
    expect(packet('<DAT FN="1"></DAT>')).toEqual({ kind: 'not-a-fiscal-document' });
  });

  it('refuses a service operation as not a sale or return', () => {
    expect(
      packet('<DAT FN="1"><C T="2"><E SM="100" TS="20260429222006"></E></C></DAT>'),
    ).toEqual({ kind: 'not-a-sale-or-return' });
  });

  it('refuses a packet whose total is not a plain integer', () => {
    expect(
      packet('<DAT FN="1"><C T="0"><E SM="437.40" TS="20260429222006"></E></C></DAT>'),
    ).toEqual({ kind: 'not-a-fiscal-document' });
  });

  it('refuses the whole packet when one row is unreadable', () => {
    expect(
      packet(
        '<DAT FN="1"><C T="0"><P N="1" NM="Молоко" SM="1000"></P><P N="2" NM="Хліб"></P><E SM="1000" TS="20260429222006"></E></C></DAT>',
      ),
    ).toEqual({ kind: 'not-a-fiscal-document' });
  });

  it('falls back to <DAT><TS> when the footer names no moment', () => {
    const outcome = packet(
      '<DAT FN="1"><C T="0"><E SM="1000"></E></C><TS>20260429222006</TS></DAT>',
    );

    expect(outcome).toMatchObject({ kind: 'parsed' });
    if (outcome.kind === 'parsed') {
      expect(outcome.receipt.issuedDate).toBe('2026-04-29');
      expect(outcome.receipt.issuedTime).toBe('22:20:06');
    }
  });
});
