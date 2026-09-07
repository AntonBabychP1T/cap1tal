import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { outboundTrafficNote, SETTINGS_SECTIONS } from './settings-sections';

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
      'Google Drive',
      'Репорти про помилки',
    ]);
  });

  it('Scenario: The bug-reports section opens the list', () => {
    const reports = SETTINGS_SECTIONS.find(
      (section) => section.title === 'Репорти про помилки',
    )!;

    // One flow: the list of saved репорти and «Повідомити про помилку» live behind the same row.
    expect(reports.href).toBe('/manage/bug-reports');
    expect(reports.hint).toContain('записати');
    expect(reports.hint).toContain('передати');
    // Last, because it is about the app rather than about the owner's money.
    const titles = SETTINGS_SECTIONS.map((section) => section.title);
    expect(titles[titles.length - 1]).toBe('Репорти про помилки');
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

  it('Scenario: The Google Drive section opens backup management', () => {
    const drive = SETTINGS_SECTIONS.find((section) => section.title === 'Google Drive')!;

    // One flow: the connection state, the last successful бекап and both actions live behind it.
    expect(drive.href).toBe('/manage/drive-backup');
    expect(drive.hint).toContain('Drive');
    // Beside «Бекап», which is the same subject by hand — the two sections are siblings and the
    // hints are what tell them apart.
    const titles = SETTINGS_SECTIONS.map((section) => section.title);
    expect(titles.indexOf('Google Drive')).toBe(titles.indexOf('Бекап') + 1);
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

describe('the hints name what the section actually holds', () => {
  const hintOf = (href: string) => SETTINGS_SECTIONS.find((s) => s.href === href)?.hint;

  it('«Цілі» names both kinds and promises no дата', () => {
    // A ціль is one of two kinds and its дата is optional, so the row may not say «до дати» —
    // it was the one sentence on the path to the feature still describing the old model.
    expect(hintOf('/manage/goals')).toBe('Накопичити суму або не перевищити витрати');
    expect(hintOf('/manage/goals')).not.toContain('дати');
  });

  it('«Ліміти» says a ліміт is also the категорія’s ціль витрат', () => {
    expect(hintOf('/manage/limits')).toContain('ціль витрат');
  });
});

describe('the tab tells the truth about what leaves the phone', () => {
  it('Scenario: Not connected names what the app sends without Google Drive', () => {
    const note = outboundTrafficNote(false);

    // Every outbound connection the app actually makes, and no бекап among them. All three exist
    // in the tree: `src/monobank/api.ts`, `src/monobank/currency.ts` and `src/fiscal/chk-all-web.ts`.
    expect(note).toContain('monobank з вашим токеном');
    expect(note).toContain('курсів monobank без токена');
    expect(note).toContain('чеків до податкової');
    expect(note).not.toContain('Drive');
    // And the чек lookup is said to be the owner's own act, not something the app does by itself.
    expect(note).toContain('коли ви скануєте чек');
  });

  it('Scenario: Connected names the backup too', () => {
    const note = outboundTrafficNote(true);

    // The same three, and the бекап as well — the sentence «усе лежить на цьому телефоні» alone
    // is exactly what this requirement forbids while Drive is connected.
    expect(note).toContain('monobank з вашим токеном');
    expect(note).toContain('курсів monobank без токена');
    expect(note).toContain('чеків до податкової');
    expect(note).toContain('запечатаний бекап');
    expect(note).toContain('ваш власний Drive');
    // The requirement's SHALL NOT, asserted rather than merely commented: while Drive is connected
    // the tab may not claim that everything stays on the phone. It is the one sentence in the app
    // that promises where the owner's money lives, and it has to stop being said the moment it
    // stops being true.
    expect(note).not.toContain('Усе лежить на цьому телефоні');
  });

  it('names the same three connections whether or not Drive is connected', () => {
    // The two answers differ only by the бекап: a change that made one say *less* than the other
    // about monobank or the чеки would be a lie by omission in whichever direction it went.
    const shared =
      'Назовні йдуть лише запити до monobank з вашим токеном, запит курсів monobank без токена і ' +
      'запити чеків до податкової — тільки коли ви скануєте чек.';
    expect(outboundTrafficNote(false)).toContain(shared);
    expect(outboundTrafficNote(true)).toContain(shared);
    // And the disconnected one may still say it, because there it is true.
    expect(outboundTrafficNote(false)).toContain('Усе лежить на цьому телефоні');
  });
});

describe('the tab reads the connection when it is looked at', () => {
  it('re-reads on focus rather than once at mount', () => {
    const screen = readFileSync(new URL('../app/(tabs)/settings.tsx', import.meta.url), 'utf8');

    // Connecting Google Drive happens on a route pushed *above* the tabs, so popping back does not
    // re-render this screen on its own. Read once at mount, the owner would return to «Усе лежить
    // на цьому телефоні» while a sealed бекап was already going to Drive — the one thing the
    // outbound-traffic requirement forbids, and invisible to a test of the sentence alone.
    expect(screen).toContain('useReloadOnFocus');
    expect(screen).toContain('isConnected(driveBackupState.read())');
    // And the sentence itself comes from `settings-sections.ts`, not built inline.
    expect(screen).toContain('outboundTrafficNote(driveConnected)');
  });
});
