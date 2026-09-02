import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendBounded, type JournalEntry } from '../reporting/journal';
import { CLOSE_LABEL, failureAlert, REPORT_LABEL } from './failure-alert';
import { bindJournal, journal, resetJournalForTests, type JournalStorage } from './journal';

function inMemoryJournal(): JournalStorage & { rows: () => readonly JournalEntry[] } {
  let entries: readonly JournalEntry[] = [];
  return {
    append: (entry) => {
      entries = appendBounded(entries, entry);
    },
    tail: () => entries,
    byId: (id) => entries.find((entry) => entry.id === id) ?? null,
    rows: () => entries,
  };
}

const AT = new Date('2026-09-02T14:00:00.000Z');
let counter = 0;

describe('the dialog a refused action shows', () => {
  let storage: ReturnType<typeof inMemoryJournal>;

  beforeEach(() => {
    counter = 0;
    resetJournalForTests();
    storage = inMemoryJournal();
    bindJournal(storage, { now: () => AT, newId: () => `e${(counter += 1)}` });
  });
  afterEach(() => resetJournalForTests());

  it('Scenario: A refused save offers the репорт', () => {
    const opened: string[] = [];

    const [title, message, buttons] = failureAlert({
      title: 'Не записано',
      where: 'local-save',
      error: new Error('Оберіть рахунок'),
      report: (id) => opened.push(id),
    });

    // The dialog says exactly what it said before this change.
    expect(title).toBe('Не записано');
    expect(message).toBe('Оберіть рахунок');
    // Beside «Закрити», the offer.
    expect(buttons.map((b) => b.text)).toEqual([CLOSE_LABEL, REPORT_LABEL]);
    expect(buttons[0]?.style).toBe('cancel');

    buttons[1]?.onPress?.();

    // And it carries the id of the entry just written, so the form attaches this very failure.
    expect(opened).toEqual(['e1']);
    expect(storage.byId('e1')).toEqual({
      id: 'e1',
      at: AT,
      kind: 'failure',
      name: 'local-save',
      detail: 'Оберіть рахунок',
    });
  });

  it('Scenario: Closing the dialog files nothing', () => {
    const opened: string[] = [];

    const [, , buttons] = failureAlert({
      title: 'Не збережено',
      where: 'account-rename',
      error: new Error('Рахунок «Картка» вже існує'),
      report: (id) => opened.push(id),
    });

    // «Закрити» does nothing at all — no репорт is opened and nothing is created.
    expect(buttons[0]?.onPress).toBeUndefined();
    expect(opened).toEqual([]);
    // The failure is in the журнал all the same: it happened whether or not it was reported.
    expect(journal.tail().map((e) => [e.name, e.detail])).toEqual([
      ['account-rename', 'Рахунок «Картка» вже існує'],
    ]);
  });

  it('journals a failure the moment it is shown, not when the owner answers the dialog', () => {
    failureAlert({
      title: 'Не приєднано',
      where: 'monobank-link',
      error: new Error('Немає зʼєднання'),
      report: () => undefined,
    });

    // Nothing was tapped, and the entry is already there.
    expect(journal.tail()).toHaveLength(1);
    expect(journal.tail()[0]?.kind).toBe('failure');
  });

  it('says what a refusal that is not an Error was', () => {
    const [, message] = failureAlert({
      title: 'Не змінено',
      where: 'watch-toggle',
      error: 'просто рядок',
      report: () => undefined,
    });

    expect(message).toBe('просто рядок');
  });
});
