import type { ConnectFailure } from '../backup/drive/connection';
import type { RestoreRefusal } from '../backup/drive/restore';
import type { BackupFailure } from '../backup/drive/run-backup';
import type { OfferedVersion } from '../backup/drive/run-restore';
import { isConnected, type DriveBackupState } from '../backup/drive/state';
import { momentLabel } from './dates';
import { plural } from '../progress/plural';
import { transactionCount } from './labels';

/**
 * What «Google Drive» says, and what it lets the owner decide — with none of its JSX, so `verify`,
 * which never runs a screen and never loads a native module, holds the section to the words the
 * spec requires of it.
 *
 * Every refusal in this change ends here and becomes a Ukrainian sentence that names a next step
 * (design D13). That is a requirement and not a nicety: the emulator smoke of `limits-goals-reports`
 * found English engine strings surfacing in the Ukrainian UI, so the mapping lives where `verify`
 * can reach it and a test walks the whole union. `no-network`, `storageQuotaExceeded` and
 * `will-not-open` are things this app knows; what the owner reads is what to do about them.
 *
 * Nothing here shows a secret. The монобанк token, the Google authorisation, the sealing key and
 * the код відновлення reach no function in this file — the код відновлення the section shows comes
 * straight from the connect flow to the screen and is never part of a state built here.
 */

/** What the section says it is — its own sentence, so «Бекап» and this are not confused. */
export const DRIVE_EXPLANATION =
  'Запечатана копія всього, що є в застосунку, лягає у ваш власний Google Drive приблизно раз на ' +
  'добу. На відміну від «Бекапу», цей файл зашифровано: без коду відновлення його не прочитає ' +
  'ніхто, зокрема й Google.';

/** What connecting will ask of the owner's account, said before they are sent to Google. */
export const DRIVE_SCOPE_PROMISE =
  'Застосунок попросить доступ лише до власної прихованої теки в вашому Drive — не до ваших ' +
  'документів і не до решти файлів.';

/** What the код відновлення is for, said at the moment it is shown. */
export const RECOVERY_CODE_EXPLANATION =
  'Це код відновлення — ключ, яким запечатано ваші копії. Лише він відкриє їх на новому телефоні. ' +
  'Запишіть його й тримайте окремо від телефона: відновити код застосунок не може, і якщо ви ' +
  'втратите його разом із телефоном, копії залишаться нечитанними назавжди.';

/** What disconnecting costs and does not cost, said before it is confirmed. */
export const DISCONNECT_WARNING =
  'Версії бекапу, які вже у Drive, залишаться там, і код відновлення далі їх відкриває. ' +
  'Застосунок просто перестане надсилати нові.';

/** What restoring does, said before the owner picks a версія and again before it happens. */
export const RESTORE_WARNING =
  'Відновлення замінює все, що зараз на телефоні. Воно нічого не додає й не зливає, і скасувати ' +
  'його буде неможливо.';

/**
 * What the ask-code door says: this phone holds no key and the folder already holds версії, so a
 * код відновлення is what joins them rather than a new one being shown.
 */
export function existingVersionsExplanation(versions: number): string {
  return (
    `У цій теці вже є ${versions} ${plural(versions, 'версія', 'версії', 'версій')} бекапу, ` +
    'запечатаних іншим телефоном. ' +
    'Введіть код відновлення від них — і цей телефон продовжить ту саму лінію, а не почне другу. ' +
    'Підключення завершиться одразу: код, який ви ввели, і є підтвердженням.'
  );
}

/** What starting a fresh line costs, said before it is confirmed. */
export const FRESH_LINE_WARNING =
  'Копії, які вже у Drive, цей телефон більше не відкриє — для них потрібен їхній код ' +
  'відновлення. Застосунок їх не видалить: вони просто залишаться там, де є.';

/** Where the section stands. */
export type DriveSectionState =
  /** Never connected: what connecting does, and the offer. */
  | { readonly kind: 'not-connected' }
  /**
   * Connected once, and Google has taken the app's access away. Not connected — the spec forbids
   * the app presenting itself as connected here — but not a blank offer either: the owner needs to
   * know why the section changed under them, and that nothing of theirs was lost.
   */
  | { readonly kind: 'withdrawn'; readonly account: string; readonly explanation: string }
  /** Connected, with whatever there is to say about the last бекап. */
  | {
      readonly kind: 'connected';
      readonly account: string;
      /** «Останній бекап: вчора о 08:00», or that there has not been one. */
      readonly lastBackup: string;
      /** Present only when the last attempt failed; the last success still stands beside it. */
      readonly failure?: string;
      /** Present when nothing has changed since the last бекап, so an ageing date reads right. */
      readonly stillCurrent?: string;
    };

// There is deliberately no `saving`/`restoring` member here: which act is running is the screen's
// own step, not a fact about the connection, and `busyMessage` is what puts words to it.

/**
 * The section as data, from what the phone remembers.
 *
 * `changed` is whether the бекап on the phone now differs from the one last uploaded. It is what
 * turns «останній бекап: 4 вересня» from something that reads like a silent failure into the truth:
 * nothing has changed since, so the copy in Drive is still current.
 */
export function sectionState(input: {
  readonly state: DriveBackupState;
  readonly now: Date;
  readonly changed?: boolean;
}): DriveSectionState {
  const { state, now } = input;
  if (!isConnected(state)) {
    // Google withdrew the app's access: the app stops calling itself connected, and says so rather
    // than silently reverting to the offer as though nothing had ever been set up.
    if (state.accountLabel && state.lastFailureKind === 'withdrawn') {
      return {
        kind: 'withdrawn',
        account: state.accountLabel,
        explanation: `Google більше не дозволяє застосунку доступ до ${state.accountLabel}. Підключіть Google Drive знову — ваші дані на телефоні й версії бекапу у Drive недоторкані, і той самий код відновлення далі їх відкриває.`,
      };
    }
    return { kind: 'not-connected' };
  }

  return {
    kind: 'connected',
    account: state.accountLabel ?? '',
    lastBackup: state.lastSuccessAt
      ? `Останній бекап: ${momentLabel(state.lastSuccessAt.getTime(), now)}.`
      : 'Бекапу ще не було — перший піде, щойно застосунок отримає нагоду.',
    ...(state.lastFailureKind && state.lastFailureAt
      ? {
          failure: `Остання спроба ${momentLabel(state.lastFailureAt.getTime(), now)} не вдалася. ${backupFailureMessage(state.lastFailureKind)}`,
        }
      : {}),
    ...(state.lastSuccessAt && input.changed === false
      ? { stillCurrent: 'Відтоді нічого не змінилося, тож копія у Drive актуальна.' }
      : {}),
  };
}

/**
 * Why a бекап did not go up, in the owner's own words — the reason, then what to do about it.
 *
 * Takes a `string` rather than the union because this is also what the stored `last_failure_kind`
 * comes back as. A value the app does not recognise — a row written by a later version, then
 * downgraded — gets the honest fallback rather than leaking a bare identifier onto the screen.
 */
export function backupFailureMessage(why: BackupFailure | string): string {
  switch (why) {
    case 'no-network':
      return 'Не було мережі. Застосунок спробує ще раз, коли наступний бекап буде потрібен.';
    case 'withdrawn':
      return 'Google більше не дозволяє застосунку доступ. Підключіть Google Drive знову — на телефоні нічого не змінилося.';
    case 'full':
      return 'У вашому Google Drive немає вільного місця. Звільніть трохи — останній успішний бекап нікуди не подівся.';
    case 'no-key':
      return 'Не вдалося дістати ключ із сховища телефона, тож бекап не було чим запечатати. Розблокуйте телефон і спробуйте ще раз.';
    case 'unavailable':
      return 'Google Drive не відповів як слід. Застосунок спробує ще раз, коли наступний бекап буде потрібен.';
    default:
      // Never a bare identifier on the screen: the owner reads a sentence with a next step even
      // for a failure this build has no word for.
      return 'Щось пішло не так під час бекапу. Спробуйте «Зберегти зараз» — останній успішний бекап на місці.';
  }
}

/** Why connecting could not finish, and what the owner can do. */
export function connectFailureMessage(why: ConnectFailure): string {
  switch (why) {
    case 'refused':
      return 'Google не дав доступу. Спробуйте підключитися ще раз і дозвольте доступ до теки застосунку.';
    case 'no-network':
      return 'Не було мережі. Підключіться, коли зʼявиться інтернет — на телефоні нічого не змінилося.';
    case 'not-configured':
      return 'Ця збірка застосунку не налаштована на Google Drive. Бекап у Drive поки недоступний.';
    case 'no-key':
      return 'Не вдалося дістати ключ зі сховища телефона. Розблокуйте телефон і спробуйте ще раз.';
    case 'unavailable':
      return 'Не вдалося прочитати теку в Google Drive, тож застосунок не став нічого змінювати. Спробуйте ще раз.';
    case 'key-already-held':
      // Refused rather than warned about: replacing the key would make every версія бекапу in
      // Drive unopenable for ever, and this phone does not need a new line — it has one.
      return 'Цей телефон уже має ключ, тож починати заново нема потреби — і не можна: новий ключ назавжди закрив би доступ до наявних копій. Скористайтеся «Показати код відновлення».';
  }
}

/** Why a версія бекапу may not be restored, and what to do instead. */
export function restoreRefusalMessage(refusal: RestoreRefusal): string {
  switch (refusal.kind) {
    case 'not-an-envelope':
      return 'Це не файл бекапу cap1tal. Оберіть іншу версію зі списку.';
    case 'damaged':
      return 'Ця версія бекапу пошкоджена. Оберіть іншу — на телефоні нічого не змінилося.';
    case 'newer-envelope':
      return 'Цю версію зроблено новішою версією застосунку. Спершу оновіть застосунок.';
    case 'will-not-open':
      return 'Версія не відкривається: або код відновлення не той, або файл пошкоджено. Перевірте код і спробуйте ще раз — на телефоні нічого не змінилося.';
    case 'another-line':
      return 'Ця версія належить до іншого коду відновлення — не до того, що на цьому телефоні. Оберіть версію зі свого списку або введіть код, яким її було запечатано.';
    case 'newer-schema':
      return 'Цю версію бекапу зроблено новішою версією застосунку. Спершу оновіть застосунок — на телефоні нічого не змінилося.';
    case 'unreadable-backup':
      return 'Версія відкрилася, але бекап усередині пошкоджений. Оберіть іншу — на телефоні нічого не змінилося.';
  }
}

/**
 * Why a confirmed restore did not land, in the owner's own words.
 *
 * Its own function and not `backupFailureMessage`: at the most dangerous moment in the app, the
 * owner must read about the *restore* they just confirmed and not about a бекап, and must be told
 * plainly that the phone is as it was. Sending them to «Зберегти зараз» here would be the wrong
 * next step for the wrong operation.
 */
export function restoreOutcomeMessage(why: string): string {
  switch (why) {
    case 'not-a-backup':
    case 'damaged':
      return 'Відновлення не відбулося: бекап усередині виявився пошкодженим. На телефоні все як було — оберіть іншу версію.';
    case 'newer-format':
    case 'newer-schema':
      return 'Відновлення не відбулося: цю версію зроблено новішою версією застосунку. На телефоні все як було — спершу оновіть застосунок.';
    case 'inconsistent':
      return 'Відновлення не відбулося: вміст бекапу суперечить сам собі. На телефоні все як було — оберіть іншу версію.';
    default:
      // A throw from the replacement itself. It is one SQLite transaction, so nothing landed, and
      // that is the fact the owner most needs at this moment.
      return 'Відновлення не відбулося, і на телефоні все залишилося як було. Спробуйте ще раз або оберіть іншу версію.';
  }
}

/**
 * What the section says while an act is running — named by the act, because five of the section's
 * six actions are not бекапи and «Бекап іде» in front of a disconnect would be simply wrong.
 */
export function busyMessage(doing: 'saving' | 'restoring' | 'connecting'): string {
  switch (doing) {
    case 'saving':
      return 'Бекап іде — це може зайняти кілька секунд.';
    case 'restoring':
      return 'Відновлення триває. Нічого не буде замінено, доки воно не завершиться.';
    case 'connecting':
      return 'Зачекайте секунду…';
  }
}

/** Why listing or fetching a версія failed — the same three answers, said for «Відновити». */
export function restoreFailureMessage(why: 'no-network' | 'withdrawn' | 'unavailable' | 'no-key'): string {
  switch (why) {
    case 'no-network':
      return 'Не було мережі, тож список версій не вдалося прочитати. Спробуйте, коли зʼявиться інтернет.';
    case 'withdrawn':
      return 'Google більше не дозволяє застосунку доступ. Підключіть Google Drive знову.';
    case 'unavailable':
      return 'Google Drive не відповів як слід. Спробуйте ще раз.';
    case 'no-key':
      return 'Цей телефон не тримає ключа. Введіть код відновлення, щоб відкрити версію.';
  }
}

/** What a mistyped код відновлення is told, wherever it was typed. */
export const MISTYPED_CODE_MESSAGE =
  'Цей код відновлення неправильний — перевірте символи й введіть ще раз. Нічого не завантажено ' +
  'й нічого не змінено.';

/** What a well-formed code that opens nothing here is told — not the same thing as a typo. */
export const ANOTHER_LINE_MESSAGE =
  'Цей код відновлення правильний, але він не від копій у цій теці. Перевірте, чи це той код, ' +
  'або почніть заново — наявні копії залишаться на місці.';

/** One версія as «Відновити» lists it: its date, and why it cannot be used when it cannot. */
export interface VersionRow {
  readonly id: string;
  /** «6 вересня о 08:00», from the бекап's own head — never from the file name. */
  readonly made: string;
  /** Present when this phone cannot restore it; the row is shown and not offered. */
  readonly refusal?: string;
}

/** The версії бекапу as rows, in the order they were offered — newest first. */
export function versionRows(versions: readonly OfferedVersion[], now: Date): readonly VersionRow[] {
  return versions.map((version) => ({
    id: version.id,
    made: version.createdAt
      ? momentLabel(version.createdAt.getTime(), now)
      : 'дата невідома',
    ...(version.refusal ? { refusal: restoreRefusalMessage(version.refusal) } : {}),
  }));
}

/**
 * What the owner is asked to confirm before anything is replaced: which версія, made when, and
 * that restoring replaces everything now on the phone.
 */
export function restoreConfirmation(input: {
  readonly made: Date;
  readonly backupTransactions: number;
  readonly phoneTransactions: number;
  readonly now: Date;
}): string {
  return (
    `Відновити версію від ${momentLabel(input.made.getTime(), input.now)}? ` +
    `У ній ${transactionCount(input.backupTransactions)}, ` +
    `зараз на телефоні ${input.phoneTransactions}. ` +
    RESTORE_WARNING
  );
}
