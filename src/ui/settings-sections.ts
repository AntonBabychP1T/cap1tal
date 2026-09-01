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

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { href: '/onboarding', title: 'Перші кроки', hint: 'Що потрібно застосунку, щоб працювати' },
  { href: '/manage/categories', title: 'Категорії', hint: 'Куди пішли гроші' },
  { href: '/manage/sources', title: 'Джерела', hint: 'Звідки прийшли гроші' },
  { href: '/manage/rules', title: 'Правила', hint: 'Автокатегоризація імпорту' },
  { href: '/manage/limits', title: 'Ліміти', hint: 'Місячна стеля по категорії' },
  { href: '/manage/goals', title: 'Цілі', hint: 'Відкласти суму до дати' },
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
];
