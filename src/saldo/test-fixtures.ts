import { parseSaldoExport, type SaldoTransaction } from './parse';
import { interpret, type ImportPlan } from './interpret';
import { survey, type Decisions, type ExistingState } from './survey';

/**
 * Synthetic export fixtures, shaped exactly like the real file — every field quoted, LF endings,
 * the same column order. The owner's actual export is gitignored personal data and is exercised
 * only by `scripts/saldo-dry-run.ts`; committed tests can never depend on it. Lives outside
 * `*.test.ts` for the same reason `src/db/test-db.ts` does: it is a helper, not a suite.
 */

export const SALDO_COLUMNS: readonly string[] = [
  'Transaction ID',
  'Transaction Date',
  'Description',
  'Parent account',
  'Account',
  'Account Type',
  'Archived',
  'Journal Type',
  'Amount',
  'Currency',
  'Tags',
  'Accrual Month',
  'Notes',
];

export type FixtureRow = Partial<Record<string, string>>;

const quote = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export function csv(
  rows: readonly FixtureRow[],
  columns: readonly string[] = SALDO_COLUMNS,
): string {
  return [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ''))]
    .map((cells) => cells.map(quote).join(','))
    .join('\n');
}

/**
 * A leg with the export's defaults filled in, so each test states only what it is about. The
 * Accrual Month follows the row's own date unless a test sets it — that is how all but three rows
 * of the real export look, and a fixture that diverged by accident would report a divergence.
 */
export function leg(row: FixtureRow): FixtureRow {
  const built: FixtureRow = {
    'Transaction ID': '41596243',
    'Transaction Date': '2024-10-27T13:55:31.129',
    Description: '',
    'Parent account': '',
    Account: 'mono black',
    'Account Type': 'BANK_ACCOUNTS',
    Archived: '0',
    'Journal Type': 'DEBIT',
    Amount: '123.00',
    Currency: 'UAH',
    Tags: '',
    Notes: '',
    ...row,
  };
  return {
    ...built,
    'Accrual Month': row['Accrual Month'] ?? (built['Transaction Date'] ?? '').slice(0, 10),
  };
}

/** The two legs of one ordinary transaction: money leaves `account`, a counterparty receives it. */
export function pair(input: {
  id: string;
  datetime?: string;
  description?: string;
  /** The real account and what happens to it. */
  account: string;
  accountType?: string;
  journalType: 'DEBIT' | 'CREDIT';
  amount: string;
  currency?: string;
  /** The counterparty leg — a category, a source, equity or the in-transit bucket. */
  other: string;
  otherType: string;
  otherParent?: string;
  otherAmount?: string;
  otherCurrency?: string;
  accrualMonth?: string;
}): FixtureRow[] {
  const opposite = input.journalType === 'DEBIT' ? 'CREDIT' : 'DEBIT';
  const common = {
    'Transaction ID': input.id,
    ...(input.datetime ? { 'Transaction Date': input.datetime } : {}),
    Description: input.description ?? '',
    ...(input.accrualMonth ? { 'Accrual Month': input.accrualMonth } : {}),
  };
  return [
    leg({
      ...common,
      Account: input.account,
      'Account Type': input.accountType ?? 'BANK_ACCOUNTS',
      'Journal Type': input.journalType,
      Amount: input.amount,
      Currency: input.currency ?? 'UAH',
    }),
    leg({
      ...common,
      Account: input.other,
      'Parent account': input.otherParent ?? '',
      'Account Type': input.otherType,
      'Journal Type': opposite,
      Amount: input.otherAmount ?? input.amount,
      Currency: input.otherCurrency ?? input.currency ?? 'UAH',
    }),
  ];
}

/** Parse fixture rows, or fail loudly with the reason — a fixture is never allowed to be wrong. */
export function parseRows(rows: readonly FixtureRow[]): readonly SaldoTransaction[] {
  const result = parseSaldoExport(csv(rows));
  if (!result.ok) {
    throw new Error(`the fixture does not parse: ${result.reason}`);
  }
  return result.transactions;
}

/** The whole engine over fixture rows: parse then survey then interpret. */
export function planFrom(
  rows: readonly FixtureRow[],
  options: { decisions?: Decisions; existing?: ExistingState } = {},
): ImportPlan {
  const transactions = parseRows(rows);
  return interpret({
    transactions,
    survey: survey(transactions, options.existing),
    ...options,
  });
}

/** An existing рахунок in the shape the engine takes them in. */
export function existingAccount(input: {
  id: string;
  name: string;
  currency?: string;
  kind?: 'spending' | 'savings' | 'investment' | 'cash' | 'debt';
  openingAmount?: number;
}) {
  const currency = input.currency ?? 'UAH';
  return {
    id: input.id,
    name: input.name,
    kind: input.kind ?? ('spending' as const),
    currency,
    openingBalance: { amount: input.openingAmount ?? 0, currency },
    archived: false,
  };
}

/** The app's current state with everything defaulted to empty. */
export function existingState(state: Partial<ExistingState> = {}): ExistingState {
  return { accounts: [], categories: [], sources: [], transactions: [], ...state };
}
