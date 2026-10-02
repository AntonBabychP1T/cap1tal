import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { foldCase } from './fold';
import {
  NO_MERCHANTS,
  SERVICE_WORDS,
  merchant,
  merchantIndex,
  merchantNameKey,
  proposeMerchant,
  type Merchant,
} from './merchants';
import { isRefusal } from './refusal';

/** A продавець named at `at`, its написання added in the order given, one minute apart. */
function named(id: string, name: string, spellings: readonly string[], at = '2026-01-01T00:00:00Z'): Merchant {
  const base = new Date(at).getTime();
  return merchant({
    id,
    name,
    spellings: spellings.map((spelling, n) => ({
      id: `${id}-s${n}`,
      spelling,
      addedAt: new Date(base + n * 60_000),
    })),
    createdAt: new Date(base),
  });
}

function refusalOf(build: () => unknown): string | undefined {
  try {
    build();
    return undefined;
  } catch (error) {
    if (isRefusal(error)) return error.message;
    throw error;
  }
}

describe('merchant', () => {
  it('Scenario: A продавець is stored with its назва and написання', () => {
    const atb = named('atb', 'АТБ', ['атб', 'ATB']);
    expect(atb.name).toBe('АТБ');
    expect(atb.spellings.map((s) => s.spelling)).toEqual(['атб', 'atb']);
  });

  it('Scenario: A blank назва is refused', () => {
    expect(refusalOf(() => named('x', '   ', ['атб']))).toBeDefined();
  });

  it('Scenario: A продавець with no написання is refused', () => {
    expect(refusalOf(() => named('x', 'Сільпо', []))).toBeDefined();
  });

  it('A blank написання is refused, and so is one написання given twice', () => {
    expect(refusalOf(() => named('x', 'АТБ', ['  ']))).toBeDefined();
    expect(refusalOf(() => named('x', 'АТБ', ['атб', 'АТБ ']))).toBeDefined();
  });

  it('A назва is kept trimmed, and its key ignores letter case and surrounding whitespace', () => {
    expect(named('x', '  АТБ ', ['атб']).name).toBe('АТБ');
    expect(merchantNameKey('АТБ')).toBe(merchantNameKey('атб '));
  });
});

describe('merchantIndex', () => {
  it('Scenario: A spelling with a branch number and a city is recognised', () => {
    const index = merchantIndex([named('atb', 'АТБ', ['атб'])]);
    expect(index.recognise('Оплата послуг АТБ-Маркет 1234 Київ')).toEqual({
      merchantId: 'atb',
      name: 'АТБ',
      spelling: 'атб',
    });
  });

  it('Scenario: Both scripts are recognised when both are written', () => {
    const index = merchantIndex([named('atb', 'АТБ', ['атб', 'atb'])]);
    expect(index.recognise('АТБ 12')?.merchantId).toBe('atb');
    expect(index.recognise('ATB MARKET')?.merchantId).toBe('atb');
  });

  it('Scenario: No transliteration between scripts', () => {
    const index = merchantIndex([named('atb', 'АТБ', ['атб'])]);
    expect(index.recognise('ATB MARKET')).toBeUndefined();
  });

  it('Scenario: The longest написання wins', () => {
    const index = merchantIndex([
      named('bolt', 'Bolt', ['bolt']),
      named('bolt-food', 'Bolt Food', ['bolt food']),
    ]);
    expect(index.recognise('BOLT FOOD 3411')?.name).toBe('Bolt Food');
  });

  it('Scenario: A tie goes to the newest написання', () => {
    const index = merchantIndex([
      named('kava', 'Кава', ['кава'], '2026-01-01T00:00:00Z'),
      named('zerno', 'Зерно', ['зерн'], '2026-02-01T00:00:00Z'),
    ]);
    expect(index.recognise('КАВА ЗЕРНО')?.name).toBe('Зерно');
  });

  it('A tie does not depend on the order the продавці were read in', () => {
    const kava = named('kava', 'Кава', ['кава'], '2026-01-01T00:00:00Z');
    const zerno = named('zerno', 'Зерно', ['зерн'], '2026-02-01T00:00:00Z');
    expect(merchantIndex([zerno, kava]).recognise('КАВА ЗЕРНО')?.name).toBe('Зерно');
    expect(merchantIndex([kava, zerno]).recognise('КАВА ЗЕРНО')?.name).toBe('Зерно');
  });

  it('Scenario: A транзакція without an опис has no продавець', () => {
    const index = merchantIndex([named('atb', 'АТБ', ['атб'])]);
    expect(index.recognise(undefined)).toBeUndefined();
    expect(index.recognise('')).toBeUndefined();
  });

  it('Scenario: A повернення and a дохід are recognised too', () => {
    // Recognition reads an опис, whatever транзакція carries it.
    const index = merchantIndex([named('rozetka', 'Rozetka', ['rozetka'])]);
    expect(index.recognise('ROZETKA повернення')?.name).toBe('Rozetka');
    expect(index.recognise('Rozetka кешбек')?.name).toBe('Rozetka');
  });

  it('One опис gets one answer however often it is asked', () => {
    const index = merchantIndex([named('atb', 'АТБ', ['атб'])]);
    expect(index.recognise('АТБ 12')).toBe(index.recognise('АТБ 12'));
    expect(index.recognise('Сільпо')).toBeUndefined();
    expect(index.recognise('Сільпо')).toBeUndefined();
  });

  it('No продавці recognise nothing', () => {
    expect(NO_MERCHANTS.recognise('АТБ 12')).toBeUndefined();
  });
});

describe('proposeMerchant', () => {
  it('Scenario: Service words, a hyphenated suffix and a branch number fall away', () => {
    expect(proposeMerchant('Оплата послуг АТБ-Маркет 1234 Київ')).toEqual({ name: 'АТБ', spelling: 'атб' });
  });

  it('Scenario: A word in capitals is written as a name', () => {
    expect(proposeMerchant('СІЛЬПО 123 Київ, вул. Хрещатик')).toEqual({ name: 'Сільпо', spelling: 'сільпо' });
  });

  it('Scenario: Two words at most', () => {
    expect(proposeMerchant('Нова Пошта відділення 5')).toEqual({ name: 'Нова Пошта', spelling: 'нова пошта' });
  });

  it('Scenario: A Latin service word is skipped', () => {
    expect(proposeMerchant('PAYMENT UKLON')).toEqual({ name: 'Uklon', spelling: 'uklon' });
  });

  it('Scenario: An опис that starts with no letter proposes the whole of itself', () => {
    expect(proposeMerchant('7-Eleven Kyiv')).toEqual({ name: '7-Eleven Kyiv', spelling: '7-eleven kyiv' });
  });

  it('Scenario: A service word alone proposes itself', () => {
    expect(proposeMerchant('Оплата')).toEqual({ name: 'Оплата', spelling: 'оплата' });
  });

  it('Scenario: A longer service word alone is not cut down to a shorter one', () => {
    expect(proposeMerchant('Оплата послуг')).toEqual({ name: 'Оплата послуг', spelling: 'оплата послуг' });
  });

  it('Scenario: The spacing the bank wrote is kept', () => {
    const proposed = proposeMerchant('Нова  Пошта відділення 5');
    expect(proposed?.spelling).toBe('нова  пошта');
    expect(foldCase('Нова  Пошта відділення 5').includes(proposed?.spelling ?? '∅')).toBe(true);
  });

  it('Scenario: No опис, no proposal', () => {
    expect(proposeMerchant(undefined)).toBeUndefined();
    expect(proposeMerchant('   ')).toBeUndefined();
  });

  it('Only one service word is skipped, and only when something follows its separator', () => {
    expect(proposeMerchant('Оплата покупка Сільпо')?.spelling).toBe('покупка сільпо');
    expect(proposeMerchant('Оплата ...')?.spelling).toBe('оплата');
    expect(proposeMerchant('POSTER CAFE')?.spelling).toBe('poster cafe');
    expect(proposeMerchant('POS*UKLON TRIP')?.spelling).toBe('uklon trip');
  });

  it('The service words are listed longest first', () => {
    const lengths = SERVICE_WORDS.map((w) => w.length);
    expect([...lengths].sort((a, b) => b - a)).toEqual(lengths);
  });

  it('The proposed написання always occurs in its folded опис', () => {
    const alphabet = fc.constantFrom(
      ...'абвгґдеєжзиіїйклмнопрстуфхцчшщьюяАБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯabcxyzABCXYZ0123456789 -*.,\'"«»/'.split(''),
    );
    const prefix = fc.constantFrom('', 'Оплата послуг ', 'ОПЛАТА ', 'PAYMENT ', 'Покупка: ', 'pos*');
    fc.assert(
      fc.property(prefix, fc.array(alphabet, { maxLength: 40 }), (lead, chars) => {
        const description = lead + chars.join('');
        const proposed = proposeMerchant(description);
        if (description.trim() === '') return proposed === undefined;
        return proposed !== undefined && proposed.spelling !== '' && foldCase(description).includes(proposed.spelling);
      }),
    );
  });
});
