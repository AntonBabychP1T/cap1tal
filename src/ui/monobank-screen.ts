import { activeAccounts, type Account, type AccountKind } from '../domain/account';
import type { CurrencyCode, Money } from '../domain/money';
import type { IsoDate } from '../domain/transaction';
import type { AccountOutcome, SyncProgress, SyncRun } from '../monobank/coordinator';
import { suggestKind, type LinkProposal, type MonobankLink } from '../monobank/link';
import { formatMoney } from './amount-input';
import { momentLabel, parseTypedDate, startOfLocalDayMs } from './dates';
import {
  accountChoiceLabel,
  accountCount,
  evidenceLabel,
  kindLabel,
  transactionCount,
} from './labels';

/**
 * What «monobank» shows and what it lets the owner decide, with none of its JSX — so `verify`,
 * which never runs a screen, holds the flow to what the spec says it must offer.
 *
 * The rules that live here are the visible ones: every account of the token is shown, linked or
 * not; a balance is never converted or combined; a link is offered only onto an unlinked рахунок
 * of the same currency; a рахунок created for a банка starts from a suggestion the owner may
 * change. Validation of a link is `src/monobank/link.ts`'s, storage is
 * `src/db/monobank-repo.ts`'s, and the request loop is `src/monobank/coordinator.ts`'s.
 */

/**
 * The part of a monobank account this screen reads. Both the fetched shape (`MonobankAccount`)
 * and the cached one (`StoredMonobankAccount`) satisfy it, which is what lets the screen render
 * the same rows whether the answer just arrived or is the last one that did.
 */
export interface MonobankAccountView {
  readonly id: string;
  readonly kind: 'card' | 'jar';
  readonly name: string;
  readonly currency: CurrencyCode;
  readonly bankBalance: Money;
}

/** One row of the account inventory: the bank's side, and what the app has made of it. */
export interface MonobankAccountRow {
  readonly monobankAccountId: string;
  /** The bank's own name for it — `black ··1234`, or a банка's title. */
  readonly name: string;
  readonly kind: 'card' | 'jar';
  readonly currency: CurrencyCode;
  /** The баланс банку in this account's own currency; nothing here is ever converted. */
  readonly bankBalance: string;
  readonly linked: boolean;
  /** The рахунок it feeds, when it feeds one. */
  readonly accountName?: string;
  /** The inclusive first day sync may import for it, when it is linked. */
  readonly syncStartDate?: IsoDate;
  /**
   * When a sync last completed for it, in the owner's words — «Синхронізовано вчора о 18:05» — or
   * «Ще не синхронізовано» when none has. Only a linked account has one: an unlinked account is
   * not one sync visits.
   *
   * Said rather than left blank, because an empty moment and a moment nobody looked up read the
   * same on a screen, and only one of them is true.
   */
  readonly lastSync?: string;
}

/** One linked account's moment, said either way. */
function lastSyncOf(lastSyncedAtMs: number | null | undefined, now: Date): string {
  return lastSyncedAtMs === null || lastSyncedAtMs === undefined
    ? NEVER_SYNCED_ACCOUNT
    : `Синхронізовано ${momentLabel(lastSyncedAtMs, now)}`;
}

/** Said for a linked account no sync has completed for — never an empty gap where a date goes. */
export const NEVER_SYNCED_ACCOUNT = 'Ще не синхронізовано';

/** Said when no linked account has ever completed a sync on this device. */
export const NEVER_SYNCED_DEVICE = 'Синхронізації на цьому пристрої ще не було';

/**
 * The screen's own last sync: the most recent moment among the linked accounts, said in the
 * owner's words — or plainly that there has not been one. `null` only where there is nothing to
 * say it about: a device with no link has no sync to have missed.
 *
 * The most recent, not the oldest: the question the line answers is "when did this app last hear
 * from the bank", and the newest answer is what answers it.
 */
export function lastSyncLine(input: {
  readonly links: readonly (MonobankLink & { readonly lastSyncedAtMs?: number | null })[];
  readonly now: Date;
}): string | null {
  if (input.links.length === 0) {
    return null;
  }
  const moments = input.links
    .map((link) => link.lastSyncedAtMs)
    .filter((ms): ms is number => ms !== null && ms !== undefined);
  if (moments.length === 0) {
    return NEVER_SYNCED_DEVICE;
  }
  return `Остання синхронізація — ${momentLabel(Math.max(...moments), input.now)}`;
}

/** The state the screen is in as far as monobank's own answer is concerned. */
export type InventoryFreshness =
  | { readonly kind: 'fresh' }
  /** Showing what was cached, because the latest attempt could not reach the bank. */
  | { readonly kind: 'cached'; readonly obtainedAt?: Date }
  | { readonly kind: 'empty' };

/**
 * Every card and банка the token showed, linked ones and unlinked ones alike, in one list. No
 * account is filtered out for being unlinked: an account left out of sync is the owner's
 * decision, and a decision they were never shown would be a silent gap in «по всіх картках і
 * банках».
 *
 * The order is the bank's names, so the list reads the same on every opening.
 */
export function monobankAccountRows(input: {
  readonly monobankAccounts: readonly MonobankAccountView[];
  readonly links: readonly (MonobankLink & {
    readonly syncStartDate?: IsoDate;
    readonly lastSyncedAtMs?: number | null;
  })[];
  readonly accounts: readonly Account[];
  /** The clock, passed in like every other one — «сьогодні» is decided by the caller's instant. */
  readonly now: Date;
}): MonobankAccountRow[] {
  const linkOf = new Map(input.links.map((link) => [link.monobankAccountId, link]));
  const accountsById = new Map(input.accounts.map((a) => [a.id, a]));

  return [...input.monobankAccounts]
    .sort((a, b) => a.name.localeCompare(b.name, 'uk') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((monobankAccount) => {
      const link = linkOf.get(monobankAccount.id);
      const account = link ? accountsById.get(link.accountId) : undefined;
      return {
        monobankAccountId: monobankAccount.id,
        name: monobankAccount.name,
        kind: monobankAccount.kind,
        currency: monobankAccount.currency,
        bankBalance: formatMoney(monobankAccount.bankBalance),
        linked: link !== undefined,
        // A link whose рахунок cannot be resolved shows the id rather than an empty gap — the
        // same fallback the feed uses, and as transient as that one.
        ...(link ? { accountName: account ? account.name : link.accountId } : {}),
        ...(link?.syncStartDate ? { syncStartDate: link.syncStartDate } : {}),
        ...(link ? { lastSync: lastSyncOf(link.lastSyncedAtMs, input.now) } : {}),
      };
    });
}

/**
 * The рахунки this monobank account may be linked to: unarchived, of exactly the same currency,
 * and not already fed by another monobank account.
 *
 * Currencies must be equal rather than convertible, which is `validateLink`'s rule and the reason
 * a USD банка is not offered a UAH рахунок: a link makes the bank's numbers this рахунок's
 * numbers, and no rate in this app could make a USD statement into UAH truth.
 */
export function linkChoices(input: {
  readonly monobankAccount: Pick<MonobankAccountView, 'id' | 'currency'>;
  readonly accounts: readonly Account[];
  readonly links: readonly MonobankLink[];
}): Account[] {
  const taken = new Set(input.links.map((link) => link.accountId));
  return activeAccounts(input.accounts)
    .filter((a) => a.currency === input.monobankAccount.currency && !taken.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'uk') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** One рахунок as the link picker names it — the same label every other picker uses. */
export function linkChoiceLabel(a: Account): string {
  return accountChoiceLabel(a);
}

/** A рахунок about to be created for a monobank account, before the owner has touched it. */
export interface NewAccountDraft {
  readonly name: string;
  readonly kind: AccountKind;
  readonly currency: CurrencyCode;
}

/**
 * What creating a рахунок for this monobank account starts from: the bank's own name, its
 * currency, and the вид `suggestKind` proposes — `savings` for a банка, `spending` for a card.
 *
 * A suggestion only. The вид is the owner's to change before they confirm, since it is the вид
 * and not the name that decides how a переказ onto this рахунок counts in the month. The currency
 * is not: a link joins two accounts of one currency, so a рахунок made for a USD банка is a USD
 * рахунок or it is not that банка.
 */
export function newAccountDraft(monobankAccount: MonobankAccountView): NewAccountDraft {
  return {
    name: monobankAccount.name,
    kind: suggestKind(monobankAccount),
    currency: monobankAccount.currency,
  };
}

/**
 * The sentence the owner confirms before a link becomes active. It names the inclusive date and
 * says what the app deliberately does not do — nothing here matches an imported item against a
 * транзакція the Saldo import already brought in, so an overlapping boundary produces duplicates
 * the owner then edits by hand. Saying so before the import is the only honest order.
 */
export function boundaryConfirmation(date: IsoDate, accountName: string): string {
  return `Синхронізувати «${accountName}» з ${date} включно. Записи до цієї дати не імпортуються, а те, що вже є з Saldo, не звіряється — збіги доведеться прибрати вручну.`;
}

/** The boundary a link is stored with: the date the owner typed, and where the cursor starts. */
export interface SyncBoundary {
  readonly syncStartDate: IsoDate;
  readonly cursorMs: number;
}

/**
 * The «Синхронізувати з» field is a typed дата like any other, so it is refused like any other —
 * in Ukrainian, naming what was typed. Before this it went straight into `startOfLocalDayMs`, and
 * a boundary of «31.12.2026» answered `date must be YYYY-MM-DD, got "31.12.2026"` inside a
 * «Не приєднано» alert: the engine's own invariant text, in front of the owner, at the moment they
 * are already being told no. That is exactly what the app-shell requirement forbids.
 *
 * All three link paths — an existing рахунок, a created one, and the reviewed set — go through
 * here, so the date is checked once and both stored fields come from the same parse.
 */
export function syncBoundary(typed: string): SyncBoundary {
  const date = parseTypedDate(typed);
  return { syncStartDate: date, cursorMs: startOfLocalDayMs(date) };
}

/**
 * What the screen says about the token, and the whole of what it can say: configured, or not.
 * The value itself is not part of this state and has no branch that could put it there — once it
 * is kept, the screen knows only that monobank is connected.
 */
export function tokenStateLabel(configured: boolean | undefined): string {
  if (configured === undefined) {
    return 'Стан підключення невідомий';
  }
  return configured ? 'Токен збережено на пристрої' : 'Токен ще не введено';
}

/** What one account's outcome says, in the owner's words. */
const OUTCOME_LABELS: Readonly<Record<AccountOutcome, string>> = {
  complete: 'готово',
  'invalid-token': 'токен більше не дійсний',
  'rate-limited': 'банк просить зачекати',
  unavailable: 'банк недоступний',
  cancelled: 'скасовано',
};

export function outcomeLabel(outcome: AccountOutcome): string {
  return OUTCOME_LABELS[outcome];
}

/** One line of the result, per account, plus what the run as a whole offers next. */
export interface SyncSummary {
  /** How many new транзакції the whole run imported. */
  readonly headline: string;
  readonly accounts: readonly {
    readonly monobankAccountId: string;
    readonly outcome: AccountOutcome;
    readonly text: string;
  }[];
  /** Whether anything is left unfinished, so a retry is worth offering. */
  readonly retryOffered: boolean;
  /** Whether the token itself is what failed, so replacing it is the offer rather than a retry. */
  readonly replaceTokenOffered: boolean;
}

/**
 * What a finished run reports: the number of new транзакції, and one outcome per account, named.
 *
 * An account that failed does not take the completed ones down with it — each line says what that
 * account did, and the total counts only committed work. That is what makes a partial run's truth
 * survive: the card that finished is finished, whatever happened to the one after it.
 */
export function syncSummary(
  run: SyncRun,
  /** monobank account id → the bank's name for it, as the rows show it. */
  names: ReadonlyMap<string, string>,
): SyncSummary {
  if (run.kind !== 'ran') {
    return {
      headline: RUN_HEADLINES[run.kind],
      accounts: [],
      retryOffered: run.kind !== 'no-links',
      replaceTokenOffered: false,
    };
  }
  return {
    headline: `Імпортовано ${transactionCount(run.imported)}`,
    accounts: run.accounts.map((result) => ({
      monobankAccountId: result.monobankAccountId,
      outcome: result.outcome,
      text: `${names.get(result.monobankAccountId) ?? result.monobankAccountId}: ${outcomeLabel(
        result.outcome,
      )}${result.imported > 0 ? `, ${transactionCount(result.imported)}` : ''}`,
    })),
    retryOffered: run.accounts.some((result) => result.outcome !== 'complete'),
    replaceTokenOffered: run.accounts.some((result) => result.outcome === 'invalid-token'),
  };
}

/**
 * Whether a finished run is a failure the owner has to be told about when they are not watching.
 *
 * A run that never started because there is no token and one with nothing linked are setup states,
 * not failures: nothing was attempted, nothing silently stopped arriving, and a сповіщення would
 * be the app complaining about work the owner never asked for. A cancelled account is the owner's
 * own decision, for the reason `AccountOutcome` already gives about not blaming the bank for it.
 * Everything else means транзакції did not arrive and «залишилось» is now too large.
 */
export function syncFailed(run: SyncRun): boolean {
  if (run.kind === 'not-configured' || run.kind === 'no-links') {
    return false;
  }
  if (run.kind === 'storage-unavailable') {
    return true;
  }
  return run.accounts.some(
    (result) => result.outcome !== 'complete' && result.outcome !== 'cancelled',
  );
}

const RUN_HEADLINES: Readonly<
  Record<'not-configured' | 'storage-unavailable' | 'no-links', string>
> = {
  'not-configured': 'Спершу введіть токен monobank',
  'storage-unavailable': 'Не вдалося прочитати збережений токен',
  'no-links': 'Жоден рахунок monobank не приєднано',
};

/** What the screen says while a run is going on, so a long first sync never looks frozen. */
export function progressLabel(progress: SyncProgress, names: ReadonlyMap<string, string>): string {
  switch (progress.kind) {
    case 'started':
      return `Синхронізація: ${accountCount(progress.accounts)}`;
    case 'account':
      return `${names.get(progress.monobankAccountId) ?? progress.monobankAccountId} — ${progress.index} з ${progress.of}`;
    case 'waiting':
      return `Чекаємо ${Math.ceil(progress.ms / 1000)} с — банк дозволяє один запит на хвилину`;
    case 'finished-account':
      return `${names.get(progress.result.monobankAccountId) ?? progress.result.monobankAccountId}: ${outcomeLabel(progress.result.outcome)}`;
  }
}

/**
 * What unlinking is confirmed with. It names what stays, because the fear it has to answer is
 * "will this delete my history": nothing of the owner's money goes, and the memory of what was
 * already imported goes least of all — it is what stops a re-link importing everything twice.
 */
export function unlinkConfirmation(monobankAccountName: string): string {
  return `Відʼєднати «${monobankAccountName}»? Рахунок, транзакції та памʼять про вже імпортоване лишаються — повторне приєднання нічого не задублює. Синхронізація для нього припиниться.`;
}

/** The same promise for the token itself: it goes, and nothing of the owner's money does. */
export function removeTokenConfirmation(): string {
  return 'Видалити токен monobank? Синхронізація припиниться, а рахунки, транзакції, описи й останні відомі баланси банку лишаються без змін.';
}

/**
 * monobank's own page for a personal token: the owner scans a QR there with the bank's app and
 * the token appears. The app opens it rather than describing it, because "find api.monobank.ua"
 * is the step people give up on — and it is the only address in this flow, so it lives here with
 * the screen's other words where a test can see it.
 */
export const MONOBANK_TOKEN_PAGE_URL = 'https://api.monobank.ua/';

/**
 * What the app is willing to treat as a token the owner copied: 30–64 characters of the alphabet
 * monobank's personal tokens use, once the ends are trimmed. Anything else — a sentence, a link,
 * an empty clipboard, a value with a space inside it — is not a candidate.
 *
 * A filter, not a validator. The only judge of a token is monobank answering client-info, and
 * that order does not move: a candidate goes to the connection, and storage happens only if the
 * bank read it. This exists so the app never sends the owner's unrelated clipboard — a password,
 * an address, a message — to the bank on the chance that it might be a token.
 */
export function tokenCandidate(clipboard: string | undefined | null): string | undefined {
  if (typeof clipboard !== 'string') {
    return undefined;
  }
  const trimmed = clipboard.trim();
  return /^[A-Za-z0-9_-]{30,64}$/.test(trimmed) ? trimmed : undefined;
}

/**
 * What the screen says when the clipboard held no token. Said out loud rather than silently
 * doing nothing: the owner has just come back from the token page believing they copied one, and
 * silence would read as the app being broken rather than as the copy having missed.
 */
export const CLIPBOARD_NO_TOKEN =
  'У буфері обміну немає токена. Скопіюйте його і спробуйте ще раз.';

/** One line of the review list: what the bank has, what it would become, and on what evidence. */
export interface ProposalRow {
  readonly monobankAccountId: string;
  /** The bank's own name for the card or банка. */
  readonly name: string;
  /** What accepting this proposal would do, named. */
  readonly becomes: string;
  /** Why — the evidence, or what makes the choice the owner's. */
  readonly reason: string;
  /** Whether «Приєднати все» may act on it; an ambiguous proposal waits for the owner. */
  readonly acceptable: boolean;
  /** Set for a proposal onto a рахунок that already exists. */
  readonly accountId?: string;
  /** Set for a proposal to create one; the same draft the per-row path starts from. */
  readonly draft?: NewAccountDraft;
}

/**
 * The proposals as the review list shows them, in the order the account rows are in.
 *
 * A proposal whose рахунок cannot be resolved is dropped rather than shown as a gap: it can only
 * mean the рахунок was archived or linked between the proposal being computed and this render,
 * and a line naming nothing would be worse than one line fewer.
 */
export function proposalRows(input: {
  readonly proposals: readonly LinkProposal[];
  readonly monobankAccounts: readonly MonobankAccountView[];
  readonly accounts: readonly Account[];
}): ProposalRow[] {
  const bankAccounts = new Map(input.monobankAccounts.map((a) => [a.id, a]));
  const accountsById = new Map(input.accounts.map((a) => [a.id, a]));

  return input.proposals.flatMap((proposal): ProposalRow[] => {
    const monobankAccount = bankAccounts.get(proposal.monobankAccountId);
    if (!monobankAccount) {
      return [];
    }
    const head = { monobankAccountId: proposal.monobankAccountId, name: monobankAccount.name };

    if (proposal.kind === 'existing') {
      const account = accountsById.get(proposal.accountId);
      if (!account) {
        return [];
      }
      return [
        {
          ...head,
          becomes: `→ «${account.name}»`,
          reason: evidenceLabel(proposal.evidence),
          acceptable: true,
          accountId: proposal.accountId,
        },
      ];
    }

    if (proposal.kind === 'new') {
      const draft = newAccountDraft(monobankAccount);
      return [
        {
          ...head,
          becomes: `→ новий рахунок «${draft.name}» (${kindLabel(draft.kind)}, ${draft.currency})`,
          reason: 'нічого схожого на пристрої',
          acceptable: true,
          draft,
        },
      ];
    }

    const named = proposal.candidateIds
      .map((id) => accountsById.get(id)?.name)
      .filter((name): name is string => name !== undefined);
    return [
      {
        ...head,
        becomes: '→ оберіть самі',
        reason:
          named.length > 0
            ? `однаково схожі: ${named.map((name) => `«${name}»`).join(', ')}`
            : 'кілька рахунків схожі однаково',
        acceptable: false,
      },
    ];
  });
}

/**
 * The sentence the whole accepted set is confirmed with. It makes the same promise
 * `boundaryConfirmation` makes for one link — the boundary is inclusive, earlier records are not
 * imported, and nothing here is reconciled against what the Saldo import already brought in —
 * because accepting five links at once is exactly when that promise is easiest to miss.
 */
export function linkSetConfirmation(count: number, date: IsoDate): string {
  return `Приєднати ${accountCount(count)} з ${date} включно. Записи до цієї дати не імпортуються, а те, що вже є з Saldo, не звіряється — збіги доведеться прибрати вручну.`;
}
