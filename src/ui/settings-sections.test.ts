import { describe, expect, it } from 'vitest';

import { SETTINGS_SECTIONS } from './settings-sections';

describe('the Налаштування sections', () => {
  it('Scenario: The tab opens on its sections', () => {
    expect(SETTINGS_SECTIONS.map((section) => section.title)).toEqual([
      'Перші кроки',
      'Категорії',
      'Джерела',
      'Правила',
      'Ліміти',
      'Цілі',
      'Імпорт Saldo',
      'monobank',
      'Сповіщення банків',
      'Нагадування',
      'Бекап',
    ]);
  });

  it('Scenario: The reminders section opens the reminder and its time', () => {
    const reminders = SETTINGS_SECTIONS.find((section) => section.title === 'Нагадування')!;

    // One flow, not three: the permission, the switch with its time, and what the app announces
    // all live behind the same row.
    expect(reminders.href).toBe('/manage/reminders');
    expect(reminders.hint).toContain('нагадування');
    expect(reminders.hint).toContain('повідомляє');
    // Beside «Сповіщення банків», which is the incoming direction of the same subject, and above
    // «Бекап».
    const titles = SETTINGS_SECTIONS.map((section) => section.title);
    expect(titles.indexOf('Нагадування')).toBe(titles.indexOf('Сповіщення банків') + 1);
    expect(titles.indexOf('Нагадування')).toBe(titles.indexOf('Бекап') - 1);
  });

  it('Scenario: The backup section opens saving and restoring', () => {
    const backup = SETTINGS_SECTIONS.find((section) => section.title === 'Бекап')!;

    // One flow, not two: saving the whole state to a file and restoring it from one live behind
    // the same row.
    expect(backup.href).toBe('/manage/backup');
    expect(backup.hint).toContain('файл');
    expect(backup.hint).toContain('відновити');
  });

  it('Scenario: The bank-notifications section opens access and watches', () => {
    const notifications = SETTINGS_SECTIONS.find(
      (section) => section.title === 'Сповіщення банків',
    )!;

    // One flow, not two: the access state and the watched apps live behind the same row.
    expect(notifications.href).toBe('/manage/notifications');
    expect(notifications.hint).toContain('Доступ');
    expect(notifications.hint).toContain('застосунки');
  });

  it('Scenario: The monobank section opens connection management', () => {
    const monobank = SETTINGS_SECTIONS.find((section) => section.title === 'monobank')!;

    // One flow, not four: token state, the accounts, the links and sync all live behind it.
    expect(monobank.href).toBe('/manage/monobank');
    expect(monobank.hint).toContain('Токен');
    expect(monobank.hint).toContain('синхронізація');
  });

  it('Scenario: The import section opens the import flow', () => {
    const saldo = SETTINGS_SECTIONS.find((section) => section.title === 'Імпорт Saldo')!;

    expect(saldo.href).toBe('/manage/saldo-import');
    // Every section opens a screen of its own, and no two open the same one.
    expect(new Set(SETTINGS_SECTIONS.map((s) => s.href)).size).toBe(SETTINGS_SECTIONS.length);
    // Every management list lives under `/manage/`; «Перші кроки» is not one of them — it is the
    // setup view the app can also open by itself on a device that holds nothing.
    expect(
      SETTINGS_SECTIONS.filter((s) => s.href !== '/onboarding').every((s) =>
        s.href.startsWith('/manage/'),
      ),
    ).toBe(true);
  });

  it('Scenario: The first-steps section opens the setup view', () => {
    const [first] = SETTINGS_SECTIONS;

    // First, because a section that explains the others belongs above them.
    expect(first?.title).toBe('Перші кроки');
    expect(first?.href).toBe('/onboarding');
  });

  it('Scenario: The Ліміти section manages the limits', () => {
    const limits = SETTINGS_SECTIONS.find((section) => section.title === 'Ліміти')!;

    expect(limits.href).toBe('/manage/limits');
  });

  it('Scenario: The Цілі section manages the цілі', () => {
    const goals = SETTINGS_SECTIONS.find((section) => section.title === 'Цілі')!;

    expect(goals.href).toBe('/manage/goals');
  });
});
