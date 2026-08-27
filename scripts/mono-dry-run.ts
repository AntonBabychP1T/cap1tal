/**
 * The monobank engine over the owner's real token, printed and thrown away.
 *
 *   MONOBANK_TOKEN=… npx tsx scripts/mono-dry-run.ts
 *
 * Run by hand, by the owner, never by `verify` and never by an agent — `verify` must stay
 * Node-only, under a minute and reproducible on any machine, and it must never need a token.
 * Nothing is written anywhere: this prints the parsed accounts with the raw balance, the credit
 * limit and the derived баланс банку side by side (so they can be eyeballed against the mono app),
 * then one recent statement window of the first account and the транзакції it maps to.
 *
 * The token is read from the environment and from nowhere else — no `.env` file exists in this
 * repo and none is introduced here — and it is printed nowhere. The rule set is empty on purpose:
 * that is the worst case, every витрата landing in «Без категорії», and it is the shape of the
 * mapping that this run is meant to show.
 */
import type { IsoDate } from '../src/domain/transaction';
import {
  fetchClientInfo,
  fetchStatement,
  type AuthFetchLike,
  type Outcome,
} from '../src/monobank/api';
import { suggestKind } from '../src/monobank/link';
import { mapStatement, planWindows } from '../src/monobank/sync';
import { formatMoney } from '../src/ui/amount-input';
import { todayIso } from '../src/ui/dates';
import { newId } from '../src/ui/id';

/** How much history one run asks for. Small: the point is the shape, not the archive. */
const DAYS = 3;

/**
 * The device's calendar date, which on this machine is the machine's — the same `todayIso` every
 * screen dates a транзакція with, so the dry-run reads the days the app would.
 */
const dateOf = (unixSeconds: number): IsoDate => todayIso(new Date(unixSeconds * 1000));

const authFetch: AuthFetchLike = (url, headers) => fetch(url, { headers });

/** Every non-ok outcome ends the run with a line the owner can act on. */
function value<T>(outcome: Outcome<T>, what: string): T {
  switch (outcome.kind) {
    case 'ok':
      return outcome.value;
    case 'invalid-token':
      console.error(`${what}: monobank rejected the token`);
      return process.exit(1);
    case 'rate-limited':
      console.error(`${what}: rate-limited — the personal API allows one request a minute`);
      return process.exit(1);
    case 'unavailable':
      console.error(`${what}: unavailable — offline, an error, or a payload we cannot read`);
      return process.exit(1);
  }
}

async function main(): Promise<void> {
  const token = process.env.MONOBANK_TOKEN;
  if (!token) {
    console.error('usage: MONOBANK_TOKEN=… npx tsx scripts/mono-dry-run.ts');
    process.exit(2);
  }

  const accounts = value(await fetchClientInfo(authFetch, token), 'client-info');

  console.log(`monobank accounts: ${accounts.length}`);
  for (const a of accounts) {
    console.log(
      `  ${a.kind === 'jar' ? 'банка' : 'картка'} ${a.name} [${a.currency}] → ${suggestKind(a)}`,
    );
    console.log(
      `        raw ${formatMoney(a.balance)} | credit limit ${formatMoney(a.creditLimit)} | баланс банку ${formatMoney(a.bankBalance)}`,
    );
  }
  console.log('');

  const first = accounts[0];
  if (!first) {
    console.log('no accounts to fetch a statement for');
    return;
  }

  const now = Date.now();
  const window = planWindows(now - DAYS * 24 * 60 * 60 * 1000, now)[0];
  if (!window) {
    console.log('nothing to fetch');
    return;
  }

  const items = value(
    await fetchStatement(authFetch, token, {
      accountId: first.id,
      fromMs: window.fromMs,
      toMs: window.toMs,
      context: { currency: first.currency, dateOf },
    }),
    `statement of ${first.name}`,
  );

  console.log(`statement of ${first.name}, last ${DAYS} days: ${items.length} items`);
  const { transactions, seenNow } = mapStatement(items, {
    accountId: 'dry-run',
    currency: first.currency,
    rules: [],
    seenIds: new Set(),
    newId,
  });

  for (const t of transactions) {
    const label =
      t.type === 'expense'
        ? `витрата ${formatMoney(t.amount)} → ${t.categoryId}`
        : t.type === 'income'
          ? `дохід ${formatMoney(t.amount)} ← ${t.sourceId}`
          : t.type;
    console.log(`  ${t.date} ${label} "${t.description ?? ''}"`);
  }
  console.log('');
  console.log(`ids now seen: ${seenNow.size} (items that mapped to nothing are among them)`);
}

main().catch((error: unknown) => {
  // The engine turns failures into outcomes, so anything landing here is a bug worth seeing whole.
  console.error(error);
  process.exit(1);
});
