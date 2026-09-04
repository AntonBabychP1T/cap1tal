import { describe, expect, it } from 'vitest';

import { TABS } from './tabs';

/**
 * The five вкладки, as one list.
 *
 * They used to be written twice — once in `app-tabs.tsx` for the native bar and once in
 * `app-tabs.web.tsx` for the web one — and the two drifted: the web bar rendered four and left out
 * «Звіти», against `reports-screen`'s requirement that it sits between «Рахунки» and
 * «Налаштування». Neither file is loaded by `verify`, so nothing caught it.
 *
 * This is the test that would have. It cannot see either bar drawn; what it can see is the list
 * both of them now render from, which is exactly where the defect lived.
 */

describe('the tab set', () => {
  it('Scenario: Every tab is offered — five, and no sixth', () => {
    // Named for the delta's scenario, which `.claude/rules/testing.md` asks of every scenario.
    // What the gate can hold of it is the list: the bars are read as text in `screens.test.ts`,
    // and whether five icons are actually drawn is the emulator's to say.
    expect(TABS).toHaveLength(5);
    expect(TABS.map((tab) => tab.label)).toEqual([
      'Головний',
      'Місяць',
      'Рахунки',
      'Звіти',
      'Налаштування',
    ]);
  });

  it('offers them in the order the specs fix', () => {
    // `settings-screen`: «Налаштування» last after Головний, Місяць, Рахунки and Звіти.
    // `reports-screen`: «Звіти» between «Рахунки» and «Налаштування».
    expect(TABS.map((tab) => tab.label)).toEqual([
      'Головний',
      'Місяць',
      'Рахунки',
      'Звіти',
      'Налаштування',
    ]);
  });

  it('places «Звіти» between «Рахунки» and «Налаштування»', () => {
    const at = (label: string) => TABS.findIndex((tab) => tab.label === label);
    expect(at('Рахунки')).toBeLessThan(at('Звіти'));
    expect(at('Звіти')).toBeLessThan(at('Налаштування'));
  });

  it('carries both route forms, because the two bars take different ones', () => {
    // The native bar addresses a screen by its expo-router file name; the web bar by its path.
    expect(TABS.map((tab) => tab.routeName)).toEqual([
      'index',
      'month',
      'accounts',
      'reports',
      'settings',
    ]);
    expect(TABS.map((tab) => tab.href)).toEqual([
      '/',
      '/month',
      '/accounts',
      '/reports',
      '/settings',
    ]);
  });

  it('gives every вкладка a label, an icon key and both routes', () => {
    for (const tab of TABS) {
      expect(tab.label, 'label').toBeTruthy();
      expect(tab.iconKey, `${tab.label} icon`).toBeTruthy();
      expect(tab.routeName, `${tab.label} route`).toBeTruthy();
      expect(tab.href.startsWith('/'), `${tab.label} href is a path`).toBe(true);
    }
  });

  it('repeats nothing — no two вкладки share a route, a label or an icon', () => {
    for (const field of ['routeName', 'href', 'label', 'iconKey'] as const) {
      const values = TABS.map((tab) => tab[field]);
      expect(new Set(values).size, field).toBe(TABS.length);
    }
  });
});
