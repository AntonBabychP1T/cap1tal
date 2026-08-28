import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import type { CapturedNotification } from './capture';
import {
  parseGeneric,
  parseInputOf,
  parseNotification,
  type NotificationParser,
  type ParseOutcome,
} from './parse';

const POSTED_AT = Date.UTC(2026, 7, 26, 9, 30, 0);

const capture = (over: Partial<CapturedNotification> = {}): CapturedNotification => ({
  packageName: 'ua.privatbank.ap24',
  postedAt: POSTED_AT,
  title: '',
  text: '',
  ...over,
});

/** Most scenarios speak of "the text"; the title is empty and the joined input is that text. */
const read = (text: string): ParseOutcome => parseGeneric(capture({ text }));

/**
 * The pieces a Ukrainian bank notification is actually built from, shuffled into nonsense. Plain
 * random strings are almost all ASCII noise and never reach the currency or direction branches;
 * this reaches them, which is where a total parser could stop being total.
 */
const FRAGMENTS = [
  'Оплата', 'Списання', 'Зарахування', 'Поповнення', 'Повернення', 'Надходження',
  'СІЛЬПО', 'Баланс', 'Доступно',
  'грн', 'ГРН', '₴', 'UAH', 'USD', '$', 'EUR', '€', 'PLN',
  '250', '0', '0.00', '1 234', '1 234,56', '99.00', '5168**1234', '26.08.2026', '41.2534',
  '99999999999999999999', '1.234,56',
  '.', ',', ':', '-', '+', '*', ' ', '',
];

const hostile = fc.oneof(
  fc.string(),
  fc.array(fc.constantFrom(...FRAGMENTS), { maxLength: 12 }).map((parts) => parts.join(' ')),
  fc
    .array(fc.oneof(fc.constantFrom(...FRAGMENTS), fc.string({ maxLength: 4 })), { maxLength: 12 })
    .map((parts) => parts.join('')),
);

const movement = (outcome: ParseOutcome) => {
  expect(outcome.kind).toBe('movement');
  if (outcome.kind !== 'movement') throw new Error('unreachable');
  return outcome.movement;
};

describe('parseInputOf', () => {
  it('joins title and text, title first, collapsing whitespace', () => {
    expect(parseInputOf(capture({ title: ' Оплата  99.00 грн ', text: 'MEGOGO\n\nПідписка' }))).toBe(
      'Оплата 99.00 грн MEGOGO Підписка',
    );
  });
});

describe('the generic parser', () => {
  it('Scenario: A purchase notification parses to money out in minor units', () => {
    expect(movement(read('Оплата 250.00UAH. Сільпо. Баланс: 1234.56UAH'))).toEqual({
      direction: 'out',
      amount: money(25000, 'UAH'),
    });
  });

  it('Scenario: A comma-decimal amount with thousands spaces parses exactly', () => {
    expect(movement(read('Покупка на суму 1 234,56 грн, APTEKA'))).toEqual({
      direction: 'out',
      amount: money(123456, 'UAH'),
    });
  });

  it('Scenario: An amount with no decimal part parses as whole units', () => {
    expect(movement(read('Списання 250 грн'))).toEqual({
      direction: 'out',
      amount: money(25000, 'UAH'),
    });
  });

  it('Scenario: A top-up notification is money in', () => {
    expect(movement(read('Поповнення на 500.00 грн'))).toEqual({
      direction: 'in',
      amount: money(50000, 'UAH'),
    });
  });

  it('Scenario: The first amount wins, not the balance', () => {
    const parsed = movement(read('Списання 99.00 грн. Доступно: 5 000.00 грн'));
    expect(parsed.amount).toEqual(money(9900, 'UAH'));
  });

  it('Scenario: The first amount wins, not the balance — a masked card number is not an amount', () => {
    const parsed = movement(read('Картка 5168**1234: оплата 250.00 грн. Баланс 3 000.00 грн'));
    expect(parsed.amount).toEqual(money(25000, 'UAH'));
  });

  it('Scenario: The amount may live in the title', () => {
    expect(movement(parseGeneric(capture({ title: 'Оплата 99.00 грн', text: 'MEGOGO' })))).toEqual({
      direction: 'out',
      amount: money(9900, 'UAH'),
    });
  });

  it('reads every currency the app offers, from its code or its mark, before or after the amount', () => {
    expect(movement(read('Оплата 10.00 USD')).amount).toEqual(money(1000, 'USD'));
    expect(movement(read('Оплата $10.00')).amount).toEqual(money(1000, 'USD'));
    expect(movement(read('Оплата 10,00€')).amount).toEqual(money(1000, 'EUR'));
    expect(movement(read('Оплата 10.00 EUR')).amount).toEqual(money(1000, 'EUR'));
    expect(movement(read('Оплата ₴10')).amount).toEqual(money(1000, 'UAH'));
    expect(movement(read('Оплата 10.00 ГРН')).amount).toEqual(money(1000, 'UAH'));
  });

  it('reads every money-in mark, case-insensitively', () => {
    expect(movement(read('Зарахування 100 грн')).direction).toBe('in');
    expect(movement(read('ПОПОВНЕННЯ 100 грн')).direction).toBe('in');
    expect(movement(read('Повернення 100 грн')).direction).toBe('in');
    expect(movement(read('надходження 100 грн')).direction).toBe('in');
  });

  it('Scenario: Hostile text is unparsed, not a crash', () => {
    expect(read('')).toEqual({ kind: 'unparsed' });
    expect(read('Ваш пароль підтверджено')).toEqual({ kind: 'unparsed' });
    // An amount naming no currency the app offers is never given a guessed one (design D5).
    expect(read('Оплата 250.00')).toEqual({ kind: 'unparsed' });
    expect(read('Оплата 250.00 PLN')).toEqual({ kind: 'unparsed' });
    // Zero is not money moving (design D11).
    expect(read('Оплата 0.00 грн')).toEqual({ kind: 'unparsed' });
    // Neither a rate nor a dot-thousands amount is read as the number after its separator.
    expect(read('Курс 41.2534 грн')).toEqual({ kind: 'unparsed' });
    expect(read('Оплата 1.234,56 грн')).toEqual({ kind: 'unparsed' });
    // An amount no integer can hold is not one this app can carry.
    expect(read('Оплата 99999999999999999999 грн')).toEqual({ kind: 'unparsed' });
  });

  it('Scenario: Hostile text is unparsed, not a crash — a date before the amount is not the amount', () => {
    expect(movement(read('26.08.2026 оплата 250.00 грн')).amount).toEqual(money(25000, 'UAH'));
  });

  it('Scenario: Hostile text is unparsed, not a crash — arbitrary strings never throw', () => {
    fc.assert(
      fc.property(hostile, hostile, (title, text) => {
        const outcome = parseGeneric(capture({ title, text }));
        if (outcome.kind === 'movement') {
          expect(Number.isSafeInteger(outcome.movement.amount.amount)).toBe(true);
          expect(outcome.movement.amount.amount).toBeGreaterThan(0);
        }
      }),
      { numRuns: 2000 },
    );
  });
});

describe('parseNotification', () => {
  it('Scenario: A registered parser takes precedence over the generic one', () => {
    const registered: NotificationParser = () => ({
      kind: 'movement',
      movement: { direction: 'in', amount: money(1, 'EUR') },
    });
    const parsers = new Map([['ua.privatbank.ap24', registered]]);
    const notification = capture({ text: 'Оплата 250.00 грн' });

    expect(parseNotification(notification, parsers)).toEqual({
      kind: 'movement',
      movement: { direction: 'in', amount: money(1, 'EUR') },
    });
    // The generic parser would have said something else entirely, so it plainly was not consulted.
    expect(parseGeneric(notification)).toEqual({
      kind: 'movement',
      movement: { direction: 'out', amount: money(25000, 'UAH') },
    });
  });

  it('falls back to the generic parser for an app no parser is registered for', () => {
    const parsers = new Map<string, NotificationParser>();
    expect(parseNotification(capture({ text: 'Списання 250 грн' }), parsers)).toEqual({
      kind: 'movement',
      movement: { direction: 'out', amount: money(25000, 'UAH') },
    });
  });

  it('has no parser registered for a package that could shadow the generic one today', () => {
    // The registry ships empty (design D2); a package name that is an Object property is not a
    // parser either.
    expect(parseNotification(capture({ packageName: 'constructor', text: 'Списання 250 грн' }))).toEqual(
      { kind: 'movement', movement: { direction: 'out', amount: money(25000, 'UAH') } },
    );
  });
});
