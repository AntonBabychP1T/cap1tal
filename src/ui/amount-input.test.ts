import { describe, expect, it } from 'vitest';

import { MAX_AMOUNT_MINOR, money } from '../domain/money';
import {
  formatMinorUnits,
  formatMinorUnitsGrouped,
  formatMoney,
  splitMoney,
  formatSignedMoney,
  parseActualBalance,
  parseAmount,
  parseCurrentValue,
  parseOpeningBalance,
} from './amount-input';

describe('parseAmount', () => {
  it('Scenario: Typed amount becomes exact minor units', () => {
    expect(parseAmount('125.50', 'UAH')).toEqual(money(12550, 'UAH'));
    // The Ukrainian decimal separator means the same amount.
    expect(parseAmount('125,50', 'UAH')).toEqual(money(12550, 'UAH'));
  });

  it('Scenario: A whole amount needs no fractional part', () => {
    expect(parseAmount('200', 'UAH')).toEqual(money(20000, 'UAH'));
    // A single fractional digit is tenths, not hundredths.
    expect(parseAmount('200.5', 'UAH')).toEqual(money(20050, 'UAH'));
  });

  it('Scenario: Too many fractional digits are rejected', () => {
    expect(() => parseAmount('12.345', 'UAH')).toThrow();
  });

  it('Scenario: A non-positive amount is rejected', () => {
    // Zero is refused in the same words as a negative сума (main-screen, "A сума the owner left
    // empty or not positive is refused by what is wrong"), however the zero is typed.
    for (const typed of ['0', '0.00', '0,00', '000', ',0']) {
      expect(refusalOf(() => parseAmount(typed, 'UAH')), `"${typed}"`).toBe(
        'Сума має бути більшою за нуль',
      );
    }
    // A negative сума is named as negative, not as something that is not a number.
    expect(refusalOf(() => parseAmount('-5', 'UAH'))).toBe('Сума має бути більшою за нуль');
  });

  it('What is not a number is not an amount', () => {
    // '' and ' ' are not here: an empty сума is asked for, not refused as a non-number.
    for (const typed of ['abc', '12.', '1.2.3', '12,', '.', ',', '1 00', '10 00', '1  000', ' 000']) {
      expect(() => parseAmount(typed, 'UAH'), `"${typed}" was accepted`).toThrow();
    }
  });

  it('Scenario: An empty сума asks for one', () => {
    for (const typed of ['', ' ']) {
      expect(refusalOf(() => parseAmount(typed, 'UAH')), `"${typed}"`).toBe('Напишіть суму');
    }
  });

  it('Scenario: A negative сума is named as such', () => {
    for (const typed of ['-50', ' -50', '-abc']) {
      expect(refusalOf(() => parseAmount(typed, 'UAH')), `"${typed}"`).toBe(
        'Сума має бути більшою за нуль',
      );
    }
  });

  it('The amount lands in the account currency it was typed for', () => {
    expect(parseAmount('5.00', 'USD')).toEqual(money(500, 'USD'));
    expect(parseAmount('10.00', 'EUR')).toEqual(money(1000, 'EUR'));
  });

  it('Large amounts stay exact — no float ever touches them', () => {
    expect(parseAmount('99999999.99', 'UAH')).toEqual(money(9999999999, 'UAH'));
    expect(parseAmount('999999999,99', 'UAH')).toEqual(money(MAX_AMOUNT_MINOR, 'UAH'));
  });

  it('A fraction with no whole part is a fraction of one', () => {
    expect(parseAmount('.5', 'UAH')).toEqual(money(50, 'UAH'));
    expect(parseAmount(',5', 'UAH')).toEqual(money(50, 'UAH'));
    expect(parseAmount(',05', 'UAH')).toEqual(money(5, 'UAH'));
  });

  it('Thousands may be grouped with a space, the way Ukrainian writes them', () => {
    // A plain space, the no-break space the app itself prints, and the narrow no-break space
    // a pasted number may carry.
    expect(parseAmount('1 000', 'UAH')).toEqual(money(100000, 'UAH'));
    expect(parseAmount('1 000,50', 'UAH')).toEqual(money(100050, 'UAH'));
    expect(parseAmount('1\u00A0000,50', 'UAH')).toEqual(money(100050, 'UAH'));
    expect(parseAmount('12\u202F345\u202F678.9', 'UAH')).toEqual(money(1234567890, 'UAH'));
    // What the app displays is what it takes back.
    expect(parseAmount(formatMinorUnitsGrouped(120425990), 'UAH')).toEqual(money(120425990, 'UAH'));
  });
});

describe('parseAmount — the ceiling', () => {
  it('A сума above the ceiling is refused in Ukrainian', () => {
    // 90071992547409,91 is Number.MAX_SAFE_INTEGER kopiykas: it used to be stored, and every sum
    // over it then broke Головний for good.
    for (const typed of ['1000000000', '999999999,991', '90071992547409,91', '1 000 000 000,00']) {
      const refusal = refusalOf(() => parseAmount(typed, 'UAH'));
      expect(refusal, `"${typed}"`).toMatch(/^(сума завелика|у сумі в UAH)/);
    }
    expect(refusalOf(() => parseAmount('1000000000', 'UAH'))).toBe(
      'сума завелика: щонайбільше 999\u00A0999\u00A0999,99, а не «1000000000»',
    );
  });

  it('A сума too long for a number is refused in Ukrainian, not in the domain\'s English', () => {
    const refusal = refusalOf(() => parseAmount('99999999999999999999', 'UAH'));
    expect(refusal).toBe(
      'сума завелика: щонайбільше 999\u00A0999\u00A0999,99, а не «99999999999999999999»',
    );
    // Leading zeros are not size: this is 5,00.
    expect(parseAmount('00000000000000000000005', 'UAH')).toEqual(money(500, 'UAH'));
  });

  it('Every parser that takes a сума keeps to the ceiling, below zero as well', () => {
    for (const parse of [parseAmount, parseOpeningBalance, parseActualBalance, parseCurrentValue]) {
      expect(parse('999999999,99', 'UAH')).toEqual(money(MAX_AMOUNT_MINOR, 'UAH'));
      expect(() => parse('1000000000', 'UAH')).toThrow(/сума завелика/);
      expect(() => parse('99999999999999999999', 'UAH')).toThrow(/сума завелика/);
    }
    for (const parse of [parseOpeningBalance, parseActualBalance]) {
      expect(parse('-999999999,99', 'UAH')).toEqual(money(-MAX_AMOUNT_MINOR, 'UAH'));
      expect(refusalOf(() => parse('-1000000000', 'UAH'))).toBe(
        'сума завелика: щонайбільше 999\u00A0999\u00A0999,99, а не «-1000000000»',
      );
      expect(() => parse('-99999999999999999999', 'UAH')).toThrow(/сума завелика/);
    }
  });
});

/**
 * What was refused, as the owner reads it: `failureMessage` puts exactly this string into an
 * Alert. The currency codes are set aside before the "no English" check — an ISO-4217 code is
 * not a word of any language, and «сума в UAH» is what the owner's own screens already say.
 */
const refusalOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('nothing was refused');
};

const withoutCurrencyCodes = (message: string) => message.replace(/UAH|EUR|USD/g, '');

describe('parseAmount — the refusal is in the owner\'s language', () => {
  it('Scenario: A сума that is not a number is refused in Ukrainian', () => {
    // «12 000» itself is a сума now — a thousands group — so the refusal is shown on a space that
    // groups nothing.
    const refusal = refusalOf(() => parseAmount('12 00', 'UAH'));
    expect(refusal).toBe('«12 00» — це не сума; напишіть число, напр. 125,50');
    expect(withoutCurrencyCodes(refusal)).not.toMatch(/[A-Za-z]/);
  });

  it('Scenario: Too many fractional digits are refused in Ukrainian', () => {
    const refusal = refusalOf(() => parseAmount('12,345', 'UAH'));
    expect(refusal).toBe('у сумі в UAH щонайбільше 2 цифри після коми, а «12,345» має 3');
    expect(withoutCurrencyCodes(refusal)).not.toMatch(/[A-Za-z]/);
  });

  it('Scenario: A ліміт that is not positive is refused in Ukrainian', () => {
    // The сума the smoke found: "0" typed as a ліміт used to answer `an amount is positive, got "0"`.
    const refusal = refusalOf(() => parseAmount('0', 'UAH'));
    // The same words the entry form's zero refusal reads — one sentence for every typed сума.
    expect(refusal).toBe('Сума має бути більшою за нуль');
    expect(withoutCurrencyCodes(refusal)).not.toMatch(/[A-Za-z]/);
  });

  it('Every refusal of a typed сума is in Ukrainian, whatever was typed', () => {
    for (const typed of ['', ' ', 'abc', '12.', '1.2.3', '1 00', '12,', ',', '0', '0,00', '-5', '1000000000']) {
      const refusal = withoutCurrencyCodes(refusalOf(() => parseAmount(typed, 'EUR')));
      // The typed text is quoted back, so its own letters are stripped before the check.
      expect(refusal.replace(typed, ''), `"${typed}" was refused in English`).not.toMatch(
        /[A-Za-z]/,
      );
    }
  });

  it('An opening balance inherits those refusals unchanged', () => {
    expect(refusalOf(() => parseOpeningBalance('12.345', 'UAH'))).toBe(
      'у сумі в UAH щонайбільше 2 цифри після коми, а «12.345» має 3',
    );
    expect(refusalOf(() => parseOpeningBalance('abc', 'UAH'))).toBe(
      '«abc» — це не сума; напишіть число, напр. 125,50',
    );
  });

  it('A signed field quotes exactly what the owner typed, sign and all', () => {
    // The sign used to be sliced off first, so «--5» was refused as «-5».
    for (const parse of [parseOpeningBalance, parseActualBalance]) {
      expect(refusalOf(() => parse('--5', 'UAH'))).toBe(
        '«--5» — це не сума; напишіть число, напр. 125,50',
      );
      expect(refusalOf(() => parse('-12,345', 'UAH'))).toBe(
        'у сумі в UAH щонайбільше 2 цифри після коми, а «-12,345» має 3',
      );
      expect(refusalOf(() => parse('-', 'UAH'))).toBe(
        '«-» — це не сума; напишіть число, напр. 125,50',
      );
    }
  });
});

describe('formatMoney', () => {
  it('Minor units are shown as major units with their currency', () => {
    expect(formatMoney(money(12550, 'UAH'))).toBe('125,50 UAH');
    expect(formatMoney(money(500, 'USD'))).toBe('5,00 USD');
    expect(formatMoney(money(0, 'UAH'))).toBe('0,00 UAH');
    expect(formatMoney(money(7, 'UAH'))).toBe('0,07 UAH');
  });

  it('A negative balance keeps its sign', () => {
    expect(formatMoney(money(-3000, 'UAH'))).toBe('−30,00 UAH');
  });

  it('What was typed comes back unchanged', () => {
    expect(formatMoney(parseAmount('125,50', 'UAH'))).toBe('125,50 UAH');
  });
});

describe('parseOpeningBalance', () => {
  it('An omitted opening balance is zero in the account currency', () => {
    expect(parseOpeningBalance('', 'UAH')).toEqual(money(0, 'UAH'));
    expect(parseOpeningBalance('   ', 'USD')).toEqual(money(0, 'USD'));
  });

  it('An opening balance may be zero, unlike a transaction amount', () => {
    expect(parseOpeningBalance('0', 'UAH')).toEqual(money(0, 'UAH'));
    expect(parseOpeningBalance('0,00', 'UAH')).toEqual(money(0, 'UAH'));
    expect(parseOpeningBalance('-0,00', 'UAH')).toEqual(money(0, 'UAH'));
    expect(parseOpeningBalance(',00', 'UAH')).toEqual(money(0, 'UAH'));
    expect(parseOpeningBalance('-.0', 'UAH')).toEqual(money(0, 'UAH'));
  });

  it('A signed balance takes the same fractions and thousands groups', () => {
    expect(parseOpeningBalance('-,5', 'UAH')).toEqual(money(-50, 'UAH'));
    expect(parseOpeningBalance('-1 250,75', 'UAH')).toEqual(money(-125075, 'UAH'));
  });

  it('An opening balance may be negative — a card can be in overdraft', () => {
    expect(parseOpeningBalance('-1250,75', 'UAH')).toEqual(money(-125075, 'UAH'));
    expect(parseOpeningBalance('-5', 'USD')).toEqual(money(-500, 'USD'));
  });

  it('The digits obey the same rules as any other amount', () => {
    expect(parseOpeningBalance('1000,50', 'UAH')).toEqual(money(100050, 'UAH'));
    expect(() => parseOpeningBalance('12.345', 'UAH')).toThrow();
    expect(() => parseOpeningBalance('-12.345', 'UAH')).toThrow();
    expect(() => parseOpeningBalance('abc', 'UAH')).toThrow();
  });
});

describe('formatMinorUnits', () => {
  it('Round-trips through the opening-balance field', () => {
    for (const amount of [0, 7, 12550, -125075, 9999999999]) {
      expect(parseOpeningBalance(formatMinorUnits(amount), 'UAH')).toEqual(money(amount, 'UAH'));
    }
  });

  it('Carries no currency code, unlike formatMoney', () => {
    expect(formatMinorUnits(12550)).toBe('125,50');
    expect(formatMoney(money(12550, 'UAH'))).toBe('125,50 UAH');
  });
});

describe('parseActualBalance', () => {
  it('Scenario: A rejected entry writes nothing', () => {
    // Neither reaches `reconcile`, so no коригування can be built from either.
    expect(() => parseActualBalance('', 'UAH')).toThrow(/фактичний залишок/);
    expect(() => parseActualBalance('   ', 'UAH')).toThrow(/фактичний залишок/);
    expect(() => parseActualBalance('abc', 'UAH')).toThrow(/це не сума/);
  });

  it('A recount may be zero — a рахунок can be empty', () => {
    expect(parseActualBalance('0', 'UAH')).toEqual(money(0, 'UAH'));
    expect(parseActualBalance('0,00', 'UAH')).toEqual(money(0, 'UAH'));
  });

  it('A recount may be negative — a card can be in overdraft', () => {
    expect(parseActualBalance('-1250,75', 'UAH')).toEqual(money(-125075, 'UAH'));
  });

  it('The digits obey the same rules as any other amount', () => {
    expect(parseActualBalance('450,00', 'UAH')).toEqual(money(45000, 'UAH'));
    expect(parseActualBalance('450.00', 'UAH')).toEqual(money(45000, 'UAH'));
    expect(() => parseActualBalance('12.345', 'UAH')).toThrow();
  });

  it('Unlike an opening balance, an untouched field is not a recount to zero', () => {
    expect(parseOpeningBalance('', 'UAH')).toEqual(money(0, 'UAH'));
    expect(() => parseActualBalance('', 'UAH')).toThrow();
  });
});

describe('formatSignedMoney', () => {
  it('A difference says which way it goes', () => {
    expect(formatSignedMoney(money(3000, 'UAH'))).toBe('+30,00 UAH');
    expect(formatSignedMoney(money(-2000, 'UAH'))).toBe('−20,00 UAH');
  });

  it('Zero carries no sign', () => {
    expect(formatSignedMoney(money(0, 'UAH'))).toBe('0,00 UAH');
  });
});

describe('parseCurrentValue', () => {
  it('Scenario: A negative вартість is rejected, zero is not', () => {
    // An інвестиція can be worth nothing, never less than nothing.
    expect(() => parseCurrentValue('-100', 'UAH')).toThrow(/менш/);
    expect(() => parseCurrentValue('-0,01', 'UAH')).toThrow(/менш/);
    // The minus the app itself prints, not only the one on the keyboard.
    expect(() => parseCurrentValue('\u2212100', 'UAH')).toThrow(/менш/);

    expect(parseCurrentValue('0', 'UAH')).toEqual(money(0, 'UAH'));
    expect(parseCurrentValue('0,00', 'UAH')).toEqual(money(0, 'UAH'));
  });

  it('A вартість is the digits the owner typed, comma or dot', () => {
    expect(parseCurrentValue('5600', 'UAH')).toEqual(money(560000, 'UAH'));
    expect(parseCurrentValue('5600,50', 'UAH')).toEqual(money(560050, 'UAH'));
    expect(parseCurrentValue('5600.50', 'USD')).toEqual(money(560050, 'USD'));
  });

  it('An untouched field is not «it is worth nothing»', () => {
    expect(() => parseCurrentValue('', 'UAH')).toThrow(/напишіть/);
    expect(() => parseCurrentValue('   ', 'UAH')).toThrow(/напишіть/);
  });

  it("What is not a number is refused in the owner's own words", () => {
    expect(() => parseCurrentValue('десь тисяч п`ять', 'UAH')).toThrow(/це не сума/);
    expect(() => parseCurrentValue('5600,505', 'UAH')).toThrow(/після коми/);
  });
});

describe('splitMoney', () => {
  it('A six-digit month fits — the number and its currency apart', () => {
    expect(splitMoney(money(6868249, 'UAH'))).toEqual({ number: '68\u00A0682,49', currency: 'UAH' });
  });

  it('Joined back it is exactly formatMoney, negative and zero included', () => {
    for (const m of [money(-98231, 'UAH'), money(0, 'USD'), money(824, 'USD'), money(12042599, 'EUR')]) {
      const { number, currency } = splitMoney(m);
      expect(`${number} ${currency}`).toBe(formatMoney(m));
    }
  });
});
