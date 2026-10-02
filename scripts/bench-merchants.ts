/**
 * How long recognition takes on a long history — merchant-normalization task 4.4.
 *
 *   npx tsx scripts/bench-merchants.ts
 *
 * 10 000 витрати whose описи are drawn from 900 distinct texts (a busy owner's few years: a
 * hundred-odd shops, each in several branches and two scripts), and 300 продавці holding one or two
 * написання each. It times, under Node, the three reads the change adds:
 *
 * 1. recognising every опис once against a freshly built index (what a line list, «Без продавця» and
 *    the пакет pay);
 * 2. «Транзакції» narrowed to one продавець — the first page (reads and judges the history) and the
 *    next (slices what was remembered);
 * 3. a typed search that names a продавець.
 *
 * Run by hand, never by `verify`. Deterministic: a fixed seed, so two runs measure the same history.
 */
import { performance } from 'node:perf_hooks';

import { accountsRepo } from '../src/db/accounts-repo';
import { merchantsRepo } from '../src/db/merchants-repo';
import { seedStarterSet } from '../src/db/seed';
import { openTestDb } from '../src/db/test-db';
import { transactionsRepo } from '../src/db/transactions-repo';
import { account } from '../src/domain/account';
import { merchantIndex } from '../src/domain/merchants';
import { money } from '../src/domain/money';
import { expenseByDefault } from '../src/domain/transaction';

const TRANSACTIONS = 10_000;
const MERCHANTS = 300;
const SHOPS = 150;

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
const random = prng(20261002);
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

/** A shop's name in Cyrillic and in Latin, as a bank writes the two. */
const cyrillic = (k: number) => `МАГАЗИН${'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩ'[k % 25]}${Math.floor(k / 25)}`;
const latin = (k: number) => `SHOP${'ABCDEFGHIJKLMNOPQRSTUVWXY'[k % 25]}${Math.floor(k / 25)}`;
/** 900 distinct описи: each shop in three branches, in one of its two scripts. */
const DESCRIPTIONS = Array.from({ length: SHOPS * 6 }, (_, i) => {
  const shop = i % SHOPS;
  const branch = Math.floor(i / SHOPS);
  return branch % 2 === 0 ? `Оплата ${cyrillic(shop)} ${1000 + branch} Київ` : `${latin(shop)} BRANCH ${branch}`;
});

const storage = openTestDb();
const { db } = storage;
seedStarterSet(db);
accountsRepo(db).save(account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' }));
db.transaction(
  (tx) => {
    const write = transactionsRepo(tx);
    for (let i = 0; i < TRANSACTIONS; i++) {
      write.save(
        expenseByDefault({
          id: `t-${String(i).padStart(5, '0')}`,
          date: new Date(Date.UTC(2022, 0, 1) + Math.floor((i / TRANSACTIONS) * 1400) * 86_400_000)
            .toISOString()
            .slice(0, 10),
          accountId: 'card',
          amount: money(int(100, 500_000), 'UAH'),
          description: DESCRIPTIONS[int(0, DESCRIPTIONS.length - 1)]!,
        }),
        new Date(Date.UTC(2022, 0, 1) + i * 60_000),
      );
    }
  },
  { behavior: 'immediate' },
);

// 300 продавці: each of the 150 shops named once with its Cyrillic написання, then given its Latin
// one; and 150 more named for nothing in this history, to make the index as long as asked.
const merchants = merchantsRepo(db);
const at = new Date('2026-10-02T10:00:00Z');
for (let k = 0; k < SHOPS; k++) {
  const spelling = cyrillic(k).toLowerCase();
  merchants.name({
    description: spelling,
    spelling,
    spellingId: `s-${k}-c`,
    into: { kind: 'new', id: `m-${k}`, name: `Магазин ${k}` },
    now: at,
  });
  merchants.addSpelling({ merchantId: `m-${k}`, spelling: latin(k).toLowerCase(), spellingId: `s-${k}-l`, now: at });
}
for (let k = SHOPS; k < MERCHANTS; k++) {
  merchants.name({
    description: `нікому ${k}`,
    spelling: `нікому ${k}`,
    spellingId: `s-${k}`,
    into: { kind: 'new', id: `m-${k}`, name: `Інший ${k}` },
    now: at,
  });
}

const time = <T,>(run: () => T): { ms: number; value: T } => {
  const start = performance.now();
  const value = run();
  return { ms: performance.now() - start, value };
};

const history = transactionsRepo(db).listAll();
const spellings = merchants.list().reduce((sum, m) => sum + m.spellings.length, 0);
const recognised = time(() => {
  const index = merchantIndex(merchants.list());
  return history.filter((t) => index.recognise(t.description) !== undefined).length;
});
const repo = transactionsRepo(db);
const firstPage = time(() => repo.search({ merchantId: 'm-7', limit: 100, offset: 0 }));
const nextPage = time(() => repo.search({ merchantId: 'm-7', limit: 100, offset: 100 }));
const typed = time(() =>
  repo.search({
    match: { text: 'магазин 7', categoryIds: [], sourceIds: [], merchantIds: ['m-7'] },
    limit: 100,
    offset: 0,
  }),
);

console.log(`history: ${history.length} транзакцій, ${new Set(history.map((t) => t.description)).size} distinct описи`);
console.log(`продавці: ${merchants.list().length}, написання: ${spellings}`);
console.log(`recognise every опис (fresh index): ${recognised.ms.toFixed(1)} ms — ${recognised.value} recognised`);
console.log(`«Транзакції» narrowed to one продавець, first page: ${firstPage.ms.toFixed(1)} ms — ${firstPage.value.length} rows`);
console.log(`…next page (remembered): ${nextPage.ms.toFixed(1)} ms — ${nextPage.value.length} rows`);
console.log(`typed search naming the продавець: ${typed.ms.toFixed(1)} ms — ${typed.value.length} rows`);
storage.close();
