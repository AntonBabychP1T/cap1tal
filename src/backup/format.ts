import type { Account, AccountKind } from '../domain/account';
import { identityKey, receiptIdentity } from '../domain/fiscal-receipt';
import type { Category, Source } from '../domain/category';
import type { CategoryLimit } from '../domain/limits';
import { foldSpelling, merchantNameKey } from '../domain/merchants';
import { compositionProblem, type AccumulationGoal } from '../domain/goals';
import {
  INSTALLMENT_CURRENCY,
  installmentRefusal,
  isDebitOn,
  type Installment,
  type InstallmentPartLink,
  type InstallmentPartMark,
  type RefusedDebit,
} from '../domain/installments';
import { MAX_AMOUNT_MINOR, money, type CurrencyCode, type Money } from '../domain/money';
import { isoDate, type IsoDate, type Transaction } from '../domain/transaction';
import type { TimeOfDay } from '../reminders/time';

/**
 * What a бекап *is*: the envelope that carries it, the two versions it names, the enumerated list
 * of what it holds — and the total parse that turns the untyped JSON of a picked file back into
 * those values.
 *
 * Nothing here reads storage, a clock or a device. The whole of "is this a бекап, and does what it
 * holds stand together" is a pure function over a value, which is what makes «show the owner what
 * a restore would do before anything is replaced» true rather than merely intended (design D6).
 *
 * The shape a бекап holds is the domain's own values, not a copy of the SQLite rows (design D2):
 * a бекап names рахунки and транзакції, so a бекап written under an older storage shape simply
 * names fewer things instead of being unreadable.
 */

/** The shape of the envelope. Bumped by hand when that shape changes; never derived. */
export const BACKUP_FORMAT_VERSION = 2;

/**
 * The number of committed migrations a бекап is written under — the storage shape it saw.
 *
 * It is a hand-kept constant and `format.test.ts` fails unless it equals the number of entries in
 * `drizzle/meta/_journal.json`. That tripwire is the point, not the number: adding a migration
 * breaks `verify` until someone opens this file and asks whether a бекап still holds everything it
 * should. A бекап naming a higher one is refused; a lower one is restored (design D5).
 *
 * Reset to 1 with the v1 baseline: every migration before it was squashed into one (owner's
 * decision, 2026-09-11) — the app has no released install to read an old бекап back into, so
 * nothing is lost in starting the count over. From here the usual rule applies again: every new
 * migration bumps this by one.
 */
export const BACKUP_SCHEMA_VERSION = 11;

/** How a бекап says it is one. First in the envelope, so a truncated file still says it. */
export const BACKUP_APP = 'cap1tal';
export const BACKUP_KIND = 'backup';

/**
 * Every table a бекап holds, named in one place so what is *not* here is a decision and not an
 * oversight (design D1). `format.test.ts` compares this against the schema itself: a new table is
 * either added here or named among the exclusions, and until one of the two happens `verify` fails.
 *
 * Deliberately absent, each for its own reason: `monobank_rates` is a cache that re-fetches
 * itself; `notification_fingerprints` is what stops an already-decided notification from being
 * drafted a second time and so must survive a restore rather than travel in one;
 * `notification_drafts` are чернетки the owner has not confirmed — a бекап holds what they have
 * confirmed as their money, not what the phone has merely overheard; and `alerts` is what *this*
 * phone last failed at, which says nothing about the owner's money and would be a lie on a device
 * that never failed at anything. `journal`, `bug_reports` and `bug_report_screenshots` are the
 * app's memory of its own bugs — what it did, what the owner wrote about it, and screenshots of
 * this phone's screen. They are facts about a device and a build, not about the owner's money, and
 * a репорт filed on one phone would say nothing true on another; the репорт leaves by the owner's
 * «Передати» and by no other road, least of all inside a бекап the owner made for a different
 * reason. The monobank token is in no table at all: it lives in the device's secure storage
 * (`src/platform/monobank-token.ts`), which is what makes FR-B2 a property of the code and not a
 * promise.
 *
 * `bug_report_capture` is out for the same reason one step further: it holds whether *this* phone
 * files репорти by the gesture or by the handle — the owner's testing habit, not a setting about
 * their money — and a restored phone should decide that for itself. `bug_reports`' `origin` and
 * `capture_failure` columns need no separate decision: the whole table is already excluded above.
 *
 * `daily_reminder` is here: FR-B1's «налаштування без секретів», so a restored phone reminds the
 * owner as the old one did (design D8).
 *
 * `monobank_sync_attempt` is absent for `alerts`'s reason rather than for a secret's: it is when
 * this phone last tried to sync and how that went. A moment carried in from another device would
 * make this one skip a sync it never made, or wear a failure it never had; a restored phone simply
 * has not tried yet, and tries the moment it is opened.
 *
 * `monobank_request_pace` is absent for exactly the attempt's reason, one layer lower: it is when
 * this phone last sent the bank a request, which is what keeps the next run inside the API's one
 * request a minute. A moment carried in from another device would make a restored phone sit out a
 * request it never sent, or fire one the bank will refuse.
 *
 * `monobank_links.last_attempted_at`, `paging_window_to_ms`, `paging_request_to_ms` and
 * `owed_since` are the *columns* excluded from a table that is otherwise carried whole, so they are said here rather
 * than left to the list below — `BACKUP_TABLES` names tables and the tests over it check tables,
 * so nothing else would say it. `src/db/backup-repo.ts` names the link columns it snapshots and
 * restores one by one, and these four are not among them: a link's turn is when *this* phone last
 * asked the bank about it, the paging pair is how far *this* phone has read into a window it
 * has not finished, and `owed_since` is what *this* phone knows it has not read yet — the same
 * class of fact as the pace above — while the link's cursor, its sync
 * boundary and its last completed sync are the owner's own state and are carried. A restored link
 * has had no turn and has read no pages, which is true; its next прогін plans that window afresh.
 *
 * `entry_defaults` is deliberately absent, and it is the one exclusion that is not about secrecy:
 * it holds which рахунок the entry form on *this* phone opens on — a habit the device learned from
 * the owner's last hand-made запис, not a setting they chose and not their money. A restored phone
 * learns it again the first time they record by hand, and until then the form opens with nothing
 * pre-chosen, exactly as a phone that has never recorded by hand does.
 *
 * `rule_template_sweep` is absent too: it is the шаблон version *this* phone last swept «Без
 * категорії» under — bookkeeping about work already done to the транзакції a бекап carries as they
 * are, not the owner's state (rule-template design T6). A restore leaves this phone's own row as it
 * was: a fresh phone, which has none, sweeps the restored «Без категорії» once on its next open; a
 * phone already swept under this шаблон does not sweep again until the шаблон's version changes.
 */
export const BACKUP_TABLES: readonly string[] = [
  'accounts',
  'categories',
  'sources',
  // The продавці and their написання: names the owner gave, which no statement carries and nothing
  // re-derives. Before `rules`, in the order a restore inserts them, since a правило may name one
  // (merchant-normalization design M12).
  'merchants',
  'merchant_spellings',
  'rules',
  'category_limits',
  'goals',
  // The склад of a ціль: its own relation, so the бекап carries it explicitly. A ціль витрат adds
  // nothing here — it is the `category_limits` row above, which is why it costs the бекап nothing.
  'goal_accounts',
  'transactions',
  'saldo_import',
  'monobank_accounts',
  'monobank_links',
  'monobank_imported_items',
  'notification_watches',
  'daily_reminder',
  // A чек is the owner's own record of what they bought, and the tax service is not guaranteed to
  // serve it again — so a restore must reproduce it without the network. The снапшот travels with
  // it for the same reason (design D7), which also means the бекап now carries whatever the
  // registrar printed: a masked card number, a cashier's name, a loyalty line. That is the same
  // class of data as an опис, it stays in the file the owner controls, and the бекап screen's
  // existing warning that whoever holds this file reads the owner's money covers it.
  'fiscal_receipts',
  'receipt_items',
  // The прогрес: what the owner has earned, what they decided about a виклик, and the норми they
  // confirmed. None of the three can be recomputed from the транзакції — a дата досягнення read
  // from a history, the moment a row was written, whether the owner has seen it, a dismissal and a
  // confirmed сума exist nowhere else — and a відновлення that dropped them would show a phone
  // that has just restored two years of history as having achieved nothing, then re-earn
  // everything with today's дата, losing the very dates the capability exists to protect
  // (achievements design D8).
  'earned_achievements',
  'challenge_decisions',
  'spending_norms',
  // What the owner said each інвестиційний рахунок is worth. Alone among the numbers this file
  // carries, a поточна вартість is explained by no транзакція and derivable from nothing: a бекап
  // that dropped it would leave a restored phone showing вкладено alone for рахунки whose worth
  // the owner had already told the app, and no re-fetch could put it back. It is their money data,
  // which is the line drawn above — what is excluded is this *phone's* facts, never theirs.
  'investment_values',
  // The owner's dashboard layout: a deliberate customisation, the same class of preference
  // `daily_reminder` already travels for (design D7 of customizable-home-dashboard).
  'dashboard_layout',
  // The «Вібрація» switch: a choice the owner made, which travels like the layout
  // (app-motion-pass design D14).
  'haptics_preference',
  // Розстрочки: the owner's word about money no statement shows — dropped from a бекап, a restored
  // phone would know every платіж as an ordinary витрата and nothing of what is still owed. With
  // them the states of their платежі, and the switch of the нагадування про платіж. Of
  // `installment_reminder` only `enabled` travels: `asked` is whether *this* phone already asked for
  // notification permission, which a restore leaves as the phone had it (installments design D8).
  'installments',
  'installment_part_links',
  'installment_part_marks',
  'installment_refusals',
  'installment_reminder',
  // The owner's mapping of the шаблон категоризації onto their категорії — a choice they made,
  // never the шаблон itself, which is the app's (rule-template design T6).
  'rule_template_choices',
];

/**
 * A правило, with the `createdAt` that breaks ties between two equally specific ones as epoch ms.
 * Exactly one of `categoryId` / `toAccountId` is present — never both, never neither — a
 * правило-переказ names the destination рахунок instead of a category (design D9).
 */
export interface BackupRule {
  readonly id: string;
  readonly merchant?: string;
  /** The продавець the правило names instead of a pattern; absent on every older бекап. */
  readonly merchantId?: string;
  readonly mcc?: number;
  readonly categoryId?: string;
  readonly toAccountId?: string;
  readonly createdAtMs: number;
}

/** A продавець, with the moment it was named. Its написання are their own section. */
export interface BackupMerchant {
  readonly id: string;
  readonly name: string;
  readonly createdAtMs: number;
}

/**
 * A написання, with the moment it was added — carried because the newest of two написання of
 * equal length decides a tie, so a restored phone recognises every опис as the old one did.
 */
export interface BackupMerchantSpelling {
  readonly id: string;
  readonly merchantId: string;
  readonly spelling: string;
  readonly createdAtMs: number;
}

/**
 * A транзакція with the one piece of storage metadata that decides order: when it counts as
 * stored, the tie-break between транзакції of the same дата in the latest listing (design D3).
 * Carried verbatim so a restored phone lists exactly what the old one listed.
 */
export interface BackupTransaction {
  readonly transaction: Transaction;
  readonly storedAtMs: number;
}

/** A monobank account as the bank showed it, with the last баланс банку seen. */
export interface BackupMonobankAccount {
  readonly id: string;
  readonly kind: 'card' | 'jar';
  readonly name: string;
  readonly currency: CurrencyCode;
  readonly bankBalance: Money;
  readonly obtainedAtMs: number;
}

/** One monobank account bound to one рахунок, with the boundary and the cursor sync stands at. */
export interface BackupMonobankLink {
  readonly monobankAccountId: string;
  readonly accountId: string;
  readonly syncStartDate: IsoDate;
  readonly cursorMs: number;
  /**
   * When a sync last completed for this link. Absent two ways, and they mean the same thing to a
   * restored device: a link that has never synced, and a бекап written before this field existed.
   * Both come back as «ще не синхронізовано» — true in the first case, and in the second the safe
   * direction, since a moment that is missing costs one extra sync and a moment that is invented
   * tells the owner their рахунок is fresher than it is.
   */
  readonly lastSyncedAtMs?: number;
}

/** One monobank item id this device has already imported, on the bank account that showed it. */
export interface BackupImportedItem {
  readonly monobankAccountId: string;
  readonly itemId: string;
}

/**
 * The daily нагадування as the owner left it: on or off, and the wall-clock time they chose. A
 * бекап names it only when the owner has ever set one — an older бекап names none, and restores as
 * off, which is exactly what `backup-file` design D5 promises about a бекап naming fewer things.
 */
export interface BackupReminder {
  readonly enabled: boolean;
  readonly time: TimeOfDay;
}

/**
 * The owner's dashboard layout: the payload's own schema version and one entry per widget id the
 * device that wrote it named, in its saved order. `id` is `string`, not the closed
 * `DashboardWidgetId` union (design D2/D7) — an unknown or duplicate identity is structurally
 * valid data here; normalization, not backup validation, decides what an app version renders, the
 * same total-parse-then-normalize split `src/dashboard/layout.ts` already draws for storage.
 */
export interface BackupDashboardLayout {
  readonly schemaVersion: number;
  readonly items: readonly { readonly id: string; readonly visible: boolean }[];
}

/**
 * One відстежуваний застосунок and the рахунок its notifications land on. No currency: a watch's
 * currency is its рахунок's, read on the way out of storage, so the two cannot drift apart.
 */
export interface BackupWatch {
  readonly packageName: string;
  readonly accountId: string;
}

/**
 * A фіскальний чек, with the source snapshot that makes it independent of the tax service. Its
 * позиції travel beside it in their own list rather than nested, mirroring the two tables — which
 * is what lets a позиція naming a чек the бекап does not hold be named as a contradiction instead
 * of being silently impossible to express.
 */
export interface BackupReceipt {
  readonly id: string;
  readonly transactionId: string;
  readonly registrarNumber: string;
  readonly fiscalNumber: string;
  readonly issuedDate: IsoDate;
  readonly issuedTime: string;
  readonly dialect: 'prro' | 'rro';
  readonly kind: 'sale' | 'return';
  readonly total: Money;
  readonly sellerName?: string;
  readonly pointName?: string;
  readonly acquisition: 'qr_scan';
  readonly fetchedAtMs: number;
  readonly snapshot: string;
}

/** One позиція чека, exactly as the чек printed it. */
export interface BackupReceiptItem {
  readonly id: string;
  readonly receiptId: string;
  readonly line: number;
  readonly rawName: string;
  readonly quantityThousandths: number;
  readonly unit?: string;
  readonly unitPrice?: Money;
  readonly lineTotal: Money;
  readonly discount?: Money;
  readonly barcode?: string;
  readonly uktzed?: string;
  readonly code?: string;
}

/**
 * An earned **досягнення**, exactly as it was written: its stable key, the catalogue template it
 * belongs to, the дата досягнення, the moment it was recorded, whether and when the owner has seen
 * it, and its **свідчення**.
 *
 * The свідчення travels as the text it was stored as, and a restored device reads it back for
 * display alone: no баланс, no місячна картина, no ліміт and no ціль takes a number from it. That
 * is why it is a string here and not a сума — a бекап that carried it as money would be inviting
 * exactly the reading the capability forbids.
 */
export interface BackupAchievement {
  readonly key: string;
  readonly template: string;
  readonly achievedOn: IsoDate;
  readonly recordedAtMs: number;
  /** Absent while the owner has not been shown it — never `null`, and never a sentinel moment. */
  readonly seenAtMs?: number;
  readonly evidence: string;
}

/** What the owner decided about one виклик, and when. No progress, no target, no count. */
export interface BackupChallengeDecision {
  readonly key: string;
  readonly decision: 'accepted' | 'dismissed';
  readonly decidedAtMs: number;
}

/**
 * One confirmed **місячна норма витрат**. The сума carries its currency, as every сума in this
 * file does, so a норма cannot arrive without the currency it is a норма of.
 */
export interface BackupSpendingNorm {
  readonly amount: Money;
  readonly confirmedAtMs: number;
}

/**
 * The поточна вартість of one інвестиційний рахунок: what the owner last said it is worth, and the
 * calendar day they said it on. The дата is the domain's `IsoDate`, carried verbatim like a
 * транзакція's — a вартість is as old as the day it was typed, and a restored phone must not
 * present a June figure as today's.
 */
export interface BackupInvestmentValue {
  readonly accountId: string;
  readonly amount: Money;
  readonly asOf: IsoDate;
}

/**
 * The розстрочки (installments design D8): every plan, the states of its платежі — links, marks and
 * the транзакції the owner unlinked — and the switch of the нагадування про платіж. Whether the app
 * already asked for notification permission is this phone's own state and is not here.
 */
export interface BackupInstallments {
  readonly plans: readonly Installment[];
  readonly links: readonly InstallmentPartLink[];
  readonly marks: readonly InstallmentPartMark[];
  readonly refusals: readonly RefusedDebit[];
  readonly reminderEnabled: boolean;
}

/**
 * One choice the owner made about a базова категорія: the категорія it lands in, or `null` for
 * switched off. A базова категорія they never touched is not carried at all.
 */
export interface BackupTemplateChoice {
  readonly groupId: string;
  readonly categoryId: string | null;
}

/**
 * The owner's whole state, in the shape a бекап carries and storage restores. Every instant is
 * epoch milliseconds rather than a `Date`, because this value is written to a file and read back
 * from one: a shape that survives `JSON.parse` unchanged needs no second mapping layer to be the
 * same value on both sides.
 */
export interface BackupState {
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly sources: readonly Source[];
  /**
   * The продавці and their написання; absent on a бекап written before продавці existed, which
   * restores with none. Optional sections, so `BACKUP_FORMAT_VERSION` stays.
   */
  readonly merchants?: readonly BackupMerchant[];
  readonly merchantSpellings?: readonly BackupMerchantSpelling[];
  readonly rules: readonly BackupRule[];
  readonly limits: readonly CategoryLimit[];
  readonly goals: readonly AccumulationGoal[];
  readonly transactions: readonly BackupTransaction[];
  /** When the one-time Saldo import was committed; absent on a device that has imported nothing. */
  readonly saldoImportCommittedAtMs?: number;
  readonly monobankAccounts: readonly BackupMonobankAccount[];
  readonly monobankLinks: readonly BackupMonobankLink[];
  readonly monobankImportedItems: readonly BackupImportedItem[];
  readonly watches: readonly BackupWatch[];
  /** The daily нагадування; absent on a device where it was never set. */
  readonly reminder?: BackupReminder;
  /** Every фіскальний чек, with its снапшот. Empty on a бекап written before чеки existed. */
  readonly receipts: readonly BackupReceipt[];
  readonly receiptItems: readonly BackupReceiptItem[];
  /** The прогрес. All three empty on a бекап written before досягнення existed. */
  readonly achievements: readonly BackupAchievement[];
  readonly challengeDecisions: readonly BackupChallengeDecision[];
  readonly norms: readonly BackupSpendingNorm[];
  /** One per рахунок that has one. Empty on a бекап written before вартості existed. */
  readonly investmentValues: readonly BackupInvestmentValue[];
  /** The dashboard layout; absent on a device where the owner never customised or reset it. */
  readonly dashboardLayout?: BackupDashboardLayout;
  /**
   * The «Вібрація» switch; absent on a device where the owner never touched it — which restores to
   * no row, which is on. A бекап written before the switch existed restores the same way.
   */
  readonly haptics?: { readonly enabled: boolean };
  /**
   * The розстрочки; absent on a бекап written before they existed, or on a device that never
   * recorded one nor touched the switch — which restores to none, with the нагадування про платіж
   * on. An optional section, so `BACKUP_FORMAT_VERSION` stays.
   */
  readonly installments?: BackupInstallments;
  /**
   * The owner's choices about the шаблон категоризації; absent on a бекап written before the
   * mapping existed, or on a device where no базова категорія was ever touched — which restores to
   * none, every базова категорія following its типова категорія. An optional section, so
   * `BACKUP_FORMAT_VERSION` stays.
   */
  readonly templateChoices?: readonly BackupTemplateChoice[];
}

/** The whole file: the marker, the versions, the moment, the integrity value and the contents. */
export interface BackupEnvelope {
  readonly app: typeof BACKUP_APP;
  readonly kind: typeof BACKUP_KIND;
  readonly formatVersion: number;
  readonly schemaVersion: number;
  /** The moment the бекап was made, as an ISO instant — a бекап is an event, not a calendar day. */
  readonly createdAt: string;
  /** CRC-32 over `canonicalJson(data)`; see `canonical.ts` and design D4. */
  readonly checksum: string;
  readonly data: BackupState;
}

/**
 * What a бекап's contents could not stand up to. Thrown only inside this module's parse and caught
 * at `readBackup`'s boundary, where it becomes the named refusal the owner reads — never an
 * exception any caller has to handle.
 */
export class BackupProblem extends Error {}

function fail(problem: string): never {
  throw new BackupProblem(problem);
}

function objectAt(value: unknown, at: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${at} не є обʼєктом`);
  }
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, at: string): string {
  if (typeof value !== 'string') {
    fail(`${at} не є текстом`);
  }
  return value;
}

function integerAt(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail(`${at} не є цілим числом`);
  }
  return value;
}

function booleanAt(value: unknown, at: string): boolean {
  if (typeof value !== 'boolean') {
    fail(`${at} не є так/ні`);
  }
  return value;
}

function dateAt(value: unknown, at: string): IsoDate {
  try {
    return isoDate(stringAt(value, at));
  } catch {
    return fail(`${at} не є календарною датою`);
  }
}

/**
 * A сума, through the domain's own constructor: an integer in minor units beside an ISO-4217 code,
 * or no сума at all. Nothing in a бекап may be money the domain would refuse to build.
 *
 * Nor money above `MAX_AMOUNT_MINOR`, either side of zero — the ceiling every ingress keeps. A row
 * at the edge of the safe-integer range is a valid `money` on its own and breaks every sum it
 * enters; restoring one would carry that crash onto a clean phone.
 */
function moneyAt(value: unknown, at: string): Money {
  const row = objectAt(value, at);
  let built: Money;
  try {
    built = money(integerAt(row.amount, `${at}.amount`), stringAt(row.currency, `${at}.currency`));
  } catch (error) {
    if (error instanceof BackupProblem) throw error;
    return fail(`${at} не є сумою в мінорних одиницях із кодом валюти`);
  }
  if (Math.abs(built.amount) > MAX_AMOUNT_MINOR) {
    fail(`${at} — сума завелика: щонайбільше 999\u00A0999\u00A0999,99 за модулем`);
  }
  return built;
}

/**
 * A list a бекап names, or an empty one when it names none — which is how an older бекап restores:
 * it simply holds fewer things (design D5), and every list a later version added reads as absent.
 */
function listAt<T>(
  holder: Record<string, unknown>,
  key: string,
  item: (value: unknown, at: string) => T,
): T[] {
  const value = holder[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail(`«${key}» не є списком`);
  }
  return value.map((entry, index) => item(entry, `${key}[${index}]`));
}

/**
 * An optional string field, as a fragment to spread: absent stays absent rather than becoming a
 * key set to `undefined`, so a parsed value equals the one that was written — the same idiom
 * `mappers.ts` keeps for the same reason.
 */
function optionalString(row: Record<string, unknown>, key: string, at: string): Record<string, string> {
  const value = row[key];
  return value === undefined || value === null ? {} : { [key]: stringAt(value, `${at}.${key}`) };
}

const ACCOUNT_KINDS: readonly AccountKind[] = ['spending', 'savings', 'investment', 'cash', 'debt'];

function accountAt(value: unknown, at: string): Account {
  const row = objectAt(value, at);
  const kind = ACCOUNT_KINDS.find((candidate) => candidate === row.kind);
  if (!kind) {
    fail(`${at}.kind не є видом рахунку`);
  }
  const currency = stringAt(row.currency, `${at}.currency`);
  const openingBalance = moneyAt(row.openingBalance, `${at}.openingBalance`);
  if (openingBalance.currency !== currency) {
    fail(`${at}: початковий залишок у ${openingBalance.currency}, а рахунок у ${currency}`);
  }
  return {
    id: stringAt(row.id, `${at}.id`),
    name: stringAt(row.name, `${at}.name`),
    kind,
    currency,
    openingBalance,
    // The дата початкового залишку: absent on a рахунок without one, and on every рахунок of a бекап
    // written before it existed — which restores with none rather than being refused. An optional
    // field, so `BACKUP_FORMAT_VERSION` stays.
    ...(row.openingDate === undefined || row.openingDate === null
      ? {}
      : { openingDate: dateAt(row.openingDate, `${at}.openingDate`) }),
    archived: booleanAt(row.archived, `${at}.archived`),
  };
}

function namedAt(value: unknown, at: string): Category {
  const row = objectAt(value, at);
  return {
    id: stringAt(row.id, `${at}.id`),
    name: stringAt(row.name, `${at}.name`),
    archived: booleanAt(row.archived, `${at}.archived`),
  };
}

/** Categories gained an optional key; sources deliberately keep the older plain named-row parser. */
function categoryAt(value: unknown, at: string): Category {
  const row = objectAt(value, at);
  const iconKey = row.iconKey;
  if (iconKey !== undefined && iconKey !== null && (typeof iconKey !== 'string' || iconKey.trim() === '')) {
    fail(`${at}.iconKey не є непорожньою іконкою категорії`);
  }
  return {
    id: stringAt(row.id, `${at}.id`),
    name: stringAt(row.name, `${at}.name`),
    archived: booleanAt(row.archived, `${at}.archived`),
    ...(iconKey === undefined || iconKey === null ? {} : { iconKey }),
  };
}

function ruleAt(value: unknown, at: string): BackupRule {
  const row = objectAt(value, at);
  return {
    id: stringAt(row.id, `${at}.id`),
    ...optionalString(row, 'merchant', at),
    ...optionalString(row, 'merchantId', at),
    ...(row.mcc === undefined || row.mcc === null ? {} : { mcc: integerAt(row.mcc, `${at}.mcc`) }),
    ...optionalString(row, 'categoryId', at),
    ...optionalString(row, 'toAccountId', at),
    createdAtMs: integerAt(row.createdAtMs, `${at}.createdAtMs`),
  };
}

function merchantAt(value: unknown, at: string): BackupMerchant {
  const row = objectAt(value, at);
  return {
    id: stringAt(row.id, `${at}.id`),
    name: stringAt(row.name, `${at}.name`),
    createdAtMs: integerAt(row.createdAtMs, `${at}.createdAtMs`),
  };
}

function merchantSpellingAt(value: unknown, at: string): BackupMerchantSpelling {
  const row = objectAt(value, at);
  return {
    id: stringAt(row.id, `${at}.id`),
    merchantId: stringAt(row.merchantId, `${at}.merchantId`),
    spelling: stringAt(row.spelling, `${at}.spelling`),
    createdAtMs: integerAt(row.createdAtMs, `${at}.createdAtMs`),
  };
}

function limitAt(value: unknown, at: string): CategoryLimit {
  const row = objectAt(value, at);
  return {
    categoryId: stringAt(row.categoryId, `${at}.categoryId`),
    amount: moneyAt(row.amount, `${at}.amount`),
  };
}

/**
 * A ціль, in either format version (design D10). Format 2 names a `accountIds` склад and may omit
 * the дата; format 1 named exactly one `accountId` and always a дата, and its ціль restores as a
 * склад of that one рахунок — keeping its назва, target, currency and дата, and therefore the
 * progress it showed on the phone the бекап came from.
 *
 * The two are told apart by which key is present, not by the envelope's version number: a file is
 * read for what it holds, and a ціль that names neither is a ціль with no склад, which the
 * self-consistency check refuses by name rather than silently restoring as empty.
 */
function goalAt(value: unknown, at: string): AccumulationGoal {
  const row = objectAt(value, at);
  const composition =
    row.accountIds === undefined && row.accountId !== undefined
      ? [stringAt(row.accountId, `${at}.accountId`)]
      : listAt(row, 'accountIds', (id, idAt) => stringAt(id, idAt)).map((id, index) =>
          stringAt(id, `${at}.accountIds[${index}]`),
        );
  return {
    id: stringAt(row.id, `${at}.id`),
    name: stringAt(row.name, `${at}.name`),
    target: moneyAt(row.target, `${at}.target`),
    // Absent stays absent: a ціль with no дата must not come back carrying one.
    ...(row.deadline === undefined || row.deadline === null
      ? {}
      : { deadline: dateAt(row.deadline, `${at}.deadline`) }),
    accountIds: composition,
  };
}

/**
 * One транзакція, written per type rather than spread from a generic object — the same shape
 * `import-repo.ts` keeps, and for the same reason: a type that gains a field later fails to
 * compile here instead of silently restoring a транзакція with half of it missing.
 */
function transactionAt(value: unknown, at: string): Transaction {
  const row = objectAt(value, at);
  const id = stringAt(row.id, `${at}.id`);
  const date = dateAt(row.date, `${at}.date`);
  // What the транзакція says rather than what it is: its опис, and the MCC its import named — a
  // code that is not a whole number is one no bank sends, so the бекап contradicts itself.
  const informational = {
    ...optionalString(row, 'description', at),
    ...(row.mcc === undefined || row.mcc === null ? {} : { mcc: integerAt(row.mcc, `${at}.mcc`) }),
  };
  switch (row.type) {
    case 'expense': {
      const original =
        row.originalAmount === undefined || row.originalAmount === null
          ? {}
          : { originalAmount: moneyAt(row.originalAmount, `${at}.originalAmount`) };
      return {
        type: 'expense',
        id,
        date,
        accountId: stringAt(row.accountId, `${at}.accountId`),
        amount: moneyAt(row.amount, `${at}.amount`),
        categoryId: stringAt(row.categoryId, `${at}.categoryId`),
        ...original,
        ...informational,
      };
    }
    case 'income':
      return {
        type: 'income',
        id,
        date,
        accountId: stringAt(row.accountId, `${at}.accountId`),
        amount: moneyAt(row.amount, `${at}.amount`),
        sourceId: stringAt(row.sourceId, `${at}.sourceId`),
        ...informational,
      };
    case 'refund':
      return {
        type: 'refund',
        id,
        date,
        accountId: stringAt(row.accountId, `${at}.accountId`),
        amount: moneyAt(row.amount, `${at}.amount`),
        categoryId: stringAt(row.categoryId, `${at}.categoryId`),
        ...informational,
      };
    case 'correction':
      return {
        type: 'correction',
        id,
        date,
        accountId: stringAt(row.accountId, `${at}.accountId`),
        amount: moneyAt(row.amount, `${at}.amount`),
        ...informational,
      };
    case 'transfer':
      return {
        type: 'transfer',
        id,
        date,
        fromAccountId: stringAt(row.fromAccountId, `${at}.fromAccountId`),
        toAccountId: stringAt(row.toAccountId, `${at}.toAccountId`),
        left: moneyAt(row.left, `${at}.left`),
        arrived: moneyAt(row.arrived, `${at}.arrived`),
        ...optionalTrue(row, 'awaitingCounterpartIncome', at),
        ...informational,
      };
    default:
      return fail(`${at}.type не є видом транзакції`);
  }
}

function backupTransactionAt(value: unknown, at: string): BackupTransaction {
  const row = objectAt(value, at);
  return {
    transaction: transactionAt(row.transaction, `${at}.transaction`),
    storedAtMs: integerAt(row.storedAtMs, `${at}.storedAtMs`),
  };
}

function monobankAccountAt(value: unknown, at: string): BackupMonobankAccount {
  const row = objectAt(value, at);
  if (row.kind !== 'card' && row.kind !== 'jar') {
    fail(`${at}.kind не є ні карткою, ні банкою`);
  }
  return {
    id: stringAt(row.id, `${at}.id`),
    kind: row.kind,
    name: stringAt(row.name, `${at}.name`),
    currency: stringAt(row.currency, `${at}.currency`),
    bankBalance: moneyAt(row.bankBalance, `${at}.bankBalance`),
    obtainedAtMs: integerAt(row.obtainedAtMs, `${at}.obtainedAtMs`),
  };
}

function monobankLinkAt(value: unknown, at: string): BackupMonobankLink {
  const row = objectAt(value, at);
  const lastSyncedAt = row.lastSyncedAtMs;
  return {
    monobankAccountId: stringAt(row.monobankAccountId, `${at}.monobankAccountId`),
    accountId: stringAt(row.accountId, `${at}.accountId`),
    syncStartDate: dateAt(row.syncStartDate, `${at}.syncStartDate`),
    cursorMs: integerAt(row.cursorMs, `${at}.cursorMs`),
    // Named or not named, never invented: an older бекап and a link that never synced both leave
    // it out, and both restore as one that has never synced.
    ...(lastSyncedAt === undefined || lastSyncedAt === null
      ? {}
      : { lastSyncedAtMs: integerAt(lastSyncedAt, `${at}.lastSyncedAtMs`) }),
  };
}

function importedItemAt(value: unknown, at: string): BackupImportedItem {
  const row = objectAt(value, at);
  return {
    monobankAccountId: stringAt(row.monobankAccountId, `${at}.monobankAccountId`),
    itemId: stringAt(row.itemId, `${at}.itemId`),
  };
}

/**
 * The нагадування's setting, checked here rather than left to the table's CHECK: a бекап naming
 * 25:70 is refused in words the owner reads, not as a rolled-back transaction they cannot act on.
 */
function reminderAt(value: unknown, at: string): BackupReminder {
  const row = objectAt(value, at);
  const time = objectAt(row.time, `${at}.time`);
  const hour = integerAt(time.hour, `${at}.time.hour`);
  const minute = integerAt(time.minute, `${at}.time.minute`);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    fail(`${at} не є часом доби`);
  }
  return { enabled: booleanAt(row.enabled, `${at}.enabled`), time: { hour, minute } };
}

/**
 * One dashboard layout entry, checked for shape only — `id` may be anything this app does not
 * know and the same id may repeat. Structural validity is the whole of what a бекап promises
 * here; `normalizeDashboardLayout` is what turns saved order and state into something an
 * installed version renders (design D7).
 */
function dashboardLayoutItemAt(value: unknown, at: string): { id: string; visible: boolean } {
  const row = objectAt(value, at);
  return { id: stringAt(row.id, `${at}.id`), visible: booleanAt(row.visible, `${at}.visible`) };
}

function dashboardLayoutAt(value: unknown, at: string): BackupDashboardLayout {
  const row = objectAt(value, at);
  const schemaVersion = integerAt(row.schemaVersion, `${at}.schemaVersion`);
  if (schemaVersion < 1) {
    fail(`${at}.schemaVersion не є додатним цілим числом`);
  }
  return { schemaVersion, items: listAt(row, 'items', dashboardLayoutItemAt) };
}

/** An optional сума: absent stays absent, exactly as `optionalString` keeps an absent name away. */
function optionalMoney(row: Record<string, unknown>, key: string, at: string): Record<string, Money> {
  const value = row[key];
  return value === undefined || value === null ? {} : { [key]: moneyAt(value, `${at}.${key}`) };
}

/**
 * A flag that is present only when `true` — `awaitingCounterpartIncome`'s own shape, since the
 * domain never represents "awaits nothing" as `false`, only as the key's absence.
 */
function optionalTrue(row: Record<string, unknown>, key: string, at: string): Record<string, true> {
  const value = row[key];
  if (value === undefined || value === null) return {};
  if (value !== true) fail(`${at}.${key} не є так`);
  return { [key]: true };
}

function receiptAt(value: unknown, at: string): BackupReceipt {
  const row = objectAt(value, at);
  if (row.dialect !== 'prro' && row.dialect !== 'rro') {
    fail(`${at}.dialect не є діалектом фіскального документа`);
  }
  if (row.kind !== 'sale' && row.kind !== 'return') {
    fail(`${at}.kind не є ні чеком продажу, ні чеком повернення`);
  }
  // The only way a чек arrives in this version. A бекап naming another is from a version that
  // knows something this one does not, and is refused in words rather than by a CHECK.
  if (row.acquisition !== 'qr_scan') {
    fail(`${at}.acquisition не є способом, яким цей застосунок отримує чек`);
  }
  return {
    id: stringAt(row.id, `${at}.id`),
    transactionId: stringAt(row.transactionId, `${at}.transactionId`),
    registrarNumber: stringAt(row.registrarNumber, `${at}.registrarNumber`),
    fiscalNumber: stringAt(row.fiscalNumber, `${at}.fiscalNumber`),
    issuedDate: dateAt(row.issuedDate, `${at}.issuedDate`),
    issuedTime: stringAt(row.issuedTime, `${at}.issuedTime`),
    dialect: row.dialect,
    kind: row.kind,
    total: moneyAt(row.total, `${at}.total`),
    ...optionalString(row, 'sellerName', at),
    ...optionalString(row, 'pointName', at),
    acquisition: 'qr_scan',
    fetchedAtMs: integerAt(row.fetchedAtMs, `${at}.fetchedAtMs`),
    snapshot: stringAt(row.snapshot, `${at}.snapshot`),
  };
}

function receiptItemAt(value: unknown, at: string): BackupReceiptItem {
  const row = objectAt(value, at);
  return {
    id: stringAt(row.id, `${at}.id`),
    receiptId: stringAt(row.receiptId, `${at}.receiptId`),
    line: integerAt(row.line, `${at}.line`),
    rawName: stringAt(row.rawName, `${at}.rawName`),
    quantityThousandths: integerAt(row.quantityThousandths, `${at}.quantityThousandths`),
    ...optionalString(row, 'unit', at),
    ...optionalMoney(row, 'unitPrice', at),
    lineTotal: moneyAt(row.lineTotal, `${at}.lineTotal`),
    ...optionalMoney(row, 'discount', at),
    ...optionalString(row, 'barcode', at),
    ...optionalString(row, 'uktzed', at),
    ...optionalString(row, 'code', at),
  };
}

function achievementAt(value: unknown, at: string): BackupAchievement {
  const row = objectAt(value, at);
  const seen = row.seenAtMs;
  return {
    key: stringAt(row.key, `${at}.key`),
    template: stringAt(row.template, `${at}.template`),
    achievedOn: dateAt(row.achievedOn, `${at}.achievedOn`),
    recordedAtMs: integerAt(row.recordedAtMs, `${at}.recordedAtMs`),
    ...(seen === undefined || seen === null
      ? {}
      : { seenAtMs: integerAt(seen, `${at}.seenAtMs`) }),
    // Read back as the text it was written as: the свідчення is a value for display, and this file
    // deliberately does not know what shape it holds.
    evidence: stringAt(row.evidence, `${at}.evidence`),
  };
}

function challengeDecisionAt(value: unknown, at: string): BackupChallengeDecision {
  const row = objectAt(value, at);
  if (row.decision !== 'accepted' && row.decision !== 'dismissed') {
    fail(`${at}.decision не є ні прийняттям, ні відхиленням виклика`);
  }
  return {
    key: stringAt(row.key, `${at}.key`),
    decision: row.decision,
    decidedAtMs: integerAt(row.decidedAtMs, `${at}.decidedAtMs`),
  };
}

function normAt(value: unknown, at: string): BackupSpendingNorm {
  const row = objectAt(value, at);
  const amount = moneyAt(row.amount, `${at}.amount`);
  // Storage refuses a non-positive норма by CHECK; a hand-edited file is refused here, in the
  // owner's words, before storage is touched at all.
  if (amount.amount <= 0) {
    fail(`${at}.amount не є місячною нормою витрат: сума має бути більшою за нуль`);
  }
  return { amount, confirmedAtMs: integerAt(row.confirmedAtMs, `${at}.confirmedAtMs`) };
}

function investmentValueAt(value: unknown, at: string): BackupInvestmentValue {
  const row = objectAt(value, at);
  const amount = moneyAt(row.amount, `${at}.amount`);
  // Storage refuses a negative вартість by CHECK; a hand-edited file is refused here, in the
  // owner's words, before storage is touched at all. Zero is not refused: an інвестиція may be
  // worth nothing, never less than nothing.
  if (amount.amount < 0) {
    fail(`${at}.amount не є поточною вартістю: сума не може бути меншою за нуль`);
  }
  return {
    accountId: stringAt(row.accountId, `${at}.accountId`),
    amount,
    asOf: dateAt(row.asOf, `${at}.asOf`),
  };
}

function installmentAt(value: unknown, at: string): Installment {
  const row = objectAt(value, at);
  return {
    id: stringAt(row.id, `${at}.id`),
    name: stringAt(row.name, `${at}.name`),
    total: integerAt(row.total, `${at}.total`),
    partsCount: integerAt(row.partsCount, `${at}.partsCount`),
    part: integerAt(row.part, `${at}.part`),
    firstDue: dateAt(row.firstDue, `${at}.firstDue`),
    debitAccountId: stringAt(row.debitAccountId, `${at}.debitAccountId`),
    paidBefore: integerAt(row.paidBefore, `${at}.paidBefore`),
    ...optionalString(row, 'categoryId', at),
    recordedAt: integerAt(row.recordedAt, `${at}.recordedAt`),
    ...(row.closedOn === undefined || row.closedOn === null
      ? {}
      : { closedOn: dateAt(row.closedOn, `${at}.closedOn`) }),
  };
}

function installmentPartAt(value: unknown, at: string): InstallmentPartMark {
  const row = objectAt(value, at);
  return {
    installmentId: stringAt(row.installmentId, `${at}.installmentId`),
    number: integerAt(row.number, `${at}.number`),
  };
}

function installmentLinkAt(value: unknown, at: string): InstallmentPartLink {
  const row = objectAt(value, at);
  return {
    ...installmentPartAt(value, at),
    transactionId: stringAt(row.transactionId, `${at}.transactionId`),
  };
}

function installmentsAt(value: unknown, at: string): BackupInstallments {
  const row = objectAt(value, at);
  return {
    plans: listAt(row, 'plans', installmentAt),
    links: listAt(row, 'links', installmentLinkAt),
    marks: listAt(row, 'marks', installmentPartAt),
    refusals: listAt(row, 'refusals', installmentLinkAt),
    reminderEnabled: booleanAt(row.reminderEnabled, `${at}.reminderEnabled`),
  };
}

function templateChoiceAt(value: unknown, at: string): BackupTemplateChoice {
  const row = objectAt(value, at);
  return {
    groupId: stringAt(row.groupId, `${at}.groupId`),
    categoryId: row.categoryId === null ? null : stringAt(row.categoryId, `${at}.categoryId`),
  };
}

function watchAt(value: unknown, at: string): BackupWatch {
  const row = objectAt(value, at);
  return {
    packageName: stringAt(row.packageName, `${at}.packageName`),
    accountId: stringAt(row.accountId, `${at}.accountId`),
  };
}

/**
 * The untyped body of a picked file as the owner's state, or a `BackupProblem` naming the first
 * thing that was not what a бекап holds. Every list a бекап does not name comes back empty.
 */
export function parseState(value: unknown): BackupState {
  const data = objectAt(value, 'вміст');
  const committedAt = data.saldoImportCommittedAtMs;
  return {
    accounts: listAt(data, 'accounts', accountAt),
    categories: listAt(data, 'categories', categoryAt),
    sources: listAt(data, 'sources', namedAt),
    // A бекап written before продавці existed names neither list, and restores with none — every
    // правило matching by its pattern or MCC, exactly as on the phone that wrote it.
    ...(data.merchants === undefined || data.merchants === null
      ? {}
      : { merchants: listAt(data, 'merchants', merchantAt) }),
    ...(data.merchantSpellings === undefined || data.merchantSpellings === null
      ? {}
      : { merchantSpellings: listAt(data, 'merchantSpellings', merchantSpellingAt) }),
    rules: listAt(data, 'rules', ruleAt),
    limits: listAt(data, 'limits', limitAt),
    goals: listAt(data, 'goals', goalAt),
    transactions: listAt(data, 'transactions', backupTransactionAt),
    ...(committedAt === undefined || committedAt === null
      ? {}
      : {
          saldoImportCommittedAtMs: integerAt(committedAt, 'saldoImportCommittedAtMs'),
        }),
    monobankAccounts: listAt(data, 'monobankAccounts', monobankAccountAt),
    monobankLinks: listAt(data, 'monobankLinks', monobankLinkAt),
    monobankImportedItems: listAt(data, 'monobankImportedItems', importedItemAt),
    watches: listAt(data, 'watches', watchAt),
    ...(data.reminder === undefined || data.reminder === null
      ? {}
      : { reminder: reminderAt(data.reminder, 'reminder') }),
    // A бекап written before чеки existed names neither list, and comes back with none — the same
    // way `watches` already do (design D5).
    receipts: listAt(data, 'receipts', receiptAt),
    receiptItems: listAt(data, 'receiptItems', receiptItemAt),
    achievements: listAt(data, 'achievements', achievementAt),
    challengeDecisions: listAt(data, 'challengeDecisions', challengeDecisionAt),
    norms: listAt(data, 'norms', normAt),
    // A бекап written before поточні вартості existed names none, and comes back with none — the
    // same way `watches` and the чеки already do (design D5).
    investmentValues: listAt(data, 'investmentValues', investmentValueAt),
    // A бекап written before dashboard layout existed names none, and restores to the current
    // default the same way `reminder`'s absence restores to off (design D7).
    ...(data.dashboardLayout === undefined || data.dashboardLayout === null
      ? {}
      : { dashboardLayout: dashboardLayoutAt(data.dashboardLayout, 'dashboardLayout') }),
    // A plain on or off, or the бекап is refused whole (backup-file, "A malformed vibration
    // preference refuses the бекап").
    ...(data.haptics === undefined || data.haptics === null
      ? {}
      : {
          haptics: {
            enabled: booleanAt(objectAt(data.haptics, 'haptics').enabled, 'haptics.enabled'),
          },
        }),
    // A бекап written before розстрочки existed names none, and restores to none with the
    // нагадування про платіж on (backup-file, "A бекап written before розстрочки existed still
    // restores").
    ...(data.installments === undefined || data.installments === null
      ? {}
      : { installments: installmentsAt(data.installments, 'installments') }),
    // A бекап written before the шаблон mapping existed names none, and restores to every базова
    // категорія following its типова категорія (backup-file, "A бекап written before the mapping
    // existed restores the defaults").
    ...(data.templateChoices === undefined || data.templateChoices === null
      ? {}
      : { templateChoices: listAt(data, 'templateChoices', templateChoiceAt) }),
  };
}

/**
 * The продавці checked against themselves (backup-file, "A бекап carries продавці, a правило's
 * продавець and a транзакція's MCC"): every назва not blank and unique once folded, every написання
 * stored trimmed and folded, held once, by a продавець the бекап carries, and every продавець
 * holding at least one. Storage cannot say «at least one написання», so this is the one guard a
 * restore has for it. Returns the ids of the продавці, for the правила to be checked against.
 */
function checkMerchants(state: BackupState): ReadonlySet<string> {
  const ids = new Map<string, string>();
  const names = new Map<string, string>();
  for (const m of state.merchants ?? []) {
    const what = `продавець «${m.name}»`;
    if (m.name.trim() === '') fail(`продавець «${m.id}» не має назви`);
    const key = merchantNameKey(m.name);
    const twin = names.get(key);
    if (twin !== undefined) fail(`продавці «${twin}» і «${m.name}» мають одну назву`);
    names.set(key, m.name);
    if (ids.has(m.id)) fail(`${what} названий двічі`);
    ids.set(m.id, m.name);
  }
  const held = new Set<string>();
  const spellings = new Set<string>();
  for (const s of state.merchantSpellings ?? []) {
    const what = `написання «${s.spelling}»`;
    if (!ids.has(s.merchantId)) fail(`${what} посилається на продавця, якого в бекапі немає`);
    if (s.spelling.trim() === '') fail(`написання продавця «${ids.get(s.merchantId)}» порожнє`);
    if (foldSpelling(s.spelling) !== s.spelling) {
      fail(`${what} не збережене обрізаним і малими літерами`);
    }
    if (spellings.has(s.spelling)) fail(`${what} назване двічі`);
    spellings.add(s.spelling);
    held.add(s.merchantId);
  }
  for (const [id, name] of ids) {
    if (!held.has(id)) fail(`продавець «${name}» не має жодного написання`);
  }
  return new Set(ids.keys());
}

/**
 * The розстрочки checked against the rest of the бекап (backup-file, "A бекап carries the
 * розстрочки"): each names a UAH рахунок списання and a категорія the бекап holds and nothing the
 * domain refuses — an archived рахунок or категорія excepted, since a card may be archived after
 * its розстрочка was recorded — and every платіж state names a платіж that exists. A link names a
 * транзакція the бекап holds that is a UAH витрата on that рахунок, linked to no other платіж.
 */
function checkInstallments(
  state: BackupState,
  accounts: ReadonlyMap<string, Account>,
  categories: ReadonlySet<string>,
): void {
  const section = state.installments;
  if (!section) {
    return;
  }
  const plans = new Map<string, Installment>();
  for (const plan of section.plans) {
    const what = `розстрочка «${plan.name}»`;
    if (plans.has(plan.id)) {
      fail(`${what} названа двічі`);
    }
    plans.set(plan.id, plan);
    const account = accounts.get(plan.debitAccountId);
    if (!account) {
      fail(`${what} посилається на рахунок, якого в бекапі немає`);
    }
    if (account.currency !== INSTALLMENT_CURRENCY) {
      fail(`${what} списується з рахунку «${account.name}», який не в гривнях`);
    }
    if (plan.categoryId !== undefined && !categories.has(plan.categoryId)) {
      fail(`${what} посилається на категорію, якої в бекапі немає`);
    }
    const refusal = installmentRefusal(plan, {
      account,
      ...(plan.categoryId === undefined ? {} : { category: { name: plan.categoryId, archived: false } }),
      existing: {
        debitAccountId: plan.debitAccountId,
        ...(plan.categoryId === undefined ? {} : { categoryId: plan.categoryId }),
      },
    });
    if (refusal) {
      fail(`${what}: ${refusal.message}`);
    }
  }
  const planOf = (part: InstallmentPartMark, kind: string): Installment => {
    const plan = plans.get(part.installmentId);
    if (!plan) {
      fail(`${kind} посилається на розстрочку, якої в бекапі немає`);
    }
    if (part.number < 1 || part.number > plan.partsCount) {
      fail(`${kind} розстрочки «${plan.name}» називає платіж ${part.number}, якого немає`);
    }
    return plan;
  };
  const transactions = new Map(state.transactions.map((entry) => [entry.transaction.id, entry.transaction]));
  const linkedParts = new Set<string>();
  const linkedTransactions = new Set<string>();
  for (const link of section.links) {
    const plan = planOf(link, 'списання');
    const what = `списання платежу ${link.number} розстрочки «${plan.name}»`;
    const key = `${link.installmentId}|${link.number}`;
    if (linkedParts.has(key)) {
      fail(`${what} назване двічі`);
    }
    linkedParts.add(key);
    if (linkedTransactions.has(link.transactionId)) {
      fail(`транзакція «${link.transactionId}» є списанням двох платежів`);
    }
    linkedTransactions.add(link.transactionId);
    const t = transactions.get(link.transactionId);
    if (!t) {
      fail(`${what} посилається на транзакцію, якої в бекапі немає`);
    }
    const candidate = {
      id: t.id,
      type: t.type,
      date: t.date,
      createdAt: 0,
      ...(t.type === 'transfer' ? {} : { accountId: t.accountId, amount: t.amount }),
    };
    if (!isDebitOn(candidate, plan.debitAccountId)) {
      fail(`${what} не є витратою в гривнях з рахунку списання`);
    }
  }
  for (const mark of section.marks) {
    planOf(mark, 'позначка сплаченого');
  }
  for (const refused of section.refusals) {
    planOf(refused, 'відвʼязане списання');
    if (!transactions.has(refused.transactionId)) {
      fail(`відвʼязане списання посилається на транзакцію, якої в бекапі немає`);
    }
  }
}

/**
 * What a бекап holds, checked against itself: nothing may name a рахунок, категорія, джерело or
 * monobank account the бекап does not also hold, and a ціль lives in its рахунок's currency.
 *
 * It runs before storage is touched at all — the transaction of `replaceAll` is the safety net,
 * not the validation, because a foreign key cannot say *which* транзакція pointed outside the file
 * in words the owner reads.
 */
export function checkConsistent(state: BackupState): void {
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));
  const categories = new Set(state.categories.map((c) => c.id));
  const sources = new Set(state.sources.map((s) => s.id));
  const monobankAccounts = new Set(state.monobankAccounts.map((a) => a.id));

  const needsAccount = (id: string, what: string): void => {
    if (!accounts.has(id)) fail(`${what} посилається на рахунок, якого в бекапі немає`);
  };
  const needsCategory = (id: string, what: string): void => {
    if (!categories.has(id)) fail(`${what} посилається на категорію, якої в бекапі немає`);
  };

  for (const entry of state.transactions) {
    const t = entry.transaction;
    const what = `транзакція «${t.id}»`;
    if (t.type === 'transfer') {
      needsAccount(t.fromAccountId, what);
      needsAccount(t.toAccountId, what);
    } else {
      needsAccount(t.accountId, what);
      if (t.type === 'expense' || t.type === 'refund') needsCategory(t.categoryId, what);
      if (t.type === 'income' && !sources.has(t.sourceId)) {
        fail(`${what} посилається на джерело, якого в бекапі немає`);
      }
    }
  }

  const merchants = checkMerchants(state);
  for (const rule of state.rules) {
    const what = `правило «${rule.id}»`;
    if (rule.merchantId !== undefined) {
      if (!merchants.has(rule.merchantId)) {
        fail(`${what} посилається на продавця, якого в бекапі немає`);
      }
      // Any pattern at all beside a продавець, even an empty one: storage's CHECKs would refuse it
      // inside the restore by a constraint name, and this says it in words before anything moves.
      if (rule.merchant !== undefined) {
        fail(`${what} називає і текст опису, і продавця`);
      }
    }
    const hasCategory = rule.categoryId !== undefined;
    const hasAccount = rule.toAccountId !== undefined;
    if (hasCategory === hasAccount) {
      fail(
        hasCategory
          ? `${what} називає і категорію, і рахунок призначення`
          : `${what} не називає ні категорії, ні рахунку призначення`,
      );
    }
    if (hasCategory) {
      needsCategory(rule.categoryId!, what);
    } else {
      needsAccount(rule.toAccountId!, what);
    }
  }
  for (const limit of state.limits) {
    needsCategory(limit.categoryId, `ліміт категорії «${limit.categoryId}»`);
  }
  for (const goal of state.goals) {
    const what = `ціль «${goal.name}»`;
    for (const accountId of goal.accountIds) {
      needsAccount(accountId, what);
    }
    // The same rule the form and the repository keep, asked here so a hand-edited file cannot
    // smuggle in a склад that is empty, names a рахунок twice, or carries a currency no rate
    // reaches (design D5).
    const problem = compositionProblem(
      goal.target.currency,
      goal.accountIds.map((id) => ({ id, currency: accounts.get(id)!.currency })),
    );
    switch (problem?.kind) {
      case undefined:
        break;
      case 'empty':
        fail(`${what} не має жодного рахунку`);
        break;
      case 'duplicate':
        fail(`${what} називає рахунок «${accounts.get(problem.accountId)!.name}» двічі`);
        break;
      case 'mixed':
        fail(
          `${what} стоїть на рахунках у різних валютах (${problem.currencies.join(', ')}), ` +
            `тож вона може бути тільки в UAH, а не в ${goal.target.currency}`,
        );
        break;
      case 'foreign':
        fail(
          `${what} — у ${goal.target.currency}, а її рахунки — у ${problem.shared}`,
        );
        break;
    }
  }
  for (const watch of state.watches) {
    needsAccount(watch.accountId, `відстежуваний застосунок «${watch.packageName}»`);
  }
  // The вартість contradictions: the same three `investments-repo` refuses, asked here so the
  // owner reads which рахунок is wrong rather than watching a restore roll back on a constraint.
  const valued = new Set<string>();
  for (const value of state.investmentValues) {
    const what = `поточна вартість рахунку «${accounts.get(value.accountId)?.name ?? value.accountId}»`;
    needsAccount(value.accountId, what);
    const account = accounts.get(value.accountId)!;
    if (account.kind !== 'investment') {
      fail(`${what} стоїть на рахунку, який не є інвестиційним`);
    }
    if (value.amount.currency !== account.currency) {
      fail(`${what} — у ${value.amount.currency}, а сам рахунок — у ${account.currency}`);
    }
    if (valued.has(value.accountId)) {
      fail(`${what} названа двічі — рахунок має щонайбільше одну поточну вартість`);
    }
    valued.add(value.accountId);
  }
  checkInstallments(state, accounts, categories);
  // One choice per базова категорія, and a категорія it names is one this бекап carries — a
  // dangling one makes the whole бекап contradict itself. A group id this app's шаблон does not
  // carry is accepted and kept: an app downgrade must not throw the owner's choices away.
  const chosen = new Set<string>();
  for (const choice of state.templateChoices ?? []) {
    const what = `вибір для базової категорії «${choice.groupId}»`;
    if (chosen.has(choice.groupId)) fail(`${what} названий двічі`);
    chosen.add(choice.groupId);
    if (choice.categoryId !== null) needsCategory(choice.categoryId, what);
  }
  for (const account of state.monobankAccounts) {
    if (account.bankBalance.currency !== account.currency) {
      fail(`рахунок monobank «${account.name}» тримає баланс в іншій валюті, ніж сам рахунок`);
    }
  }
  for (const link of state.monobankLinks) {
    const what = `звʼязок рахунку monobank «${link.monobankAccountId}»`;
    needsAccount(link.accountId, what);
    if (!monobankAccounts.has(link.monobankAccountId)) {
      fail(`${what} посилається на рахунок monobank, якого в бекапі немає`);
    }
  }
  for (const item of state.monobankImportedItems) {
    if (!monobankAccounts.has(item.monobankAccountId)) {
      fail(
        `імпортований елемент «${item.itemId}» посилається на рахунок monobank, якого в бекапі немає`,
      );
    }
  }

  // The чек contradictions. Each is a constraint storage would also refuse — the point of naming
  // them here is that the owner reads *which* чек is wrong before anything local is touched,
  // rather than watching a restore roll back on a foreign key.
  const transactionIds = new Set(state.transactions.map((entry) => entry.transaction.id));
  const receipts = new Set<string>();
  const onTransaction = new Set<string>();
  const identities = new Set<string>();
  for (const receipt of state.receipts) {
    const what = `чек «${receipt.fiscalNumber}»`;
    if (!transactionIds.has(receipt.transactionId)) {
      fail(`${what} посилається на транзакцію, якої в бекапі немає`);
    }
    if (onTransaction.has(receipt.transactionId)) {
      fail(`${what} — другий чек на одній транзакції`);
    }
    // Through the domain's own key, not a second copy of it: «what makes a чек one чек» is
    // decided in `fiscal-receipt.ts` and read here.
    const identity = identityKey(receiptIdentity(receipt));
    if (identities.has(identity)) {
      fail(`${what} записаний двічі під тими самими реквізитами`);
    }
    if (receipt.total.currency !== 'UAH') {
      fail(`${what} має суму не в гривнях`);
    }
    onTransaction.add(receipt.transactionId);
    identities.add(identity);
    receipts.add(receipt.id);
  }
  for (const item of state.receiptItems) {
    if (!receipts.has(item.receiptId)) {
      fail(`позиція «${item.rawName}» посилається на чек, якого в бекапі немає`);
    }
  }
}
