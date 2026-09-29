import { describe, expect, it } from 'vitest';

import {
  isRealAccountType,
  legEffect,
  parseCsv,
  parseSaldoExport,
  REQUIRED_COLUMNS,
} from './parse';
import { csv, kyivDateOf, leg, SALDO_COLUMNS } from './test-fixtures';

const parsed = (text: string) => {
  const result = parseSaldoExport(text, kyivDateOf);
  if (!result.ok) {
    throw new Error(`expected a parse, got: ${result.reason}`);
  }
  return result.transactions;
};

describe('parseCsv', () => {
  it('reads quoted fields, doubled quotes, CRLF and a BOM', () => {
    expect(parseCsv('﻿"a","b,c","d""e"\r\n"f","g","h"\r\n')).toEqual([
      ['a', 'b,c', 'd"e'],
      ['f', 'g', 'h'],
    ]);
  });

  it('keeps a final row that ends without a newline', () => {
    expect(parseCsv('"a","b"\n"c","d"')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('parseSaldoExport', () => {
  it('Scenario: An alien header rejects the file', () => {
    const without = SALDO_COLUMNS.filter((column) => column !== 'Journal Type');
    const result = parseSaldoExport(csv([leg({})], without), kyivDateOf);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toContain('Journal Type');
  });

  it('Scenario: An alien header rejects the file — a file of something else entirely', () => {
    const result = parseSaldoExport('"date","sum"\n"2024-10-27","123.00"', kyivDateOf);
    expect(result.ok).toBe(false);
    // Every column the interpretation reads is named, so the owner sees what the file is not.
    for (const column of REQUIRED_COLUMNS) {
      expect(result.ok ? '' : result.reason).toContain(column);
    }
  });

  it('Scenario: A quoted description with commas parses whole', () => {
    const description = 'кава, булка, і ще щось';
    const transactions = parsed(csv([leg({ Description: description })]));
    expect(transactions[0]?.legs[0]?.description).toBe(description);
    expect(transactions[0]?.legs).toHaveLength(1);
  });

  it('Scenario: Two legs sharing an id form one transaction', () => {
    const transactions = parsed(
      csv([
        leg({ 'Transaction ID': '41596243', 'Journal Type': 'DEBIT', Account: 'mono black' }),
        leg({
          'Transaction ID': '41596243',
          'Journal Type': 'CREDIT',
          Account: 'Initial balance',
          'Account Type': 'EQUITY',
        }),
        leg({ 'Transaction ID': '41596244', Amount: '5.00' }),
      ]),
    );
    expect(transactions).toHaveLength(2);
    expect(transactions[0]?.id).toBe('41596243');
    expect(transactions[0]?.legs.map((l) => l.amount)).toEqual([
      { amount: 12300, currency: 'UAH' },
      { amount: 12300, currency: 'UAH' },
    ]);
    expect(
      transactions[0]?.legs.filter((l) => l.journalType === 'CREDIT').map((l) => l.account),
    ).toEqual(['Initial balance']);
    expect(transactions[1]?.id).toBe('41596244');
    expect(transactions[1]?.legs).toHaveLength(1);
  });

  it('Scenario: A quoted description containing a newline and a doubled quote parses whole', () => {
    // 34 descriptions in the owner's real export hold a line break and 14 hold a doubled quote;
    // a line-splitting reader would shift every record after them into nonsense.
    const description = 'кава\nі "булка", і ще щось';
    const transactions = parsed(
      csv([
        leg({ 'Transaction ID': '1', Description: description }),
        leg({ 'Transaction ID': '2', Amount: '5.00', Account: 'гаманець' }),
      ]),
    );
    expect(transactions).toHaveLength(2);
    expect(transactions[0]?.legs[0]?.description).toBe(description);
    expect(transactions[1]?.legs[0]).toMatchObject({
      account: 'гаманець',
      amount: { amount: 500, currency: 'UAH' },
    });
  });

  it('Scenario: The datetime becomes a calendar date', () => {
    const transactions = parsed(
      csv([leg({ 'Transaction Date': '2026-03-06T10:15:31.129' })]),
    );
    expect(transactions[0]?.date).toBe('2026-03-06');
    expect(transactions[0]?.legs[0]?.date).toBe('2026-03-06');
  });

  it('Scenario: A late-evening UTC time is the next day in Kyiv', () => {
    const transactions = parsed(
      csv([leg({ 'Transaction Date': '2026-03-06T23:15:31.129' })]),
    );
    expect(transactions[0]?.date).toBe('2026-03-07');
    expect(transactions[0]?.legs[0]?.date).toBe('2026-03-07');
    // The export's own instant stays the ordering key, untouched.
    expect(transactions[0]?.datetime).toBe('2026-03-06T23:15:31.129');
  });

  it('Scenario: A date-only Saldo entry keeps the day the owner chose, summer and winter', () => {
    const transactions = parsed(
      csv([
        leg({ 'Transaction ID': 'summer', 'Transaction Date': '2025-08-25T21:00' }),
        leg({ 'Transaction ID': 'winter', 'Transaction Date': '2026-01-25T22:00' }),
      ]),
    );
    expect(transactions.map((t) => t.date)).toEqual(['2025-08-26', '2026-01-26']);
  });

  it('Scenario: The datetime becomes a calendar date — a minute-precision datetime too', () => {
    const transactions = parsed(csv([leg({ 'Transaction Date': '2026-03-28T07:46' })]));
    expect(transactions[0]?.date).toBe('2026-03-28');
    // Normalised so that lexicographic order stays chronological order.
    expect(transactions[0]?.datetime).toBe('2026-03-28T07:46:00.000');
  });

  it('Scenario: A malformed amount rejects the file with a reason', () => {
    const result = parseSaldoExport(
      csv([leg({}), leg({ 'Transaction ID': '41596244', Amount: '1,234.5' })]),
      kyivDateOf,
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toContain('1,234.5');
    expect(result.ok ? '' : result.reason).toContain('41596244');
  });

  it('Scenario: A malformed amount rejects the file with a reason — nothing is silently skipped', () => {
    for (const amount of ['', '12', '12.5', '12.505', '-12.50', '1e3']) {
      expect(parseSaldoExport(csv([leg({ Amount: amount })]), kyivDateOf).ok).toBe(false);
    }
  });

  it('rejects an amount above the largest сума the app admits, naming the row', () => {
    // One leg at Number.MAX_SAFE_INTEGER kopiykas would pass `money` and then break every sum it
    // entered; the ceiling is the one every other ingress keeps (MAX_AMOUNT_MINOR).
    for (const amount of ['1000000000.00', '90071992547409.91', '99999999999999999999.00']) {
      const result = parseSaldoExport(
        csv([leg({ 'Transaction ID': '41596244', Amount: amount })]),
        kyivDateOf,
      );
      expect(result.ok, amount).toBe(false);
      expect(result.ok ? '' : result.reason).toContain('41596244');
      expect(result.ok ? '' : result.reason).toContain(amount);
      expect(result.ok ? '' : result.reason).toContain('більша за найбільшу');
    }
    expect(parsed(csv([leg({ Amount: '999999999.99' })]))[0]?.legs[0]?.amount.amount).toBe(
      99_999_999_999,
    );
  });

  it('converts decimal text to exact minor units without floating point', () => {
    const transactions = parsed(
      csv([
        leg({ Amount: '0.00' }),
        leg({ 'Transaction ID': '2', Amount: '850.84' }),
        leg({ 'Transaction ID': '3', Amount: '34624.54' }),
        leg({ 'Transaction ID': '4', Amount: '8.29' }),
      ]),
    );
    expect(transactions.map((t) => t.legs[0]?.amount.amount)).toEqual([0, 85084, 3462454, 829]);
  });

  it('rejects a row whose journal type is neither DEBIT nor CREDIT', () => {
    const result = parseSaldoExport(csv([leg({ 'Journal Type': 'REVERSAL' })]), kyivDateOf);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toContain('REVERSAL');
  });

  it('rejects a row with no Transaction ID, an alien currency or an impossible date', () => {
    expect(parseSaldoExport(csv([leg({ 'Transaction ID': '' })]), kyivDateOf).ok).toBe(false);
    expect(parseSaldoExport(csv([leg({ Currency: 'uah' })]), kyivDateOf).ok).toBe(false);
    expect(parseSaldoExport(csv([leg({ 'Transaction Date': '2024-02-30T10:00' })]), kyivDateOf).ok).toBe(false);
  });

  it('refuses a file in the owner\'s language — the reason is what the screen shows', () => {
    const reasonOf = (text: string) => {
      const result = parseSaldoExport(text, kyivDateOf);
      return result.ok ? '' : result.reason;
    };
    expect(reasonOf('')).toBe('Файл порожній. Оберіть експорт Saldo.');
    expect(
      reasonOf(csv([leg({})], SALDO_COLUMNS.filter((column) => column !== 'Journal Type'))),
    ).toBe('Це не схоже на експорт Saldo: у заголовку бракує стовпця Journal Type. Оберіть інший файл.');
    expect(reasonOf(csv([leg({}), leg({ 'Transaction ID': '41596244', Amount: '1,234.5' })]))).toBe(
      'Файл не вдалося прочитати: у рядку 2 (транзакція 41596244) сума «1,234.5» — ' +
        'не число з двома знаками після крапки.',
    );
    expect(reasonOf(csv([leg({ 'Transaction ID': '' })]))).toBe(
      'Файл не вдалося прочитати: у рядку 1 немає Transaction ID.',
    );
    expect(reasonOf(csv([leg({ 'Journal Type': 'REVERSAL' })]))).toMatch(
      /^Файл не вдалося прочитати: у рядку 1 \(транзакція .+\) тип «REVERSAL» — ні DEBIT, ні CREDIT\.$/,
    );
    expect(reasonOf(csv([leg({ Currency: 'uah' })]))).toMatch(/валюта «uah» — не код ISO 4217\.$/);
    expect(reasonOf(csv([leg({ 'Transaction Date': '2024-02-30T10:00' })]))).toMatch(
      /дата «2024-02-30T10:00» — такої дати немає\.$/,
    );
  });

  it('keeps the export order of transactions and of the legs within one', () => {
    const transactions = parsed(
      csv([
        leg({ 'Transaction ID': 'b', 'Transaction Date': '2026-01-02T10:00:00.000' }),
        leg({ 'Transaction ID': 'a', 'Transaction Date': '2026-01-01T10:00:00.000' }),
        leg({ 'Transaction ID': 'b', 'Journal Type': 'CREDIT', Account: 'Groceries' }),
      ]),
    );
    expect(transactions.map((t) => t.id)).toEqual(['b', 'a']);
    expect(transactions.map((t) => t.row)).toEqual([1, 2]);
    expect(transactions[0]?.legs.map((l) => l.row)).toEqual([1, 3]);
  });
});

describe('legEffect', () => {
  it('adds a debit to its own рахунок and takes a credit away', () => {
    const [debit, credit] = parsed(
      csv([
        leg({ 'Transaction ID': '1', 'Journal Type': 'DEBIT', Amount: '123.00' }),
        leg({ 'Transaction ID': '2', 'Journal Type': 'CREDIT', Amount: '123.00' }),
      ]),
    ).map((t) => t.legs[0]!);
    expect(legEffect(debit!)).toEqual({ amount: 12300, currency: 'UAH' });
    expect(legEffect(credit!)).toEqual({ amount: -12300, currency: 'UAH' });
  });
});

describe('isRealAccountType', () => {
  it('counts only the account types that hold the owner’s own money', () => {
    expect(['BANK_ACCOUNTS', 'CASH', 'OTHER_ASSETS'].map(isRealAccountType)).toEqual([
      true,
      true,
      true,
    ]);
    expect(
      ['EXPENSES', 'INCOME', 'EQUITY', 'MONEY_ON_THE_WAY', 'WHAT'].map(isRealAccountType),
    ).toEqual([false, false, false, false, false]);
  });
});
