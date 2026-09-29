/**
 * The engine over the owner's real Saldo export, printed and thrown away.
 *
 *   npx tsx "scripts/saldo-dry-run.ts" "saldo_export_478575 (1).csv"
 *
 * Run by hand, never by `verify` — the file it reads is gitignored personal data and `verify`
 * must stay Node-only, under a minute and reproducible on any machine. Nothing is written
 * anywhere: this prints the survey, the «Борг» transactions still waiting for a person, and the
 * verification report, so a shape no synthetic fixture anticipated shows up as a рахунок that
 * does not reconcile before any screen exists to commit it.
 *
 * It runs with empty decisions on purpose: that is the worst case — no merges, no assignments —
 * and every рахунок still has to reconcile except where a listed row explains why not.
 */
import { readFileSync } from 'node:fs';

import { interpret } from '../src/saldo/interpret';
import { parseSaldoExport } from '../src/saldo/parse';
import { survey, NO_DECISIONS } from '../src/saldo/survey';
import { verify } from '../src/saldo/verify';
import { formatMoney } from '../src/ui/amount-input';
import { dateOfEpochMs } from '../src/ui/dates';
import { droppedRowLine } from '../src/ui/saldo-import';

const path = process.argv[2];
if (!path) {
  console.error('usage: npx tsx scripts/saldo-dry-run.ts <export.csv>');
  process.exit(2);
}

// The machine's own zone stands in for the phone's: Saldo's datetimes are UTC instants.
const parsed = parseSaldoExport(readFileSync(path, 'utf8'), dateOfEpochMs);
if (!parsed.ok) {
  console.error(`the export does not parse: ${parsed.reason}`);
  process.exit(1);
}

const transactions = parsed.transactions;
const surveyed = survey(transactions);
const plan = interpret({ transactions, survey: surveyed, decisions: NO_DECISIONS });
const report = verify({ transactions, plan });

console.log(`rows: ${transactions.reduce((n, t) => n + t.legs.length, 0)}`);
console.log(`transactions: ${transactions.length}`);
console.log(`планових транзакцій: ${plan.transactions.length}`);
console.log('');

console.log(`account map (${surveyed.accounts.length} entries):`);
for (const entry of surveyed.accounts) {
  console.log(`  ${entry.saldoAccount} [${entry.currency}] -> ${entry.proposedKind}`);
}
for (const dropped of surveyed.droppedPairs) {
  console.log(`  (dropped) ${dropped.saldoAccount} [${dropped.currency}] — zero opening rows only`);
}
console.log('');

console.log(`categories to create: ${plan.categories.length}`);
console.log(`sources to create: ${plan.sources.length}`);
console.log('');

console.log('reconciliation:');
for (const row of report.accounts) {
  const mark = row.reconciles ? 'ok  ' : 'DIFF';
  console.log(
    `  ${mark} ${row.name} saldo ${formatMoney(row.saldoBalance)} | plan ${formatMoney(row.planBalance)} | diff ${formatMoney(row.difference)}`,
  );
  for (const explanation of row.explanations) {
    console.log(
      explanation.kind === 'export-row'
        ? `        ${formatMoney(explanation.amount)} — row ${explanation.row.row} (${explanation.row.reason})`
        : `        ${formatMoney(explanation.amount)} — ${explanation.count} транзакцій already recorded by hand`,
    );
  }
}
console.log('');

console.log('рахунки-борги:');
for (const debt of report.debts) {
  console.log(`  ${debt.name}: ${formatMoney(debt.balance)}`);
}
console.log('');

const byReason = new Map<string, number>();
for (const row of report.droppedRows) {
  byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + 1);
}
console.log(`dropped and unexplained rows: ${report.droppedRows.length}`);
for (const [reason, count] of [...byReason].sort()) {
  console.log(`  ${reason}: ${count}`);
}
for (const row of report.droppedRows) {
  // The owner's own sentence, the one the звірка shows — plus the domain's refusal where there is
  // one, which is a diagnostic the screen deliberately leaves out.
  const why = row.reason === 'unrecognised-shape' && row.why ? ` [${row.why}]` : '';
  console.log(`  row ${row.row} (${row.reason}) — ${droppedRowLine(row, new Date())}${why}`);
}
console.log('');

console.log(`rejected redirects: ${report.rejectedRedirects.length}`);
console.log(`reconciles: ${report.reconciles}`);
process.exit(report.reconciles ? 0 : 1);
