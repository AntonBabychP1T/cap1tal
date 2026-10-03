import { mergeAccounts as mergeAccountsImpl } from './account-merge-repo';
import { accountsRepo } from './accounts-repo';
import { backupRepo } from './backup-repo';
import { driveBackupRepo } from './drive-backup-repo';
import { duplicateAnswersRepo } from './duplicate-answers-repo';
import { categoriesRepo } from './categories-repo';
import { db } from './client';
import { persistRetyped as persistRetypedImpl } from './counterpart-income-repo';
import { dashboardLayoutRepo } from './dashboard-layout-repo';
import { entryDefaultsRepo } from './entry-defaults-repo';
import { goalsRepo } from './goals-repo';
import { hapticsPreferenceRepo } from './haptics-preference-repo';
import { importRepo } from './import-repo';
import { commitmentsRepo } from './commitments-repo';
import { installmentsRepo } from './installments-repo';
import { investmentsRepo } from './investments-repo';
import { limitsRepo } from './limits-repo';
import { merchantsRepo } from './merchants-repo';
import { monobankRepo } from './monobank-repo';
import { netWorthRepo } from './net-worth-repo';
import { notificationsRepo } from './notifications-repo';
import { settlePlans as settlePlansIn } from './plans-settle';
import { progressRepo } from './progress-repo';
import { ratesRepo } from './rates-repo';
import { receiptsRepo } from './receipts-repo';
import { remindersRepo } from './reminders-repo';
import { reportingRepo } from './reporting-repo';
import { categorisationContext as categorisationContextIn } from './categorisation';
import { ruleTemplateRepo } from './rule-template-repo';
import { rulesRepo } from './rules-repo';
import { sourcesRepo } from './sources-repo';
import { stampedMemo, storageStamp, storedHistory as storedHistoryRepo } from './stored-history';
import { transactionsRepo } from './transactions-repo';

/**
 * The repositories the screens use, over the one device database. Screens hold no state of their
 * own beyond the form they are showing: they read when they come into sight and after their own
 * writes (design.md §6, `useReloadOnFocus`).
 *
 * The reads a screen repeats between writes — the whole stored history, the «Без категорії» count,
 * the статок reads, the зведення прогресу — are remembered in memory under storage's own change
 * stamp (`stored-history.ts`, app-speed-pass design D1). Nothing is stored, and the key is what
 * SQLite says changed rather than what a writer remembered to announce, so no screen can show a
 * balance older than the last committed write.
 */
export const accounts = accountsRepo(db);
/** Folds one рахунок into another of the same money, atomically — see `account-merge-repo.ts`. */
export const mergeAccounts = (input: Parameters<typeof mergeAccountsImpl>[1]) =>
  mergeAccountsImpl(db, input);
export const transactions = transactionsRepo(db);
/**
 * The whole stored history — рахунки, транзакції, their місяці and balances — read at most once
 * per change stamp, whoever asks first (see `stored-history.ts`). What a screen that needs all of
 * it reads instead of `transactions.listAll()`.
 */
export const storedHistory = storedHistoryRepo(db);
/**
 * A read derived wholly from storage, remembered under the change stamp and `key` (the day, for one
 * that also depends on `now`) — see `stampedMemo`. For a derivation too costly to repeat on every
 * focus, such as Звіти's history (app-speed-pass design D7). Every input must come from storage.
 */
export const rememberedRead = <T,>(read: (key: string) => T): ((key?: string) => T) =>
  stampedMemo(db, read);
/** Storage's change stamp right now — what «Транзакції» keeps beside the pages it read. */
export const storageStampNow = (): string => storageStamp(db);
/** A retype or edit's whole write, atomically — see `counterpart-income-repo.ts`'s own doc. */
export const persistRetyped = (
  written: Parameters<typeof persistRetypedImpl>[1],
  storedAt: Date,
) => persistRetypedImpl(db, written, storedAt);
/** The monobank rate cache — read for the approximate UAH figure, written when it is refreshed. */
export const rates = ratesRepo(db);
/** The owner's editable lists and the правила автокатегоризації — seeded on open, see ./seed.ts. */
export const categories = categoriesRepo(db);
export const sources = sourcesRepo(db);
export const rules = rulesRepo(db);
/**
 * The продавці and their написання. `merchants.index()` is what every reader recognises описи by;
 * every change but a rename runs the розбір of «Без категорії» in its own transaction.
 */
export const merchants = merchantsRepo(db);
/** The owner's mapping of the шаблон категоризації onto their категорії, and its open-time розбір. */
export const ruleTemplate = ruleTemplateRepo(db);
/**
 * What decides a категорія — the правила and the шаблон — read fresh. Every caller that decides
 * one takes this rather than `rules.list()`, which would silently lose the шаблон (rule-template
 * design T4).
 */
export const categorisationContext = () => categorisationContextIn(db);
/** The one-time Saldo import: the marker, and the atomic commit of a plan. */
export const imports = importRepo(db);
/** monobank's own side: the accounts a token showed, their links, cursors and imported ids. */
export const monobank = monobankRepo(db);
/** The ліміти categories carry, and the цілі — what the owner wants, beside what already is. */
export const limits = limitsRepo(db);
export const goals = goalsRepo(db);
/** Розстрочки — the plans behind the monthly debits, and the states of their платежі. */
export const installments = installmentsRepo(db);
/** Зобов'язання — оренда, інтернет, підписки: plans the debits are linked to, like the розстрочки. */
export const commitments = commitmentsRepo(db);
/**
 * Links both plans' платежі to their списання in one write, the розстрочки first (commitments
 * design D4) — see `plans-settle.ts`. What the upkeep calls; never one plan alone.
 */
export const settlePlans = (today: string) => settlePlansIn(db, today);
/** The поточна вартість of each інвестиційний рахунок — what the owner last said it is worth. */
export const investments = investmentsRepo(db);
/** Статок's bounded local reads — monthly movement, first dates and the future-record flag. */
export const netWorth = netWorthRepo(db);
/** What bank notifications have come to: the watched apps, the fingerprints, the чернетки. */
export const notifications = notificationsRepo(db);
/** The фіскальні чеки beneath транзакції, with their позиції. Nothing here moves any money. */
export const receipts = receiptsRepo(db);
/** The whole state as one snapshot, and the atomic replacement a відновлення is. */
export const backup = backupRepo(db);
/** Which Google account the бекапи go to, when the last one went up, and what last went wrong.
 *  No token, no key and no код відновлення: those three are in the device's secure storage. */
export const driveBackupState = driveBackupRepo(db);
/** The daily нагадування's setting, and the сповіщення про збій still outstanding. */
export const reminders = remindersRepo(db);
/** The рахунок the entry form opens on — written by Головний's hand-entry path and nothing else. */
export const entryDefaults = entryDefaultsRepo(db);
/** The журнал and the репорти про помилки — what the app did, and what the owner wrote about it. */
export const reporting = reportingRepo(db);
/** The прогрес: the зведення the engine reads, the earned досягнення, the decisions and the норми. */
export const progress = progressRepo(db);
/** The owner's dashboard layout: which known Головний widgets show, and in what order. */
export const dashboardLayout = dashboardLayoutRepo(db);
/** The «Вібрація» switch: whether the app plays its haptics. No row is on. */
export const hapticsPreference = hapticsPreferenceRepo(db);
/** The owner's «Не дубль» answers — the one thing about an спостереження that is ever stored. */
export const duplicateAnswers = duplicateAnswersRepo(db);
