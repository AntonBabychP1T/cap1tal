import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  appendBounded,
  entryLine,
  JOURNAL_LIMIT,
  moment,
  type JournalEntry,
  type JournalKind,
} from './journal';

const at = (ms: number) => new Date(2026, 8, 2, 17, 0, 0, 0 + ms);

function entry(id: string, kind: JournalKind, name: string, detail?: string): JournalEntry {
  return { id, at: at(0), kind, name, ...(detail === undefined ? {} : { detail }) };
}

describe('the журнал', () => {
  it('Scenario: A screen opening is an entry', () => {
    const opened = appendBounded(
      appendBounded([], entry('1', 'screen', '/(tabs)/month')),
      entry('2', 'screen', '/(tabs)/accounts'),
    );

    expect(opened.map((e) => [e.kind, e.name])).toEqual([
      ['screen', '/(tabs)/month'],
      ['screen', '/(tabs)/accounts'],
    ]);
    // Each with the moment it happened — the entry carries an instant, not a bare label.
    expect(opened.every((e) => e.at instanceof Date)).toBe(true);
  });

  it('Scenario: The журнал is bounded', () => {
    const full = Array.from({ length: JOURNAL_LIMIT }, (_, i) =>
      entry(`e${i}`, 'screen', `/route/${i}`),
    ).reduce<readonly JournalEntry[]>((acc, e) => appendBounded(acc, e), []);
    expect(full).toHaveLength(JOURNAL_LIMIT);

    const overflowed = appendBounded(full, entry('newest', 'screen', '/route/newest'));

    expect(overflowed).toHaveLength(JOURNAL_LIMIT);
    expect(overflowed.map((e) => e.id).slice(0, 1)).toEqual(['e1']);
    expect(overflowed.some((e) => e.id === 'e0')).toBe(false);
    expect(overflowed.map((e) => e.id).slice(-1)).toEqual(['newest']);
  });

  it('keeps the order it was given, for any sequence of entries', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 40 }), fc.integer({ min: 1, max: 20 }), (names, limit) => {
        const kept = names.reduce<readonly JournalEntry[]>(
          (acc, name, i) => appendBounded(acc, entry(`e${i}`, 'screen', name), limit),
          [],
        );

        expect(kept.length).toBe(Math.min(names.length, limit));
        // Whatever survived is a suffix of what was added, in the order it was added.
        const expected = names.slice(Math.max(0, names.length - limit));
        expect(kept.map((e) => e.name)).toEqual(expected);
      }),
    );
  });

  it('never mutates the журнал it was given', () => {
    const before: readonly JournalEntry[] = [entry('1', 'screen', '/one')];
    appendBounded(before, entry('2', 'screen', '/two'), 1);
    expect(before).toHaveLength(1);
  });

  it('writes a moment from the local parts, to the millisecond', () => {
    expect(moment(new Date(2026, 8, 2, 7, 4, 5, 9))).toBe('2026-09-02 07:04:05.009');
  });

  it('renders one entry as one line, with a stack folded onto it', () => {
    const line = entryLine(entry('c', 'crash', 'render', 'Boom\n  at Screen\n  at Stack'));

    expect(line.split('\n')).toHaveLength(1);
    expect(line).toContain('падіння · render');
    expect(line).toContain('Boom ⏎   at Screen ⏎   at Stack');
  });

  it('renders a screen entry without a detail separator', () => {
    expect(entryLine(entry('s', 'screen', '/manage/backup'))).toBe(
      '2026-09-02 17:00:00.000 · екран · /manage/backup',
    );
  });
});
