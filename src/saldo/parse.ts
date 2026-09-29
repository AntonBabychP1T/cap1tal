import { MAX_AMOUNT_MINOR, money, type Money } from '../domain/money';
import { isoDate, type IsoDate } from '../domain/transaction';

/**
 * The Saldo export is a double-entry ledger: every transaction is a set of legs whose debits and
 * credits balance. This module is the boundary where its text stops being text — decimal amounts
 * become integer minor units and UTC datetimes become the phone's calendar dates, exactly as
 * `src/monobank/` turns JSON floats into integer millionths. Nothing downstream of `parseSaldoExport` ever sees a
 * decimal string, which is what `.claude/rules/domain.md` forbids inside `src/domain/**`.
 *
 * The parser is strict, not forgiving: a header that is not a Saldo export, or a row whose amount
 * is not a plain two-decimal number, rejects the whole file with a reason. An import that
 * silently skipped a row would produce a plan whose balances lie.
 */

/** The Saldo account types the export uses. Kept as text: an unknown one must not crash a parse. */
export const BANK_ACCOUNTS = 'BANK_ACCOUNTS';
export const CASH = 'CASH';
export const OTHER_ASSETS = 'OTHER_ASSETS';
export const EXPENSES = 'EXPENSES';
export const INCOME = 'INCOME';
export const EQUITY = 'EQUITY';
export const MONEY_ON_THE_WAY = 'MONEY_ON_THE_WAY';

/**
 * The account types that hold the owner's actual money — the ones that become рахунки. Everything
 * else is a counterparty of the double entry: a category, a source, the opening equity or the
 * in-transit holding bucket.
 */
export const REAL_ACCOUNT_TYPES: readonly string[] = [BANK_ACCOUNTS, CASH, OTHER_ASSETS];

export function isRealAccountType(accountType: string): boolean {
  return REAL_ACCOUNT_TYPES.includes(accountType);
}

export type JournalType = 'DEBIT' | 'CREDIT';

/** One row of the export, with its amount already an integer in minor units. */
export interface SaldoLeg {
  readonly transactionId: string;
  /** Normalised to `YYYY-MM-DDTHH:MM:SS.mmm`, so lexicographic order is chronological order. */
  readonly datetime: string;
  readonly date: IsoDate;
  readonly description: string;
  readonly parentAccount: string;
  readonly account: string;
  readonly accountType: string;
  readonly journalType: JournalType;
  readonly amount: Money;
  /** Raw text; Saldo writes a date, the spec speaks of a month. Compared by its first 7 chars. */
  readonly accrualMonth: string;
  /** 1-based position among the data rows — the export's own order, the tiebreak when sorting. */
  readonly row: number;
}

/** The rows sharing one Transaction ID: the legs of one double entry. */
export interface SaldoTransaction {
  readonly id: string;
  readonly datetime: string;
  readonly date: IsoDate;
  readonly description: string;
  readonly legs: readonly SaldoLeg[];
  /** The row of the first leg — where this transaction sits in the export's own order. */
  readonly row: number;
}

/**
 * What a leg does to its own рахунок: a debit adds, a credit takes away. The one place the
 * export's sign convention lives — the interpreter and the verification report must read it the
 * same way, or the report would happily agree with the wrong number.
 */
export function legEffect(leg: SaldoLeg): Money {
  return money(
    leg.journalType === 'DEBIT' ? leg.amount.amount : -leg.amount.amount,
    leg.amount.currency,
  );
}

/**
 * `reason` is the sentence the «Імпорт Saldo» screen shows as it stands, so it is written in
 * Ukrainian for the owner, in the tone `src/ui/backup-screen.ts` refuses a бекап in: what is wrong
 * with the file and, where it helps, what to do. It quotes the export's own column names and cell
 * text verbatim — those are what the owner will find when they open the file.
 */
export type ParseResult =
  | { readonly ok: true; readonly transactions: readonly SaldoTransaction[] }
  | { readonly ok: false; readonly reason: string };

/** A refusal of one row: which row, of which transaction when it has one, and what is wrong. */
function rowRefusal(rowNumber: number, transactionId: string, problem: string): ParseResult {
  const which = transactionId === '' ? '' : ` (транзакція ${transactionId})`;
  return {
    ok: false,
    reason: `Файл не вдалося прочитати: у рядку ${rowNumber}${which} ${problem}.`,
  };
}

/**
 * The columns the interpretation actually reads. A file missing any of them is not a Saldo
 * export we can reason about, and saying which one is missing is what makes the rejection useful.
 * "Archived", "Tags" and "Notes" are deliberately absent: they exist in the export and nothing
 * here depends on them.
 */
export const REQUIRED_COLUMNS: readonly string[] = [
  'Transaction ID',
  'Transaction Date',
  'Description',
  'Parent account',
  'Account',
  'Account Type',
  'Journal Type',
  'Amount',
  'Currency',
  'Accrual Month',
];

/** Exactly the shape the whole export has: digits, a dot, two digits. Anything else rejects. */
const AMOUNT = /^(\d+)\.(\d{2})$/;

/** A datetime with an optional time of day; Saldo writes seconds and millis, but not always. */
const DATETIME = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;

const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * RFC-4180 with the tolerances a real file needs: a leading BOM, CRLF or LF endings, quoted
 * fields holding commas, newlines and doubled quotes. No CSV library — the file is one known
 * shape of ~500 KB and a dependency here would buy nothing.
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  const endField = (): void => {
    row.push(field);
    field = '';
    started = false;
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && !started) {
      quoted = true;
      started = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\n') {
      endRow();
    } else if (char === '\r') {
      // A lone CR is a line ending too; a CRLF's LF closes the row on the next iteration.
      if (input[i + 1] !== '\n') {
        endRow();
      }
    } else {
      field += char;
      started = true;
    }
  }
  // A file that does not end in a newline still has its last row.
  if (row.length > 0 || field !== '' || started) {
    endRow();
  }
  return rows;
}

/**
 * Minor units from the decimal text alone: the whole part times a hundred plus the fraction, all
 * on integers read out of digit characters. No `parseFloat` ever touches an amount — every
 * currency in the export carries two decimals and the exponent comes from the text, not a table.
 *
 * `'too large'` is an amount above `MAX_AMOUNT_MINOR`, the ceiling every ingress keeps: one leg at
 * the edge of the safe-integer range is a valid `money` and breaks every sum it enters. The digits
 * are counted before `Number` sees them, so a whole part too long to read exactly is too large
 * rather than a float rounded to something else.
 */
function minorUnits(text: string): number | null | 'too large' {
  const match = AMOUNT.exec(text);
  if (!match) {
    return null;
  }
  const wholeDigits = (match[1] as string).replace(/^0+/, '');
  if (wholeDigits.length > String(MAX_AMOUNT_MINOR).length - 2) {
    return 'too large';
  }
  const total = Number(wholeDigits || '0') * 100 + Number(match[2]);
  return total > MAX_AMOUNT_MINOR ? 'too large' : total;
}

/**
 * The calendar date of an instant on this phone — `dateOfEpochMs` at runtime, a pinned zone in
 * tests. Passed in, as `src/monobank/api.ts` takes it, so a Saldo leg and a monobank item at the
 * same instant can never land on different days.
 */
export type DateOf = (epochMs: number) => IsoDate;

/**
 * Saldo writes Transaction Date as a UTC instant with no zone marker: a date-only entry for
 * 26 August is `2025-08-25T21:00`, Kyiv midnight. So `datetime` keeps the export's UTC text — an
 * ordering key, nothing more — and `date` is the phone's calendar date of that instant, never
 * the text's first ten characters, which is the owner's day minus one for every such entry.
 */
function normaliseDatetime(
  text: string,
  dateOf: DateOf,
): { datetime: string; date: IsoDate } | null {
  const match = DATETIME.exec(text);
  if (!match) {
    return null;
  }
  const [, day, hour = '00', minute = '00', second = '00', millis = '0'] = match;
  const paddedMillis = millis.padEnd(3, '0');
  let date: IsoDate;
  try {
    // The calendar check first: `Date.UTC` would roll 2024-02-30 over into March.
    const utcDay = isoDate(day as string);
    const [year, month, dayOfMonth] = utcDay.split('-').map(Number);
    date = dateOf(
      Date.UTC(
        year as number,
        (month as number) - 1,
        dayOfMonth as number,
        Number(hour),
        Number(minute),
        Number(second),
        Number(paddedMillis),
      ),
    );
  } catch {
    return null;
  }
  return {
    datetime: `${day}T${hour}:${minute}:${second}.${paddedMillis}`,
    date,
  };
}

/**
 * Export text → transactions, or a reason. The legs of one Transaction ID are gathered in the
 * order the file lists them, and the transactions themselves in the order their first leg
 * appears, so the export's own order survives into the plan (see the determinism requirement).
 */
export function parseSaldoExport(text: string, dateOf: DateOf): ParseResult {
  const rows = parseCsv(text).filter((row) => !(row.length === 1 && row[0] === ''));
  const header = rows[0];
  if (!header) {
    return { ok: false, reason: 'Файл порожній. Оберіть експорт Saldo.' };
  }
  const columnAt = new Map<string, number>();
  header.forEach((name, index) => {
    if (!columnAt.has(name)) {
      columnAt.set(name, index);
    }
  });
  const missing = REQUIRED_COLUMNS.filter((name) => !columnAt.has(name));
  if (missing.length > 0) {
    // «стовпця» for one, «стовпців» for several: the genitive of «бракує» declines with the count.
    const columns = missing.length === 1 ? 'стовпця' : 'стовпців';
    return {
      ok: false,
      reason:
        `Це не схоже на експорт Saldo: у заголовку бракує ${columns} ${missing.join(', ')}. ` +
        'Оберіть інший файл.',
    };
  }

  const at = (row: readonly string[], column: string): string =>
    row[columnAt.get(column) as number] ?? '';

  const byTransaction = new Map<string, SaldoLeg[]>();
  const order: string[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i] as string[];
    const rowNumber = i;
    const transactionId = at(cells, 'Transaction ID');
    if (transactionId === '') {
      return rowRefusal(rowNumber, '', 'немає Transaction ID');
    }
    const journalType = at(cells, 'Journal Type');
    if (journalType !== 'DEBIT' && journalType !== 'CREDIT') {
      return rowRefusal(rowNumber, transactionId, `тип «${journalType}» — ні DEBIT, ні CREDIT`);
    }
    const amountText = at(cells, 'Amount');
    const amount = minorUnits(amountText);
    if (amount === null) {
      return rowRefusal(
        rowNumber,
        transactionId,
        `сума «${amountText}» — не число з двома знаками після крапки`,
      );
    }
    if (amount === 'too large') {
      return rowRefusal(
        rowNumber,
        transactionId,
        `сума «${amountText}» більша за найбільшу, яку приймає застосунок (999 999 999,99)`,
      );
    }
    const currency = at(cells, 'Currency');
    if (!CURRENCY_CODE.test(currency)) {
      return rowRefusal(rowNumber, transactionId, `валюта «${currency}» — не код ISO 4217`);
    }
    const datetimeText = at(cells, 'Transaction Date');
    const when = normaliseDatetime(datetimeText, dateOf);
    if (!when) {
      return rowRefusal(rowNumber, transactionId, `дата «${datetimeText}» — такої дати немає`);
    }

    const leg: SaldoLeg = {
      transactionId,
      datetime: when.datetime,
      date: when.date,
      description: at(cells, 'Description'),
      parentAccount: at(cells, 'Parent account'),
      account: at(cells, 'Account'),
      accountType: at(cells, 'Account Type'),
      journalType,
      amount: money(amount, currency),
      accrualMonth: at(cells, 'Accrual Month'),
      row: rowNumber,
    };

    const legs = byTransaction.get(transactionId);
    if (legs) {
      legs.push(leg);
    } else {
      byTransaction.set(transactionId, [leg]);
      order.push(transactionId);
    }
  }

  const transactions = order.map((id) => {
    const legs = byTransaction.get(id) as SaldoLeg[];
    const first = legs[0] as SaldoLeg;
    return {
      id,
      datetime: first.datetime,
      date: first.date,
      description: first.description,
      legs,
      row: first.row,
    };
  });
  return { ok: true, transactions };
}
