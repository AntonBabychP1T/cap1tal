import { describe, expect, it } from 'vitest';

import { SETTINGS_SECTIONS } from '../ui/settings-sections';
import {
  ALERT_KINDS,
  ALERT_NOTICES,
  ALL_NOTICES,
  HOME_ROUTE,
  isAlertKind,
  noticeData,
  REMINDER_NOTICE,
  routeOf,
  type Notice,
} from './notices';

/** Every word the app can put on a lock screen, as one list to walk. */
const WORDS: readonly string[] = ALL_NOTICES.flatMap((notice) => [notice.title, notice.body]);

describe('what the app can post', () => {
  it('is the нагадування and one сповіщення per action that can fail unwatched', () => {
    expect(ALERT_KINDS).toEqual([
      'collection',
      'monobank-sync',
      'saldo-import',
      'local-save',
      'backup',
    ]);
    expect(ALL_NOTICES).toHaveLength(ALERT_KINDS.length + 1);
  });

  it('gives every notice a stable identifier of its own', () => {
    const ids = ALL_NOTICES.map((notice) => notice.id);
    // Distinct, so posting one can never replace another; stable, so posting the same one twice
    // replaces rather than stacks and clearing dismisses exactly it (design D9).
    expect(new Set(ids).size).toBe(ids.length);
    expect(REMINDER_NOTICE.id).toBe('reminder');
    expect(ids.filter((id) => id !== 'reminder').every((id) => id.startsWith('alert:'))).toBe(true);
  });

  it('says something in Ukrainian in every entry', () => {
    for (const word of WORDS) {
      expect(word.trim().length, word).toBeGreaterThan(0);
      expect(word, word).toMatch(/[а-яіїєґА-ЯІЇЄҐ]/);
    }
  });
});

describe('Scenario: A collection failure says nothing about what was captured', () => {
  it('carries no сума, no currency and no slot a сума could be poured into', () => {
    // The whole guarantee of design D4, asserted over the table rather than at each call site:
    // there is nowhere in these words for «Продукти 250,00 UAH» — or any other captured text — to
    // go, because none of them has a digit, a currency code or an interpolation slot at all.
    for (const word of WORDS) {
      expect(word, word).not.toMatch(/\d/);
      expect(word, word).not.toMatch(/\b(UAH|USD|EUR|PLN|GBP)\b/);
      expect(word, word).not.toMatch(/\$\{|%[sd]\b|\{\d*\}/);
    }
  });

  it('names the action and offers the screen, and nothing about the failure itself', () => {
    const collection = ALERT_NOTICES.collection;
    expect(collection.title).toContain('зібрати');
    expect(collection.title).toContain('сповіщення банків');
    expect(collection.route).toBe('/manage/notifications');
  });

  it('offers every notice as a value, never as a function taking a message', () => {
    // A formatter would be the one hole in the promise above: its argument is exactly the text
    // that carries суми and bank words. Every entry is a plain string, checked as one.
    for (const notice of ALL_NOTICES) {
      expect(typeof notice.title).toBe('string');
      expect(typeof notice.body).toBe('string');
    }
  });
});

describe('Scenario: The нагадування carries no numbers', () => {
  it('names no сума, no рахунок and not even the hour it arrives', () => {
    for (const word of [REMINDER_NOTICE.title, REMINDER_NOTICE.body]) {
      expect(word).not.toMatch(/\d/);
      expect(word).not.toMatch(/:/);
    }
    // It says what to do, which is the whole of what it is for.
    expect(REMINDER_NOTICE.body).toContain('витрати');
    expect(REMINDER_NOTICE.route).toBe(HOME_ROUTE);
  });
});

describe('where a tap leads', () => {
  it('sends every сповіщення to a screen the app defines', () => {
    const sections = new Set<string>(SETTINGS_SECTIONS.map((section) => section.href));
    for (const notice of ALL_NOTICES) {
      // Головний, or a Налаштування section that actually exists — nothing else is a destination.
      expect(notice.route === HOME_ROUTE || sections.has(notice.route), notice.id).toBe(true);
    }
  });

  it('leads each failure to the screen that explains it and offers the retry', () => {
    expect(ALERT_NOTICES['monobank-sync'].route).toBe('/manage/monobank');
    expect(ALERT_NOTICES['saldo-import'].route).toBe('/manage/saldo-import');
    expect(ALERT_NOTICES.backup.route).toBe('/manage/backup');
    // A транзакція is saved on Головний, so that is where its failure is read.
    expect(ALERT_NOTICES['local-save'].route).toBe(HOME_ROUTE);
  });

  it('routes a notice it posted itself back to that notice’s screen', () => {
    for (const notice of ALL_NOTICES) {
      expect(routeOf(noticeData(notice)), notice.id).toBe(notice.route);
    }
  });

  it('Scenario: An unrecognised destination opens Головний', () => {
    // The app's own data today, and still not trusted: everything unknown lands on Головний.
    for (const data of [
      { route: '/manage/nowhere' },
      { route: 'https://example.com' },
      { route: '../../etc/passwd' },
      { route: 42 },
      { route: null },
      {},
      undefined,
      null,
      'a string',
      [{ route: '/manage/monobank' }],
    ]) {
      expect(routeOf(data), JSON.stringify(data) ?? 'undefined').toBe(HOME_ROUTE);
    }
  });
});

describe('the kinds a row may name', () => {
  it('accepts exactly the enumerated ones', () => {
    for (const kind of ALERT_KINDS) {
      expect(isAlertKind(kind), kind).toBe(true);
    }
    for (const other of ['', 'reminder', 'drive-backup', 'COLLECTION', 42, null, undefined, {}]) {
      expect(isAlertKind(other), String(other)).toBe(false);
    }
  });

  it('does not mistake something inherited from Object for a kind', () => {
    expect(isAlertKind('toString')).toBe(false);
    expect(isAlertKind('constructor')).toBe(false);
  });
});

describe('the notice of a kind', () => {
  it('is the entry that kind names', () => {
    for (const kind of ALERT_KINDS) {
      const notice: Notice = ALERT_NOTICES[kind];
      expect(notice.id).toBe(`alert:${kind}`);
    }
  });
});
