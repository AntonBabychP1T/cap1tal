import { describe, expect, it } from 'vitest';

import { SETTINGS_SECTIONS } from './settings-sections';

describe('the Налаштування sections', () => {
  it('Scenario: The tab opens on its sections', () => {
    expect(SETTINGS_SECTIONS.map((section) => section.title)).toEqual([
      'Категорії',
      'Джерела',
      'Правила',
      'Імпорт Saldo',
    ]);
  });

  it('Scenario: The import section opens the import flow', () => {
    const saldo = SETTINGS_SECTIONS.find((section) => section.title === 'Імпорт Saldo')!;

    expect(saldo.href).toBe('/manage/saldo-import');
    // Every section opens a screen of its own, and no two open the same one.
    expect(new Set(SETTINGS_SECTIONS.map((s) => s.href)).size).toBe(SETTINGS_SECTIONS.length);
    expect(SETTINGS_SECTIONS.every((s) => s.href.startsWith('/manage/'))).toBe(true);
  });
});
