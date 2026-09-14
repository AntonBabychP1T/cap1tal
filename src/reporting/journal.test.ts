import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  appendBounded,
  describeRequest,
  entryLine,
  foldScreens,
  JOURNAL_LIMIT,
  kindLabel,
  moment,
  type JournalEntry,
  type JournalKind,
} from './journal';

/** Every kind there is, written out — a missing one here is a kind nothing below covers. */
const EVERY_KIND: readonly JournalKind[] = [
  'screen',
  'failure',
  'alert',
  'crash',
  'network',
  'step',
  'native',
];

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

  it('has a Ukrainian label for every kind there is', () => {
    for (const kind of EVERY_KIND) {
      expect(kindLabel(kind)).not.toBe('');
    }
    // Distinct, so a reader can tell one kind from another at a glance.
    expect(new Set(EVERY_KIND.map(kindLabel)).size).toBe(EVERY_KIND.length);
  });

  it('keeps the bound at two thousand', () => {
    expect(JOURNAL_LIMIT).toBe(2000);
  });

  it('renders an entry with no mark, duration or counts exactly as it did before', () => {
    expect(entryLine(entry('s', 'screen', '/manage/backup'))).toBe(
      '2026-09-02 17:00:00.000 · екран · /manage/backup',
    );
    expect(entryLine(entry('f', 'failure', 'local-save', 'Оберіть рахунок'))).toBe(
      '2026-09-02 17:00:00.000 · збій · local-save · Оберіть рахунок',
    );
  });

  it('renders a refused-reading step with no run', () => {
    expect(
      entryLine(entry('r', 'step', 'receipt-scan/refused-reading', 'incomplete missing=time,total')),
    ).toBe(
      '2026-09-02 17:00:00.000 · крок · receipt-scan/refused-reading · incomplete missing=time,total',
    );
  });

  it('renders the mark, the duration and the counts once each, counts in key order', () => {
    const line = entryLine({
      ...entry('n', 'network', 'GET api.monobank.ua/personal/client-info'),
      run: 'r1234567890abcdef',
      tookMs: 342,
      counts: { status: 200, accounts: 2 },
    });

    expect(line).toBe(
      '2026-09-02 17:00:00.000 · мережа · GET api.monobank.ua/personal/client-info' +
        ' · #r1234567 · 342 мс · accounts=2 status=200',
    );
  });

  describe('describeRequest', () => {
    it("Scenario: A statement request is an entry — the bank's path is kept whole", () => {
      expect(
        describeRequest(
          'GET',
          'https://api.monobank.ua/personal/statement/kKGVoZuHWzq/1756000000/1757000000',
        ),
      ).toBe('GET api.monobank.ua/personal/statement/kKGVoZuHWzq/1756000000/1757000000');
    });

    it('Scenario: A path that is not the bank\'s keeps only its shape', () => {
      const described = describeRequest(
        'GET',
        'https://www.googleapis.com/drive/v3/files/1AbC2dEf3GhI4jKl5MnO?alt=media',
      );

      expect(described).toBe('GET www.googleapis.com/drive/v3/files/{id}');
      expect(described).not.toContain('1AbC2dEf3GhI4jKl5MnO');
      expect(described).not.toContain('alt=media');
      expect(described).not.toContain('?');
    });

    it('keeps the endpoint of a Drive listing and an upload, and neither query', () => {
      expect(
        describeRequest(
          'GET',
          'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,size)',
        ),
      ).toBe('GET www.googleapis.com/drive/v3/files');
      expect(
        describeRequest(
          'POST',
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size',
        ),
      ).toBe('POST www.googleapis.com/upload/drive/v3/files');
    });

    it('keeps neither a file id nor a query from any of the four Drive endpoints', () => {
      const fileId = '1AbC2dEf3GhI4jKl5MnO';
      const described = [
        describeRequest(
          'GET',
          'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,size)&orderBy=name&pageSize=100',
        ),
        describeRequest(
          'POST',
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size',
        ),
        describeRequest('GET', `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`),
        describeRequest('DELETE', `https://www.googleapis.com/drive/v3/files/${fileId}`),
      ];

      expect(described).toEqual([
        'GET www.googleapis.com/drive/v3/files',
        'POST www.googleapis.com/upload/drive/v3/files',
        'GET www.googleapis.com/drive/v3/files/{id}',
        'DELETE www.googleapis.com/drive/v3/files/{id}',
      ]);
      for (const line of described) {
        expect(line).not.toContain(fileId);
        expect(line).not.toContain('?');
      }
    });

    it("Scenario: A request whose path is the owner's business is not described by its path", () => {
      const described = describeRequest(
        'GET',
        'https://cabinet.tax.gov.ua/ws/api_public/rro/chkAllWeb?fn=3000000000&id=12345&date=2026-09-02%2011:30:00&sm=780.00',
      );

      expect(described).toBe('GET cabinet.tax.gov.ua/ws/api_public/rro/chkAllWeb');
      for (const part of ['3000000000', '12345', '780.00', '2026-09-02']) {
        expect(described).not.toContain(part);
      }
    });

    it('replaces an identifier that happens to carry no digit at all', () => {
      // A Drive file id is `[A-Za-z0-9_-]{33}` and is not obliged to contain a digit. A rule that
      // kept every letters-only segment would write this one whole, against «every identifier in
      // it replaced by a placeholder».
      const letters = 'AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfG';
      const described = describeRequest('GET', `https://www.googleapis.com/drive/v3/files/${letters}`);

      expect(described).toBe('GET www.googleapis.com/drive/v3/files/{id}');
      expect(described).not.toContain(letters);
    });

    it('keeps the longest word any endpoint the app reaches actually uses', () => {
      // `client-info` is eleven characters; nothing this app asks for is longer. The length half
      // of the rule must not start eating the vocabulary it is there to keep.
      expect(describeRequest('GET', 'https://example.test/personal/client-info/statement')).toBe(
        'GET example.test/personal/client-info/statement',
      );
    });

    it('describes a URL it cannot read by its method alone', () => {
      expect(describeRequest('GET', 'not a url at all')).toBe('GET —');
    });
  });

  describe('foldScreens', () => {
    const screen = (id: string, name: string, ms: number): JournalEntry => ({
      id,
      at: at(ms),
      kind: 'screen',
      name,
    });

    it('Scenario: Repeated screens are one line', () => {
      const lines = foldScreens([
        screen('1', '/(tabs)/home', 0),
        screen('2', '/(tabs)/home', 1),
        screen('3', '/(tabs)/home', 2),
        screen('4', '/(tabs)/home', 3),
        screen('5', '/(tabs)/home', 4),
      ]);

      expect(lines).toEqual([
        '2026-09-02 17:00:00.000 · екран · /(tabs)/home · ×5 · останній 2026-09-02 17:00:00.004',
      ]);
    });

    it('does not fold two different routes', () => {
      const lines = foldScreens([screen('1', '/(tabs)/home', 0), screen('2', '/(tabs)/month', 1)]);

      expect(lines).toHaveLength(2);
    });

    it('lets a non-screen entry between two identical routes break the run', () => {
      const lines = foldScreens([
        screen('1', '/(tabs)/home', 0),
        { id: '2', at: at(1), kind: 'failure', name: 'local-save', detail: 'Оберіть рахунок' },
        screen('3', '/(tabs)/home', 2),
      ]);

      expect(lines).toHaveLength(3);
      expect(lines.every((line) => !line.includes('×'))).toBe(true);
    });
  });
});
