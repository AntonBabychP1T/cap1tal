/**
 * A synthetic бекап big enough to feel the app slow down — the measurement fixture of
 * app-speed-pass (task 1.1).
 *
 *   npx tsx scripts/make-big-backup.ts [out.json]
 *
 * Deterministic: a fixed seed, fixed dates and a fixed `now`, so two runs write the same bytes and a
 * measurement before a change and after it read the same history. Built through the real
 * repositories over a throwaway database and written by `makeBackup` — the same path «Зробити
 * бекап» takes — so it restores through Налаштування → Бекап like any other.
 *
 * What it holds: 27 рахунки in UAH, USD and EUR (one рахунок-борг, two archived), 10 000 транзакції
 * over four years — витрати with опис, доходи, перекази across currencies, повернення — 30 ліміти
 * and 5 цілі. One card carries far more than the rest, so "opening the largest рахунок" is a
 * рахунок with thousands of rows.
 *
 * Run by hand, never by `verify`. The file it writes is synthetic and holds nothing personal.
 */
import { writeFileSync } from 'node:fs';

import { isRefusal, makeBackup, readBackup } from '../src/backup/backup';
import { accountsRepo } from '../src/db/accounts-repo';
import { backupRepo } from '../src/db/backup-repo';
import { categoriesRepo } from '../src/db/categories-repo';
import { goalsRepo } from '../src/db/goals-repo';
import { limitsRepo } from '../src/db/limits-repo';
import { seedStarterSet } from '../src/db/seed';
import { openTestDb } from '../src/db/test-db';
import { transactionsRepo } from '../src/db/transactions-repo';
import { account, type Account, type AccountKind } from '../src/domain/account';
import { money, type CurrencyCode } from '../src/domain/money';
import {
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type Transaction,
} from '../src/domain/transaction';

const OUT = process.argv[2] ?? 'big-backup.json';
const TRANSACTIONS = 10_000;
const NOW = new Date('2026-09-29T12:00:00.000Z');
const FIRST_DAY = Date.UTC(2022, 9, 1);
const DAYS = Math.floor((Date.UTC(2026, 8, 28) - FIRST_DAY) / 86_400_000);

/** mulberry32: small, fast and the same on every machine. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = prng(20260929);
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T,>(items: readonly T[]): T => items[int(0, items.length - 1)]!;
const dayOf = (offset: number) => new Date(FIRST_DAY + offset * 86_400_000).toISOString().slice(0, 10);

const storage = openTestDb();
const { db } = storage;
seedStarterSet(db);

// 27 рахунки: the main card first (it carries most of the history), then the rest.
const SPECS: readonly { name: string; kind: AccountKind; currency: CurrencyCode }[] = [
  { name: 'mono black', kind: 'spending', currency: 'UAH' },
  { name: 'mono white', kind: 'spending', currency: 'UAH' },
  { name: 'ПриватБанк', kind: 'spending', currency: 'UAH' },
  { name: 'Готівка', kind: 'cash', currency: 'UAH' },
  { name: 'Гаманець USD', kind: 'cash', currency: 'USD' },
  { name: 'Гаманець EUR', kind: 'cash', currency: 'EUR' },
  { name: 'mono USD', kind: 'spending', currency: 'USD' },
  { name: 'mono EUR', kind: 'spending', currency: 'EUR' },
  { name: 'Подушка', kind: 'savings', currency: 'UAH' },
  { name: 'Банка «Відпустка»', kind: 'savings', currency: 'UAH' },
  { name: 'Банка «Авто»', kind: 'savings', currency: 'UAH' },
  { name: 'Депозит USD', kind: 'savings', currency: 'USD' },
  { name: 'Депозит EUR', kind: 'savings', currency: 'EUR' },
  { name: 'ОВДП', kind: 'investment', currency: 'UAH' },
  { name: 'IBKR', kind: 'investment', currency: 'USD' },
  { name: 'Борг Олега', kind: 'debt', currency: 'UAH' },
  ...Array.from({ length: 11 }, (_, i) => ({
    name: `Картка ${i + 1}`,
    kind: 'spending' as AccountKind,
    currency: (['UAH', 'USD', 'EUR'] as const)[i % 3]!,
  })),
];
const accounts: Account[] = SPECS.map((spec, i) =>
  account({
    id: `acc-${String(i).padStart(2, '0')}`,
    name: spec.name,
    kind: spec.kind,
    currency: spec.currency,
    openingBalance: money(int(0, 5_000_000), spec.currency),
    archived: i === 25 || i === 26,
  }),
);
for (const a of accounts) accountsRepo(db).save(a);
const live = accounts.filter((a) => !a.archived);
const main = accounts[0]!;

// The starter set, and as many more as it takes to carry 30 ліміти.
for (const [i, name] of ['Хобі', 'Подарунки друзям', 'Ремонт'].entries()) {
  categoriesRepo(db).create({ id: `cat-extra-${i}`, name });
}
const categories = categoriesRepo(db)
  .list()
  .filter((c) => !c.archived && c.id !== UNCATEGORISED_CATEGORY_ID)
  .map((c) => c.id);
const MERCHANTS = ['СІЛЬПО', 'АТБ', 'Novus', 'Uklon', 'Bolt', 'WOG', 'OKKO', 'Rozetka', 'Епіцентр', 'Аптека Доброго Дня'];

const repo = transactionsRepo(db);
db.transaction(
  (tx) => {
    const write = transactionsRepo(tx);
    for (let i = 0; i < TRANSACTIONS; i++) {
      const id = `t-${String(i).padStart(5, '0')}`;
      const date = dayOf(Math.floor((i / TRANSACTIONS) * DAYS));
      const storedAt = new Date(FIRST_DAY + i * 60_000);
      const roll = random();
      // Four in ten on the main card, the rest spread: the main card is "the largest рахунок".
      const on = random() < 0.4 ? main : pick(live);
      let t: Transaction;
      if (roll < 0.78) {
        t = {
          type: 'expense',
          id,
          date,
          accountId: on.id,
          amount: money(int(1_000, 250_000), on.currency),
          categoryId: random() < 0.05 ? UNCATEGORISED_CATEGORY_ID : pick(categories),
          description: pick(MERCHANTS),
        };
      } else if (roll < 0.86) {
        t = {
          type: 'income',
          id,
          date,
          accountId: on.id,
          amount: money(int(100_000, 8_000_000), on.currency),
          sourceId: UNSOURCED_SOURCE_ID,
          description: 'Зарахування',
        };
      } else if (roll < 0.97) {
        const to = pick(live.filter((a) => a.id !== on.id));
        const left = int(10_000, 2_000_000);
        const arrived = to.currency === on.currency ? left : Math.max(1, Math.round(left / (on.currency === 'UAH' ? 41 : 1.1)));
        t = {
          type: 'transfer',
          id,
          date,
          fromAccountId: on.id,
          toAccountId: to.id,
          left: money(left, on.currency),
          arrived: money(arrived, to.currency),
        };
      } else {
        t = {
          type: 'refund',
          id,
          date,
          accountId: on.id,
          amount: money(int(1_000, 50_000), on.currency),
          categoryId: pick(categories),
          description: pick(MERCHANTS),
        };
      }
      write.save(t, storedAt);
    }
  },
  { behavior: 'immediate' },
);

// 30 ліміти: one per категорія while they last, in UAH.
for (const categoryId of categories.slice(0, 30)) {
  limitsRepo(db).set({ categoryId, amount: money(int(200_000, 2_000_000), 'UAH') });
}

// 5 цілі over the savings рахунки, one of them mixing currencies (and therefore in UAH).
const savings = accounts.filter((a) => a.kind === 'savings' || a.kind === 'investment');
const GOALS = [
  { name: 'Подушка на 6 місяців', ids: [savings[0]!.id] },
  { name: 'Відпустка', ids: [savings[1]!.id] },
  { name: 'Авто', ids: [savings[2]!.id, savings[0]!.id] },
  { name: 'Долари', ids: [savings[3]!.id] },
  { name: 'Усе разом', ids: [savings[0]!.id, savings[3]!.id, savings[4]!.id] },
];
GOALS.forEach((goal, i) => {
  const held = goal.ids.map((id) => accounts.find((a) => a.id === id)!);
  const currency = new Set(held.map((a) => a.currency)).size > 1 ? 'UAH' : held[0]!.currency;
  goalsRepo(db).save({
    id: `goal-${i}`,
    name: goal.name,
    target: money(int(5_000_000, 50_000_000), currency),
    ...(i % 2 === 0 ? { deadline: '2027-06-30' } : {}),
    accountIds: goal.ids,
  });
});

const snapshot = makeBackup(backupRepo(db).snapshot(), NOW);
// The same check a restore makes first: a file this script wrote must read back as a бекап.
const read = readBackup(snapshot.bytes);
if (isRefusal(read)) {
  console.error(`the бекап does not read back: ${JSON.stringify(read)}`);
  process.exit(1);
}
writeFileSync(OUT, snapshot.bytes, 'utf8');
const mainCount = repo.listByAccount(main.id).length;
console.log(
  `${OUT}: ${accounts.length} рахунків, ${repo.listAll().length} транзакцій ` +
    `(${mainCount} на «${main.name}»), ${limitsRepo(db).list().length} лімітів, ` +
    `${goalsRepo(db).list().length} цілей, ${(snapshot.bytes.length / 1_048_576).toFixed(1)} МБ`,
);
storage.close();
