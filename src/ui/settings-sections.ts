import type { Href } from 'expo-router';

/**
 * What «Налаштування» offers, as data rather than as JSX — so `verify`, which never runs a
 * screen, can hold the tab to the sections the spec names.
 *
 * The sections live at `/manage/…` rather than `/settings/…`: the tab already owns `/settings`,
 * the same reason the category drill-down lives at `/category/…` and not under `/month`.
 */
export interface SettingsSection {
  /** A typed expo-router route, so a section pointing at a screen that does not exist fails to
   *  compile rather than dead-ending at a tap. */
  readonly href: Extract<Href, string>;
  readonly title: string;
  /** One line under the title, in the owner's own terms. */
  readonly hint: string;
}

/**
 * What the tab says leaves the phone — and it has to be true of the app as it actually is, not of
 * the app as it was when the sentence was written.
 *
 * Three connections exist today whatever the owner does: the monobank personal API with their
 * token, monobank's tokenless exchange-rate endpoint, and the tax service, asked for a фіскальний
 * чек only when the owner scans one. A fourth appears while Google Drive is connected. A change
 * that adds a fifth changes this function, and the settings-screen requirement is where that is
 * written down.
 */
export function outboundTrafficNote(driveConnected: boolean): string {
  // Named once and shared, so the two answers cannot disagree about what the app sends.
  const outbound =
    'Назовні йдуть лише запити до monobank з вашим токеном, запит курсів monobank без токена і ' +
    'запити чеків до податкової — тільки коли ви скануєте чек.';
  // The opening claim is exactly what the requirement forbids while Drive is connected, so it
  // belongs to the disconnected answer alone and is not merely qualified afterwards: a sentence
  // that says «усе лежить на цьому телефоні» and then contradicts itself is still a false first
  // sentence, and this is the one place in the app that promises where the owner's money lives.
  return driveConnected
    ? `${outbound} А поки підключено Google Drive, туди ж іде запечатаний бекап — у ваш власний Drive.`
    : `Усе лежить на цьому телефоні. ${outbound}`;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { href: '/onboarding', title: 'Перші кроки', hint: 'Що потрібно застосунку, щоб працювати' },
  { href: '/manage/categories', title: 'Категорії', hint: 'Куди пішли гроші' },
  { href: '/manage/sources', title: 'Джерела', hint: 'Звідки прийшли гроші' },
  { href: '/manage/rules', title: 'Правила', hint: 'Автокатегоризація імпорту' },
  { href: '/manage/limits', title: 'Ліміти', hint: 'Місячна стеля по категорії — вона ж ціль витрат' },
  { href: '/manage/goals', title: 'Цілі', hint: 'Накопичити суму або не перевищити витрати' },
  { href: '/manage/saldo-import', title: 'Імпорт Saldo', hint: 'Разовий переїзд з історією' },
  { href: '/manage/monobank', title: 'monobank', hint: 'Токен, рахунки та синхронізація' },
  {
    href: '/manage/notifications',
    title: 'Сповіщення банків',
    hint: 'Доступ і застосунки, які читаємо',
  },
  {
    href: '/manage/reminders',
    title: 'Нагадування',
    hint: 'Щоденне нагадування і що застосунок повідомляє',
  },
  { href: '/manage/backup', title: 'Бекап', hint: 'Зберегти все у файл і відновити з нього' },
  {
    href: '/manage/drive-backup',
    title: 'Google Drive',
    hint: 'Запечатана копія у вашому Drive — щодня, без нагадувань',
  },
  {
    href: '/manage/bug-reports',
    title: 'Репорти про помилки',
    hint: 'Що пішло не так — записати і передати',
  },
];
