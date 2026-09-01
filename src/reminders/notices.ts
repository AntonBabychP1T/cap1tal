import type { Href } from 'expo-router';

/**
 * Everything the app is able to post, in one table: the daily нагадування and one сповіщення про
 * збій per action that can fail while nobody is watching.
 *
 * The table *is* the privacy promise (design D4). Every title and body here is a parameterless
 * constant — there is no function taking a message, no template with a slot and no argument
 * through which a сума, the назва of a рахунок or a line of a bank's own notification could reach
 * the lock screen. What failed is already explained on the screen the notice leads to, in words
 * that may safely say everything; what the phone posts says only which action it was.
 *
 * The route is part of the notice for the same reason: a tap may open only a screen this file
 * names, and `routeOf` is the one place a notification's data is turned into navigation
 * (design D10).
 */

/** A typed expo-router route, so a notice pointing nowhere fails to compile (settings-sections). */
export type NoticeRoute = Extract<Href, string>;

/** Головний — where a транзакція is added and pending чернетки wait, and the fallback of a tap. */
export const HOME_ROUTE: NoticeRoute = '/';

/**
 * One thing the app can post. `id` is stable per notice and is what Android keys on: posting the
 * same id again replaces rather than stacks, and clearing is dismissing exactly that id (D9).
 */
export interface Notice {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly route: NoticeRoute;
}

/**
 * The work that can fail without the owner watching. The set lives here rather than in a CHECK
 * constraint (design D7): migrations are immutable and this list grows, so SQL knowing it would
 * cost a rebuilt table per new kind. The repository refuses a kind that is not here instead.
 */
export type AlertKind =
  /** Draining what the phone captured from other banks' notifications. */
  | 'collection'
  /** A monobank sync — the one that paces itself a minute per request. */
  | 'monobank-sync'
  /** Committing the one-time Saldo import. */
  | 'saldo-import'
  /** Storing a транзакція on this phone: a чернетка confirmed, or one recorded by hand. */
  | 'local-save'
  /** Saving the whole state to a file, or restoring it from one. */
  | 'backup';

/**
 * The нагадування: the app's one invitation to record. It names no сума, no рахунок and not even
 * the time it arrives — the phone's own clock says that, and a time in the body would be the
 * first number this table ever carried.
 */
export const REMINDER_NOTICE: Notice = {
  id: 'reminder',
  title: 'Запишіть витрати',
  body: 'Відкрийте застосунок, додайте витрати за день і підтвердьте чернетки, що чекають.',
  route: HOME_ROUTE,
};

/**
 * One сповіщення про збій per kind: the title is the action that failed, the body is where it is
 * explained and retried. Neither says why it failed — the reason is on that screen, where it can
 * carry bank text and суми without leaving the phone's lock.
 */
export const ALERT_NOTICES: Readonly<Record<AlertKind, Notice>> = {
  collection: {
    id: 'alert:collection',
    title: 'Не вдалося зібрати сповіщення банків',
    body: 'Відкрийте «Сповіщення банків» — там причина й спроба ще раз.',
    route: '/manage/notifications',
  },
  'monobank-sync': {
    id: 'alert:monobank-sync',
    title: 'Не вдалося синхронізувати monobank',
    body: 'Відкрийте «monobank» — там причина й спроба ще раз.',
    route: '/manage/monobank',
  },
  'saldo-import': {
    id: 'alert:saldo-import',
    title: 'Не вдалося завершити імпорт Saldo',
    body: 'Відкрийте «Імпорт Saldo» — там причина й спроба ще раз.',
    route: '/manage/saldo-import',
  },
  'local-save': {
    id: 'alert:local-save',
    title: 'Не вдалося зберегти транзакцію',
    body: 'Відкрийте застосунок — там причина й спроба ще раз.',
    route: HOME_ROUTE,
  },
  backup: {
    id: 'alert:backup',
    title: 'Не вдалося зберегти або відновити бекап',
    body: 'Відкрийте «Бекап» — там причина й спроба ще раз.',
    route: '/manage/backup',
  },
};

/** Every kind, in one place, so a loop over them cannot miss one a `Record` quietly gained. */
export const ALERT_KINDS: readonly AlertKind[] = Object.keys(ALERT_NOTICES) as AlertKind[];

/** Whether a string is one of the kinds — the repository's guard, and the parse of stored rows. */
export function isAlertKind(value: unknown): value is AlertKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ALERT_NOTICES, value);
}

/** The notice one kind posts. */
export function alertNotice(kind: AlertKind): Notice {
  return ALERT_NOTICES[kind];
}

/** Every notice the app can post — the нагадування and the сповіщення, walked as one list. */
export const ALL_NOTICES: readonly Notice[] = [REMINDER_NOTICE, ...ALERT_KINDS.map(alertNotice)];

/** The routes a tap may land on: exactly the ones this table names, and nothing else. */
const KNOWN_ROUTES: ReadonlySet<string> = new Set(ALL_NOTICES.map((notice) => notice.route));

/**
 * What a tapped notification's data means, as navigation.
 *
 * The data is the app's own — it wrote it — and it is still treated as untrusted: an unknown
 * destination, a missing one, a value that is not a string, or a payload that is not an object at
 * all all open Головний. That costs one lookup and closes the whole question of what a
 * notification could be made to open (design D10).
 */
export function routeOf(data: unknown): NoticeRoute {
  if (data === null || typeof data !== 'object') {
    return HOME_ROUTE;
  }
  const route = (data as Record<string, unknown>).route;
  return typeof route === 'string' && KNOWN_ROUTES.has(route) ? (route as NoticeRoute) : HOME_ROUTE;
}

/** What a notice is posted with, so the tap that follows can be routed back through this table. */
export function noticeData(notice: Notice): { readonly route: string } {
  return { route: notice.route };
}
