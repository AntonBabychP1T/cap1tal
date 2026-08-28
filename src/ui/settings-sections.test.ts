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
    ]);
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
