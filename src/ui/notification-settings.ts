import type { Account } from '../domain/account';
import { addWatch, type Watch, type WatchableAccount } from '../notifications/draft';
import type { NotificationAccess } from '../platform/notification-access';
import type { NotificationCapturePort, WatchedSetOutcome } from '../platform/notification-capture';
import { accountNameOf } from './transaction-line';

/**
 * What «Сповіщення банків» says and what it lets the owner decide, with none of its JSX — so
 * `verify`, which never runs a screen and never loads a native module, holds the section to what
 * the spec says it must offer.
 *
 * Two rules live here and nowhere else. The section shows notification access exactly as the
 * device reports it, and offers a way to grant it only where there is one to offer. And every
 * change to the watched set goes through the capture port *before* it is stored: the engine's
 * `addWatch` decides whether a watch may exist, the port decides whether the device accepts the
 * set, and only an `ok` writes a row. `addWatch` on its own does not refuse monobank — the port
 * does — so a screen that stored first and told the device afterwards would let the two disagree
 * about what is being read.
 */

/** One app the picker offers by name, with the package the capture layer keys on. */
export interface KnownBankApp {
  readonly packageName: string;
  readonly name: string;
}

/**
 * The Ukrainian bank apps offered by name, monobank deliberately absent: mono is read through its
 * own API with real ids and сума, and a second, weaker path over the same рахунки could only
 * manufacture duplicates of what the sync already knows.
 *
 * Guessed packages are harmless — an app that never posts under that name simply captures nothing —
 * and correcting one is a change to this constant, never to the spec or the schema. Anything not
 * listed is added by hand, so no bank is out of reach for being missing here.
 */
export const KNOWN_BANK_APPS: readonly KnownBankApp[] = [
  { packageName: 'ua.privatbank.ap24', name: 'Приват24' },
  { packageName: 'ua.oschadbank.online', name: 'Ощад' },
  { packageName: 'ua.abank24.mobileapp', name: 'A-Bank' },
  { packageName: 'com.ukrsibbank.client.android', name: 'UKRSIB online' },
  { packageName: 'ua.pumb.mobile', name: 'ПУМБ Online' },
  { packageName: 'ua.sensebank.mobile', name: 'Sense SuperApp' },
  { packageName: 'ua.raiffeisen.mobile', name: 'Raiffeisen MyBank' },
  { packageName: 'ua.creditagricole.mobile', name: 'CA Mobile' },
];

/**
 * The one affordance that opens the add form, by name. It is a constant and not a literal in the
 * JSX so that there is exactly one of it: the section showed «Додати застосунок» before the form
 * had ever been opened and «Додати» after it had been opened and cancelled, and a second wording
 * cannot appear where there is only one to draw.
 *
 * The truncation itself is `Action`'s, fixed there (`src/components/form.tsx`); this makes the
 * label one thing to change and one thing to test.
 */
export const ADD_APP_ACTION = 'Додати застосунок';

/** What the section shows, decided by the one answer the device gives about access. */
export interface AccessSection {
  readonly access: NotificationAccess;
  /** What reading bank notifications is for, and that nothing read leaves the phone. */
  readonly explanation: string;
  /** The state in the owner's words. */
  readonly status: string;
  /** The way to Android's own «Доступ до сповіщень», when there is one to offer. */
  readonly grant?: string;
  /** Whether the watched apps management is shown at all. */
  readonly manageable: boolean;
}

/**
 * What reading bank notifications is for, and the promise it comes with. One constant, because the
 * screen shows it before the device has answered anything and the section shows it after — two
 * copies would be two promises, and only one of them under test.
 */
export const NOTIFICATIONS_EXPLANATION =
  'Сповіщення інших банків стають чернетками транзакцій. Читається лише на телефоні — ' +
  'нічого прочитаного не залишає пристрій.';

/**
 * Every wording says that what is read stays on the phone, because that is the fear this
 * permission raises and the promise the app actually keeps (vision §12).
 *
 * `unsupported` gets no way to grant: this build installs no listener, so the app is not even
 * listed on Android's screen, and sending the owner there would send them looking for a switch
 * that is not there. That is the whole reason it is a third answer and not a pessimistic `denied`.
 */
export function accessSection(access: NotificationAccess): AccessSection {
  const explanation = NOTIFICATIONS_EXPLANATION;
  if (access === 'unsupported') {
    return {
      access,
      explanation,
      status: 'Читання сповіщень банків недоступне в цій збірці.',
      manageable: false,
    };
  }
  if (access === 'denied') {
    return {
      access,
      explanation,
      status: 'Доступ до сповіщень не надано.',
      grant: 'Надати доступ',
      manageable: false,
    };
  }
  return {
    access,
    explanation,
    status: 'Доступ до сповіщень надано.',
    grant: 'Налаштування доступу',
    manageable: true,
  };
}

/** One watch as the list shows it: the app, and the рахунок its notifications land on. */
export interface WatchRow {
  readonly packageName: string;
  /** The known app's name, or the package itself when the owner named it by hand. */
  readonly appName: string;
  readonly accountName: string;
}

/**
 * Every watch, ordered by the name the owner reads. A watch whose рахунок was archived stays in
 * the list and stays removable — archiving hides a рахунок from pickers, never from what already
 * points at it.
 */
export function watchRows(input: {
  readonly watches: readonly Watch[];
  readonly accounts: readonly Account[];
}): WatchRow[] {
  const byId = new Map(input.accounts.map((a) => [a.id, a]));
  return [...input.watches]
    .map((watch) => ({
      packageName: watch.packageName,
      appName: appNameOf(watch.packageName),
      accountName: accountNameOf(watch.accountId, byId),
    }))
    .sort((a, b) => a.appName.localeCompare(b.appName, 'uk'));
}

/** The known app's name if it is one, otherwise the package the owner typed. */
export function appNameOf(packageName: string): string {
  return KNOWN_BANK_APPS.find((app) => app.packageName === packageName)?.name ?? packageName;
}

/**
 * The apps the picker offers: the curated list, without those already watched and without those
 * this phone does not have. monobank is not in the list to begin with, so it cannot be offered
 * here by any path.
 *
 * An app the phone does not have is one whose сповіщення can never arrive, and offering it is an
 * invitation to a watch that will stay silent forever. `'unknown'` — a platform or a build that
 * cannot look — offers the whole list as before: an unanswered question is not a "no", and an
 * empty picker over a question nobody could ask would be the worse mistake. When nothing is left
 * the screen offers no picker at all, and naming a package by hand carries on unchanged.
 */
export function appChoices(input: {
  readonly watches: readonly Watch[];
  readonly installed: readonly string[] | 'unknown';
}): KnownBankApp[] {
  const watched = new Set(input.watches.map((watch) => watch.packageName));
  const present = input.installed === 'unknown' ? null : new Set(input.installed);
  return KNOWN_BANK_APPS.filter(
    (app) => !watched.has(app.packageName) && (present === null || present.has(app.packageName)),
  );
}

/**
 * What adding or removing a watch came to. `stored` and `removed` are the only two that changed
 * anything; everything else names what refused and leaves the stored watches exactly as they were.
 */
export type WatchChange =
  | { readonly kind: 'stored'; readonly watch: Watch; readonly message: string }
  | { readonly kind: 'removed'; readonly packageName: string }
  | { readonly kind: 'rejected'; readonly message: string }
  | { readonly kind: 'refused'; readonly packages: readonly string[]; readonly message: string }
  | { readonly kind: 'unavailable'; readonly message: string };

/** What a change needs: the port to tell, and the storage to write once the port agrees. */
export interface WatchStorage {
  addWatch(watch: { readonly packageName: string; readonly accountId: string }): void;
  removeWatch(packageName: string): void;
}

/**
 * Adding a watch, in the one order that keeps the device and the database agreeing: the engine
 * decides whether this watch may exist, the capture layer is told the whole set it would produce,
 * and only an `ok` writes the row.
 *
 * A refusal — the monobank family, which the port and not `addWatch` knows about — and an
 * unavailable build both leave everything as it was and are shown as answers, never swallowed.
 */
export async function addWatchedApp(
  input: {
    readonly packageName: string;
    readonly accountId: string;
    readonly watches: readonly Watch[];
    readonly accounts: readonly WatchableAccount[];
  },
  ports: { readonly capture: NotificationCapturePort; readonly storage: WatchStorage },
): Promise<WatchChange> {
  const packageName = input.packageName.trim();
  if (packageName === '') {
    return { kind: 'rejected', message: 'Напишіть назву пакета застосунку.' };
  }

  const decided = addWatch(
    input.watches,
    { packageName, accountId: input.accountId },
    input.accounts,
  );
  if (decided.kind === 'already-watched') {
    return {
      kind: 'rejected',
      message: `«${appNameOf(packageName)}» уже читається — один застосунок веде на один рахунок.`,
    };
  }
  if (decided.kind === 'no-such-account') {
    return { kind: 'rejected', message: 'Оберіть рахунок, на який лягатимуть транзакції.' };
  }

  // The whole set, never a delta: the device is told what is watched now.
  const answer = await ports.capture.setWatched(decided.watches.map((watch) => watch.packageName));
  const refusal = refusalOf(answer);
  if (refusal) {
    return refusal;
  }

  ports.storage.addWatch({ packageName, accountId: input.accountId });
  return {
    kind: 'stored',
    watch: decided.watch,
    message: `«${appNameOf(packageName)}» тепер читається.`,
  };
}

/**
 * Removing a watch: the reduced set goes to the device first, and only then does the row go. The
 * чернетки and транзакції that app produced stay exactly where they are — this stops the reading,
 * it does not unmake what was read.
 */
export async function removeWatchedApp(
  input: { readonly packageName: string; readonly watches: readonly Watch[] },
  ports: { readonly capture: NotificationCapturePort; readonly storage: WatchStorage },
): Promise<WatchChange> {
  const remaining = input.watches.filter((watch) => watch.packageName !== input.packageName);
  const answer = await ports.capture.setWatched(remaining.map((watch) => watch.packageName));
  const refusal = refusalOf(answer);
  if (refusal) {
    return refusal;
  }
  ports.storage.removeWatch(input.packageName);
  return { kind: 'removed', packageName: input.packageName };
}

/** The confirmation removing a watch asks for, in the owner's words. */
export function removeConfirmation(packageName: string): string {
  return (
    `Більше не читати сповіщення «${appNameOf(packageName)}»? ` +
    'Уже створені чернетки та транзакції залишаться.'
  );
}

/** The two answers that change nothing, turned into what the owner reads. */
function refusalOf(answer: WatchedSetOutcome): WatchChange | undefined {
  if (answer.kind === 'refused') {
    return {
      kind: 'refused',
      packages: answer.packages,
      message:
        `monobank читається через власний API — ${answer.packages.join(', ')} не додається. ` +
        'Інакше ті самі транзакції задвоїлися б.',
    };
  }
  if (answer.kind === 'unavailable') {
    return {
      kind: 'unavailable',
      message: 'Читання сповіщень недоступне в цій збірці — нічого не змінено.',
    };
  }
  return undefined;
}
