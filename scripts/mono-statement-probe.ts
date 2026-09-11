/**
 * Why one рахунок's statement comes back 200 and the app still calls it `unavailable`.
 *
 *   MONOBANK_TOKEN=… npx tsx scripts/mono-statement-probe.ts            # list the accounts
 *   MONOBANK_TOKEN=… npx tsx scripts/mono-statement-probe.ts 6628 14    # that card, last 14 days
 *
 * Run by hand, by the owner, never by `verify` and never by an agent — like `mono-dry-run.ts`, and
 * for the same reasons: `verify` stays Node-only and never needs a token.
 *
 * This prints **shapes and derived facts, never сума**. For every statement row it reports the
 * field names present, their `typeof`, and whether each field the parser insists on passes. Beside
 * a row the parser refuses it also prints four derived facts: the row's date, its `mcc` and
 * `originalMcc`, its `hold`, and the *ratio* of its two сума fields — never either сума itself.
 * No сума, no description, no item id, no account id and no token is ever printed: a field name, a
 * currency code, an MCC and a ratio are not the owner's money, and that is what it takes to name a
 * row the parser refuses without quoting what the owner spent.
 *
 * The account is chosen by a piece of its name — client-info returns them in no fixed order — so
 * the owner never has to paste an id.
 */
import type { IsoDate } from '../src/domain/transaction';
import {
  CURRENCY_BY_NUMERIC,
  fetchClientInfo,
  parseStatement,
  statementUnavailableReason,
  type AuthFetchLike,
  type MonobankAccount,
  type StatementContext,
} from '../src/monobank/api';
import { todayIso } from '../src/ui/dates';

/** How far back a probe looks when the owner names no number of days. */
const DEFAULT_DAYS = 14;

const authFetch: AuthFetchLike = (url, headers) => fetch(url, { headers });

/**
 * A *hint* at which field of a rejected row looks wrong, never the verdict — the verdict comes from
 * `parseStatement` and `statementUnavailableReason` themselves, so this script can never disagree
 * with the app about whether a window reads. Kept because "unreadable-payload" alone does not say
 * which field, and that is the question this probe exists to answer.
 */
const LIKELY: readonly {
  readonly field: string;
  readonly holds: (value: unknown) => boolean;
  readonly wants: string;
}[] = [
  { field: 'id', holds: (v) => typeof v === 'string' && v !== '', wants: 'non-empty string' },
  { field: 'time', holds: (v) => typeof v === 'number' && Number.isSafeInteger(v), wants: 'safe integer' },
  { field: 'mcc', holds: (v) => typeof v === 'number' && Number.isSafeInteger(v), wants: 'safe integer' },
  { field: 'amount', holds: (v) => typeof v === 'number' && Number.isSafeInteger(v), wants: 'safe integer' },
  { field: 'description', holds: (v) => typeof v === 'string', wants: 'string' },
  { field: 'hold', holds: (v) => typeof v === 'boolean', wants: 'boolean' },
];

function shapeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function accountLine(index: number, account: MonobankAccount): string {
  const what = account.kind === 'jar' ? 'банка ' : 'картка';
  return `  ${String(index + 1).padStart(2)}. ${what} ${account.currency}  ${account.name}`;
}

async function main(): Promise<void> {
  const token = process.env.MONOBANK_TOKEN;
  if (!token) {
    console.error('usage: MONOBANK_TOKEN=… npx tsx scripts/mono-statement-probe.ts [частина назви] [днів]');
    process.exit(2);
  }

  const info = await fetchClientInfo(authFetch, token);
  if (info.kind !== 'ok') {
    console.error(`client-info: ${info.kind}`);
    process.exit(1);
  }
  const accounts = info.value;

  // Chosen by a piece of the рахунок's name, never by its position: client-info returns the
  // accounts in no fixed order, so the third row of one answer is not the third row of the next.
  const wanted = process.argv[2]?.toLowerCase();
  const matches = wanted ? accounts.filter((a) => a.name.toLowerCase().includes(wanted)) : [];
  if (matches.length !== 1) {
    if (wanted) {
      console.log(
        matches.length === 0
          ? `no рахунок's name holds "${wanted}"`
          : `"${wanted}" names ${matches.length} рахунки — say more of the name`,
      );
    }
    console.log(`monobank accounts (${accounts.length}) — run again with a piece of one's name:`);
    accounts.forEach((a, i) => console.log(accountLine(i, a)));
    console.log('');
    console.log('  MONOBANK_TOKEN=… npx tsx scripts/mono-statement-probe.ts 6628 14');
    return;
  }
  const account = matches[0]!;
  const days = Number.isInteger(Number(process.argv[3])) ? Number(process.argv[3]) : DEFAULT_DAYS;

  // The raw payload, deliberately outside `fetchStatement`: the whole point is to see what the
  // parser was handed, not what it made of it.
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 24 * 60 * 60;
  const url = `https://api.monobank.ua/personal/statement/${encodeURIComponent(account.id)}/${from}/${to}`;

  console.log(`probing ${account.kind === 'jar' ? 'банка' : 'картка'} ${account.currency} ${account.name}, last ${days} days`);
  const response = await authFetch(url, { 'X-Token': token });
  console.log(`  HTTP ${response.status}`);
  if (!response.ok) {
    console.error('  the bank refused the request — nothing to probe');
    process.exit(1);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    console.error('  the body is not JSON at all → unparseable-body');
    process.exit(1);
  }
  if (!Array.isArray(payload)) {
    console.error(`  the body is ${shapeOf(payload)}, not a list → unreadable-payload`);
    if (payload && typeof payload === 'object') {
      console.error(`  its keys: ${Object.keys(payload).join(', ')}`);
    }
    process.exit(1);
  }

  console.log(`  rows: ${payload.length}`);
  const keys = new Set<string>();
  for (const row of payload) {
    if (row && typeof row === 'object') for (const k of Object.keys(row)) keys.add(k);
  }
  console.log(`  fields seen across all rows: ${[...keys].sort().join(', ')}`);

  // The line this probe was written for: which `currencyCode` values the bank actually puts on this
  // рахунок's rows, and how many rows carry each. A number and a count are not the owner's money.
  // This is information, never a verdict — it is what showed that the field names the currency of
  // the транзакція and not of the рахунок, which is why the parser stopped reading it.
  const byCurrency = new Map<string, number>();
  for (const row of payload) {
    const numeric = row && typeof row === 'object' ? (row as Record<string, unknown>).currencyCode : undefined;
    const key = typeof numeric === 'number' ? String(numeric) : `(${shapeOf(numeric)})`;
    byCurrency.set(key, (byCurrency.get(key) ?? 0) + 1);
  }
  const histogram = [...byCurrency.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => {
      const reads = CURRENCY_BY_NUMERIC[Number(code)] ?? 'not a currency the app offers';
      return `${code} (${reads}) ×${count}`;
    })
    .join(', ');
  console.log(`  currencyCode across the rows: ${histogram}`);
  console.log(
    `  the рахунок itself is ${account.currency} → any other code is a транзакція the bank carried out in that currency, and reads fine`,
  );
  console.log('');

  let bad = 0;
  let shown = 0;
  payload.forEach((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      console.log(`  row ${index}: not an object (${shapeOf(row)}) → unreadable-payload`);
      bad += 1;
      return;
    }
    const record = row as Record<string, unknown>;
    const failures = LIKELY.filter((check) => !check.holds(record[check.field])).map(
      (check) => `${check.field} is ${shapeOf(record[check.field])}, wanted ${check.wants}`,
    );
    if (failures.length > 0) {
      bad += 1;
      // Enough rows to see the pattern, not enough to scroll the shape off the screen.
      if (shown < 10) {
        shown += 1;
        const when =
          typeof record.time === 'number' ? new Date(record.time * 1000).toISOString().slice(0, 10) : '?';
        console.log(`  row ${index} (${when}): ${failures.join('; ')}`);
      }
    }
  });
  if (bad > shown) {
    console.log(`  … and ${bad - shown} more rows like these`);
  }

  // The question a row naming another currency raises and nothing else answers: is its `amount` in the
  // рахунок's currency after all (the bank merely labelling the row with the *operation's*
  // currency, against its own documentation), or is the row really denominated in that other
  // currency? Two derived facts settle it and neither is the owner's money: the ratio of `amount`
  // to `operationAmount` — 1.00 means the two are the same сума, anything near a market rate means
  // `amount` is the рахунок's currency — and whether the row's running `balance` sits inside the
  // range the рахунок's own rows trace.
  const ownCurrencyRows = payload.filter((row): row is Record<string, unknown> => {
    if (!row || typeof row !== 'object') return false;
    const numeric = (row as Record<string, unknown>).currencyCode;
    return typeof numeric === 'number' && CURRENCY_BY_NUMERIC[numeric] === account.currency;
  });
  const balances = ownCurrencyRows
    .map((row) => row.balance)
    .filter((b): b is number => typeof b === 'number');
  const low = Math.min(...balances);
  const high = Math.max(...balances);
  const otherCurrencyRows = payload.filter((row): row is Record<string, unknown> => {
    if (!row || typeof row !== 'object') return false;
    const numeric = (row as Record<string, unknown>).currencyCode;
    return typeof numeric !== 'number' || CURRENCY_BY_NUMERIC[numeric] !== account.currency;
  });
  if (otherCurrencyRows.length > 0 && balances.length > 0) {
    console.log('');
    console.log(`  what the rows naming another currency look like (the рахунок's own rows trace one balance range):`);
    for (const row of otherCurrencyRows.slice(0, 10)) {
      const amount = row.amount;
      const operation = row.operationAmount;
      const ratio =
        typeof amount === 'number' && typeof operation === 'number' && operation !== 0
          ? (amount / operation).toFixed(2)
          : '?';
      const balance = row.balance;
      const inRange =
        typeof balance === 'number'
          ? balance >= low && balance <= high
            ? 'inside it'
            : 'outside it'
          : 'no balance';
      console.log(
        `    amount / operationAmount = ${ratio}; balance is ${inRange}; mcc ${String(row.mcc)}, originalMcc ${String(row.originalMcc)}, hold ${String(row.hold)}`,
      );
    }
    console.log(
      `    a ratio of 1.00 means amount is in that other currency; a ratio near a market rate means amount is already ${account.currency}`,
    );
  }

  // The verdict, taken from the app's own parser rather than from anything above it: whatever this
  // says is exactly what the рахунок's next turn will do with this window.
  const context: StatementContext = {
    currency: account.currency,
    dateOf: (unixSeconds: number): IsoDate => todayIso(new Date(unixSeconds * 1000)),
  };
  const parsed = parseStatement(payload, context);
  console.log('');
  console.log(
    parsed
      ? `  the app reads this window whole: ${parsed.length} items would import`
      : `  the app refuses this window → unavailable, reason ${statementUnavailableReason(payload, context)}` +
        `${bad > 0 ? ` (the rows above are the likely cause)` : ''}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
