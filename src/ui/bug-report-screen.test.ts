import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { inMemoryBugReportFiles } from '../platform/bug-report-files';
import { appendBounded, type JournalEntry } from '../reporting/journal';
import type { BugReport } from '../reporting/report';
import {
  addScreenshot,
  attachContext,
  copyText,
  EMPTY_FORM,
  EMPTY_LIST,
  formState,
  handOver,
  IDLE,
  listRows,
  NEW_ROUTE,
  removeReport,
  REMOVE_CONFIRMATION,
  REQUIRED_REFUSAL,
  routeOf,
  saveFailedRefusal,
  savedReportText,
  savedReportWords,
  submitForm,
  type NewReport,
  type ReportContext,
  type SavedReportState,
} from './bug-report-screen';
import { bindJournal, journal, resetJournalForTests, type JournalStorage } from './journal';

const NOW = new Date(2026, 8, 2, 17, 30, 0, 0);
const at = (second: number) => new Date(2026, 8, 2, 17, 0, second, 0);

function entry(over: Partial<JournalEntry> & { id: string }): JournalEntry {
  return { at: at(0), kind: 'screen', name: '/(tabs)', ...over };
}

const CONTEXT: Omit<ReportContext, 'journal' | 'prompting'> = {
  build: { version: '0.0.0', commit: '3df8103', dirty: true, builtAt: '2026-09-02T14:33:32.747Z' },
  device: { platform: 'android', systemVersion: '16', model: 'Pixel 7' },
  migrationsApplied: 13,
  counts: { accounts: 2, transactions: 7, categories: 5, rules: 0, drafts: 1 },
  now: NOW,
};

function context(over: Partial<ReportContext> = {}): ReportContext {
  return { ...CONTEXT, journal: [], prompting: null, ...over };
}

function inMemoryJournal(): JournalStorage {
  let entries: readonly JournalEntry[] = [];
  return {
    append: (e) => {
      entries = appendBounded(entries, e);
    },
    tail: () => entries,
    byId: (id) => entries.find((e) => e.id === id) ?? null,
  };
}

function saved(over: Partial<BugReport> = {}): BugReport {
  return {
    ...attachContext('r1', { ...EMPTY_FORM, did: 'натиснув Записати' }, context()),
    screenshots: [],
    handedOverAt: null,
    ...over,
  };
}

describe('the репорт form', () => {
  beforeEach(() => resetJournalForTests());
  afterEach(() => resetJournalForTests());

  it('Scenario: A репорт without the required line is refused', () => {
    const stored: NewReport[] = [];

    const outcome = submitForm({
      id: 'r1',
      fields: { ...EMPTY_FORM, did: '   ', happened: 'щось пішло не так' },
      context: context(),
      save: (report) => stored.push(report),
    });

    expect(outcome).toEqual({ kind: 'refused', message: REQUIRED_REFUSAL });
    expect(REQUIRED_REFUSAL).toContain('Напишіть');
    expect(stored).toEqual([]);
  });

  it('Scenario: A репорт from a failure dialog carries that failure', () => {
    // What the журнал holds when a save is refused on the entry form and the owner reports it:
    // the screen, the refusal, and then the form's own screen entry.
    const refusal = entry({
      id: 'f1',
      kind: 'failure',
      name: 'local-save',
      detail: 'Оберіть рахунок',
      at: at(2),
    });
    const tail = [
      entry({ id: 's1', name: '/(tabs)', at: at(0) }),
      entry({ id: 's2', name: '/transaction/new', at: at(1) }),
      refusal,
      entry({ id: 's3', name: NEW_ROUTE, at: at(3) }),
    ];

    const outcome = submitForm({
      id: 'r1',
      fields: { ...EMPTY_FORM, did: 'натиснув Записати' },
      context: context({ journal: tail, prompting: refusal }),
      save: () => undefined,
    });

    expect(outcome.kind).toBe('saved');
    const report = (outcome as { report: NewReport }).report;
    // The screen the dialog was shown on — not the form's own route, which follows the failure.
    expect(report.route).toBe('/transaction/new');
    expect(report.prompting).toEqual(refusal);
    // And the журнал it carries still ends with the form's own screen entry: it is a snapshot of
    // what actually happened, not a tidied version of it.
    expect(report.journal.map((e) => e.id)).toEqual(['s1', 's2', 'f1', 's3']);
  });

  it('Scenario: A репорт from a failure dialog carries that failure — a first-draw crash', () => {
    // A screen that throws on its very first draw: React discards the render, so the root layout's
    // own pathname effect never commits and the fallback writes the route itself, immediately
    // before the crash (design D4 (a)). The крash's own screen entry is the one that names it.
    const crash = entry({
      id: 'c1',
      kind: 'crash',
      name: 'render',
      detail: 'Boom\n  at AccountsScreen',
      at: at(5),
    });
    const tail = [
      entry({ id: 's1', name: '/(tabs)', at: at(3) }),
      entry({ id: 's2', name: '/(tabs)/accounts', at: at(4) }),
      crash,
    ];

    expect(routeOf(tail, crash)).toBe('/(tabs)/accounts');
  });

  it('Scenario: A репорт filed on its own carries the context anyway', () => {
    const tail = [
      entry({ id: 's1', name: '/(tabs)/settings', at: at(0) }),
      entry({ id: 's2', name: '/manage/bug-reports', at: at(1) }),
      entry({ id: 's3', name: NEW_ROUTE, at: at(2) }),
    ];

    const outcome = submitForm({
      id: 'r1',
      fields: { ...EMPTY_FORM, did: 'нічого, просто пишу' },
      context: context({ journal: tail, prompting: null }),
      save: () => undefined,
    });

    const report = (outcome as { report: NewReport }).report;
    expect(report.prompting).toBeNull();
    // Everything the app knows about itself is there all the same.
    expect(report.build.commit).toBe('3df8103');
    expect(report.device.model).toBe('Pixel 7');
    expect(report.migrationsApplied).toBe(13);
    expect(report.counts.transactions).toBe(7);
    expect(report.createdAt).toBe(NOW);
    expect(report.journal).toHaveLength(3);
  });

  it('Scenario: Filing on one`s own', () => {
    const tail = [
      entry({ id: 's1', name: '/(tabs)/settings', at: at(0) }),
      entry({ id: 's2', name: '/manage/bug-reports', at: at(1) }),
      entry({ id: 's3', name: NEW_ROUTE, at: at(2) }),
    ];

    // The section, not the form: a репорт about the репорт form is not what the owner meant.
    expect(routeOf(tail)).toBe('/manage/bug-reports');
  });

  it('Scenario: A save that fails says so and keeps the form', () => {
    const storage = inMemoryJournal();
    bindJournal(storage);

    const outcome = submitForm({
      id: 'r1',
      fields: { ...EMPTY_FORM, did: 'натиснув Записати' },
      context: context(),
      save: () => {
        throw new Error('database is locked');
      },
    });

    expect(outcome).toEqual({
      kind: 'refused',
      message: saveFailedRefusal('database is locked'),
    });
    expect(saveFailedRefusal('database is locked')).toContain('Не вдалося зберегти репорт');
    // The failure to save is itself in the журнал, so a later репорт carries the evidence of it.
    expect(journal.tail().map((e) => [e.kind, e.name, e.detail])).toEqual([
      ['failure', 'bug-report-save', 'database is locked'],
    ]);
  });

  it('keeps the two optional lines optional, and trims what the owner typed', () => {
    const report = attachContext(
      'r1',
      { did: '  натиснув Записати  ', happened: '   ', expected: 'мало записатися' },
      context(),
    );

    expect(report.did).toBe('натиснув Записати');
    expect(report.happened).toBeNull();
    expect(report.expected).toBe('мало записатися');
  });

  it('shows the prompting failure above the fields, and nothing when nothing prompted it', () => {
    const crash = entry({
      id: 'c1',
      kind: 'crash',
      name: 'render',
      detail: 'Boom\n  at AccountsScreen',
      at: at(5),
    });

    expect(formState({ fields: EMPTY_FORM, prompting: crash }).promptingLine).toBe(
      'Падіння · render · 2026-09-02 17:00:05.000\nBoom',
    );
    expect(formState({ fields: EMPTY_FORM }).promptingLine).toBeNull();
    expect(formState({ fields: EMPTY_FORM, refusal: REQUIRED_REFUSAL }).refusal).toBe(
      REQUIRED_REFUSAL,
    );
  });

  it('names the phone`s first screen when the журнал holds none', () => {
    expect(routeOf([])).toBe('/');
  });
});

describe('the list of репорти', () => {
  it('Scenario: The list is newest first', () => {
    const day = 24 * 60 * 60 * 1000;
    const older = saved({
      id: 'older',
      createdAt: new Date(NOW.getTime() - day),
      did: 'перший\nдругий рядок',
      route: '/(tabs)/accounts',
    });
    const newer = saved({
      id: 'newer',
      createdAt: NOW,
      did: 'другий репорт',
      route: '/manage/backup',
      handedOverAt: NOW,
    });

    const rows = listRows([older, newer]);

    expect(rows.map((r) => r.id)).toEqual(['newer', 'older']);
    expect(rows[0]).toEqual({
      id: 'newer',
      moment: '2026-09-02 17:30:00.000',
      summary: 'другий репорт',
      route: '/manage/backup',
      handedOver: true,
      handedOverLabel: 'Передано',
    });
    // The first line of «Що я робив», not the whole of it.
    expect(rows[1]?.summary).toBe('перший');
    expect(rows[1]?.handedOverLabel).toBe('Ще не передано');
  });

  it('Scenario: The empty list says so', () => {
    expect(listRows([])).toEqual([]);
    expect(EMPTY_LIST).toContain('Репортів поки немає');
  });
});

describe('the saved репорт', () => {
  it('Scenario: The whole text is on the screen', () => {
    const report = saved({ happened: 'застосунок закрився' });

    const text = savedReportText(report);

    expect(text).toContain('натиснув Записати');
    expect(text).toContain('застосунок закрився');
    expect(text).toContain('Коміт: 3df8103');
    expect(text).toContain('Пристрій: Pixel 7');
    expect(text).toContain('Транзакції: 7');
    expect(text).toContain('## Журнал');
    // And it is character for character what would be copied.
    expect(copyText(report)).toBe(text);
  });

  it('Scenario: Handing over says it was handed over', async () => {
    const files = inMemoryBugReportFiles();
    await files.keep('r1', { uri: 'file:///a.png', mime: 'image/png' });
    const marked: [string, Date][] = [];
    const report = saved({ screenshots: [{ name: 'shot-1.png', addedAt: NOW }] });

    const state = await handOver(
      IDLE,
      {
        report,
        files,
        storage: { markHandedOver: (id, when) => marked.push([id, when]) },
        now: () => NOW,
      },
      () => undefined,
    );

    expect(state).toEqual({ kind: 'handed-over', at: NOW });
    expect(savedReportWords(state)).toContain('Файл передано системі');
    expect(marked).toEqual([['r1', NOW]]);
    // Exactly one file, carrying the text and the screenshot's data.
    expect(files.handed()).toHaveLength(1);
    expect(files.handed()[0]?.name).toBe('cap1tal-report-2026-09-02-1730.md');
    expect(files.handed()[0]?.text).toContain('data:image/png;base64,BASE64-shot-1.png');
  });

  it('Scenario: A second hand-over waits for the first', async () => {
    const files = inMemoryBugReportFiles();
    const report = saved();
    let state: SavedReportState = IDLE;
    const options = {
      report,
      files,
      storage: { markHandedOver: () => undefined },
      now: () => NOW,
    };

    const first = handOver(state, options, (next) => {
      state = next;
    });
    // The screen is already `handing-over` when the second tap is checked against it.
    const second = handOver(state, options, (next) => {
      state = next;
    });
    await Promise.all([first, second]);

    expect(await second).toEqual({ kind: 'handing-over' });
    expect(files.handed()).toHaveLength(1);
  });

  it('Scenario: A phone without a chooser is told so', async () => {
    const files = inMemoryBugReportFiles({ outcome: { kind: 'unavailable' } });

    const state = await handOver(
      IDLE,
      { report: saved(), files, storage: { markHandedOver: () => undefined }, now: () => NOW },
      () => undefined,
    );

    expect(state).toEqual({ kind: 'unavailable' });
    expect(savedReportWords(state)).toContain('Скопіюйте текст');
    expect(files.handed()).toEqual([]);
  });

  it('says why a file could not be prepared, and remembers no hand-over', async () => {
    const files = inMemoryBugReportFiles({
      outcome: { kind: 'failed', reason: 'Немає місця на пристрої' },
    });
    const marked: string[] = [];

    const state = await handOver(
      IDLE,
      {
        report: saved(),
        files,
        storage: { markHandedOver: (id) => marked.push(id) },
        now: () => NOW,
      },
      () => undefined,
    );

    expect(state).toEqual({ kind: 'failed', reason: 'Немає місця на пристрої' });
    expect(marked).toEqual([]);
  });

  it('Scenario: Nothing leaves without the owner', async () => {
    const files = inMemoryBugReportFiles();
    const added: string[] = [];

    // A репорт saved and given a screenshot, and nothing handed to anybody.
    const outcome = await addScreenshot({
      reportId: 'r1',
      files,
      storage: { addScreenshot: (_id, name) => added.push(name) },
      now: () => NOW,
    });

    expect(outcome).toEqual({ kind: 'added', name: 'shot-1.png' });
    expect(added).toEqual(['shot-1.png']);
    expect(files.handed()).toEqual([]);
  });

  it('Scenario: A picked image is kept with the репорт', async () => {
    const files = inMemoryBugReportFiles();
    const added: [string, string, Date][] = [];

    await addScreenshot({
      reportId: 'r1',
      files,
      storage: { addScreenshot: (id, name, when) => added.push([id, name, when]) },
      now: () => NOW,
    });

    expect(files.kept('r1')).toEqual(['shot-1.png']);
    expect(added).toEqual([['r1', 'shot-1.png', NOW]]);
  });

  it('Scenario: Backing out of the picker attaches nothing', async () => {
    const files = inMemoryBugReportFiles({ pick: { kind: 'cancelled' } });
    const added: string[] = [];

    const outcome = await addScreenshot({
      reportId: 'r1',
      files,
      storage: { addScreenshot: (_id, name) => added.push(name) },
      now: () => NOW,
    });

    // No attachment, and no failure shown either — the owner simply changed their mind.
    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(added).toEqual([]);
    expect(files.kept('r1')).toEqual([]);
  });

  it('says why a screenshot could not be kept, and stores no row for it', async () => {
    const files = inMemoryBugReportFiles({ keepFails: 'Немає місця на пристрої' });
    const added: string[] = [];

    const outcome = await addScreenshot({
      reportId: 'r1',
      files,
      storage: { addScreenshot: (_id, name) => added.push(name) },
      now: () => NOW,
    });

    expect(outcome).toEqual({
      kind: 'failed',
      message: 'Не вдалося зберегти скріншот: Немає місця на пристрої',
    });
    expect(added).toEqual([]);
  });

  it('Scenario: Removing asks first', async () => {
    const files = inMemoryBugReportFiles();
    await files.keep('r1', { uri: 'file:///a.png', mime: 'image/png' });
    await files.keep('r1', { uri: 'file:///b.png', mime: 'image/png' });
    const removed: string[] = [];

    // The question is a value; nothing has happened by asking it.
    expect(REMOVE_CONFIRMATION.title).toBe('Видалити репорт?');
    expect(REMOVE_CONFIRMATION.confirm).toBe('Видалити');
    expect(REMOVE_CONFIRMATION.cancel).toBe('Скасувати');
    expect(removed).toEqual([]);
    expect(files.kept('r1')).toHaveLength(2);

    await removeReport({ reportId: 'r1', files, storage: { remove: (id) => removed.push(id) } });

    // Confirming takes the rows and the files — the repository's cascade, and the port.
    expect(removed).toEqual(['r1']);
    expect(files.kept('r1')).toEqual([]);
  });

  it('hands the репорт over even when a screenshot`s file has gone', async () => {
    const files = inMemoryBugReportFiles();
    const report = saved({ screenshots: [{ name: 'missing.png', addedAt: NOW }] });

    const state = await handOver(
      IDLE,
      { report, files, storage: { markHandedOver: () => undefined }, now: () => NOW },
      () => undefined,
    );

    expect(state.kind).toBe('handed-over');
    expect(files.handed()[0]?.text).toContain('Файл не вдалося прочитати.');
  });
});
