import type { Account, AccountKind } from '../domain/account';
import { identityKey, receiptIdentity } from '../domain/fiscal-receipt';
import type { Category, Source } from '../domain/category';
import type { CategoryLimit } from '../domain/limits';
import type { Goal } from '../domain/goals';
import { money, type CurrencyCode, type Money } from '../domain/money';
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
export const BACKUP_FORMAT_VERSION = 1;

/**
 * The number of committed migrations a бекап is written under — the storage shape it saw.
 *
 * It is a hand-kept constant and `format.test.ts` fails unless it equals the number of entries in
 * `drizzle/meta/_journal.json`. That tripwire is the point, not the number: adding a migration
 * breaks `verify` until someone opens this file and asks whether a бекап still holds everything it
 * should. A бекап naming a higher one is refused; a lower one is restored (design D5).
 */
export const BACKUP_SCHEMA_VERSION = 13;

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
 * `daily_reminder` is here: FR-B1's «налаштування без секретів», so a restored phone reminds the
 * owner as the old one did (design D8).
 *
 * `entry_defaults` is deliberately absent, and it is the one exclusion that is not about secrecy:
 * it holds which рахунок the entry form on *this* phone opens on — a habit the device learned from
 * the owner's last hand-made запис, not a setting they chose and not their money. A restored phone
 * learns it again the first time they record by hand, and until then the form opens with nothing
 * pre-chosen, exactly as a phone that has never recorded by hand does.
 */
export const BACKUP_TABLES: readonly string[] = [
  'accounts',
  'categories',
  'sources',
  'rules',
  'category_limits',
  'goals',
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
];

/** A правило, with the `createdAt` that breaks ties between two equally specific ones as epoch ms. */
export interface BackupRule {
  readonly id: string;
  readonly merchant?: string;
  readonly mcc?: number;
  readonly categoryId: string;
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
 * The owner's whole state, in the shape a бекап carries and storage restores. Every instant is
 * epoch milliseconds rather than a `Date`, because this value is written to a file and read back
 * from one: a shape that survives `JSON.parse` unchanged needs no second mapping layer to be the
 * same value on both sides.
 */
export interface BackupState {
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly sources: readonly Source[];
  readonly rules: readonly BackupRule[];
  readonly limits: readonly CategoryLimit[];
  readonly goals: readonly Goal[];
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
 */
function moneyAt(value: unknown, at: string): Money {
  const row = objectAt(value, at);
  try {
    return money(integerAt(row.amount, `${at}.amount`), stringAt(row.currency, `${at}.currency`));
  } catch (error) {
    if (error instanceof BackupProblem) throw error;
    return fail(`${at} не є сумою в мінорних одиницях із кодом валюти`);
  }
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

function ruleAt(value: unknown, at: string): BackupRule {
  const row = objectAt(value, at);
  return {
    id: stringAt(row.id, `${at}.id`),
    ...optionalString(row, 'merchant', at),
    ...(row.mcc === undefined || row.mcc === null ? {} : { mcc: integerAt(row.mcc, `${at}.mcc`) }),
    categoryId: stringAt(row.categoryId, `${at}.categoryId`),
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

function goalAt(value: unknown, at: string): Goal {
  const row = objectAt(value, at);
  return {
    id: stringAt(row.id, `${at}.id`),
    name: stringAt(row.name, `${at}.name`),
    target: moneyAt(row.target, `${at}.target`),
    deadline: dateAt(row.deadline, `${at}.deadline`),
    accountId: stringAt(row.accountId, `${at}.accountId`),
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
  const description = optionalString(row, 'description', at);
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
        ...description,
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
        ...description,
      };
    case 'refund':
      return {
        type: 'refund',
        id,
        date,
        accountId: stringAt(row.accountId, `${at}.accountId`),
        amount: moneyAt(row.amount, `${at}.amount`),
        categoryId: stringAt(row.categoryId, `${at}.categoryId`),
        ...description,
      };
    case 'correction':
      return {
        type: 'correction',
        id,
        date,
        accountId: stringAt(row.accountId, `${at}.accountId`),
        amount: moneyAt(row.amount, `${at}.amount`),
        ...description,
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
        ...description,
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

/** An optional сума: absent stays absent, exactly as `optionalString` keeps an absent name away. */
function optionalMoney(row: Record<string, unknown>, key: string, at: string): Record<string, Money> {
  const value = row[key];
  return value === undefined || value === null ? {} : { [key]: moneyAt(value, `${at}.${key}`) };
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
    categories: listAt(data, 'categories', namedAt),
    sources: listAt(data, 'sources', namedAt),
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
  };
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

  for (const rule of state.rules) {
    needsCategory(rule.categoryId, `правило «${rule.id}»`);
  }
  for (const limit of state.limits) {
    needsCategory(limit.categoryId, `ліміт категорії «${limit.categoryId}»`);
  }
  for (const goal of state.goals) {
    const what = `ціль «${goal.name}»`;
    needsAccount(goal.accountId, what);
    const account = accounts.get(goal.accountId);
    if (account && account.currency !== goal.target.currency) {
      fail(
        `${what} — у ${goal.target.currency}, а рахунок «${account.name}» — у ${account.currency}`,
      );
    }
  }
  for (const watch of state.watches) {
    needsAccount(watch.accountId, `відстежуваний застосунок «${watch.packageName}»`);
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
