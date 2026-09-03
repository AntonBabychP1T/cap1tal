import { describe, expect, it } from 'vitest';

import type { JournalEntry } from './journal';
import {
  renderReport,
  renderReportFile,
  reportFileName,
  routeTrail,
  ROUTE_TRAIL_LIMIT,
  type BugReport,
  type ReportImage,
} from './report';

const at = (minute: number, second = 0) => new Date(2026, 8, 2, 17, minute, second, 0);

const journal: readonly JournalEntry[] = [
  { id: 'e0', at: at(0), kind: 'screen', name: '/(tabs)' },
  { id: 'e1', at: at(1), kind: 'screen', name: '/(tabs)/month' },
  { id: 'e2', at: at(2), kind: 'screen', name: '/(tabs)/accounts' },
  { id: 'e3', at: at(3), kind: 'alert', name: 'collection' },
  { id: 'e4', at: at(4), kind: 'screen', name: '/manage/backup' },
  { id: 'e5', at: at(5), kind: 'failure', name: 'backup-save', detail: 'Немає місця' },
  { id: 'e6', at: at(6), kind: 'screen', name: '/transaction/new' },
  { id: 'e7', at: at(7), kind: 'failure', name: 'local-save', detail: 'Оберіть рахунок' },
  { id: 'e8', at: at(8), kind: 'alert', name: 'local-save' },
  {
    id: 'e9',
    at: at(9),
    kind: 'crash',
    name: 'render',
    detail: 'Cannot read x of undefined\n  at AccountsScreen\n  at Stack',
  },
];

const crash = journal[journal.length - 1] ?? null;

const report: BugReport = {
  id: 'r1',
  createdAt: at(10),
  did: 'натиснув Записати',
  happened: 'застосунок закрився',
  expected: 'транзакція мала записатися',
  route: '/(tabs)/accounts',
  build: { version: '0.0.0', commit: '3df8103', dirty: true, builtAt: '2026-09-02T14:33:32.747Z' },
  device: { platform: 'android', systemVersion: '16', model: 'Pixel 7' },
  migrationsApplied: 12,
  counts: { accounts: 5, transactions: 1234, categories: 18, rules: 7, drafts: 2 },
  journal,
  prompting: crash,
  screenshots: [{ name: 'shot-1.png', addedAt: at(11) }],
  handedOverAt: null,
  origin: 'crash',
  captureFailure: null,
};

const images: readonly ReportImage[] = [
  { name: 'shot-1.png', mime: 'image/png', base64: 'AAECAwQ=' },
];

describe('the rendered репорт', () => {
  it('Scenario: The rendered text is the репорт', () => {
    const text = renderReport(report);

    // What the owner wrote.
    expect(text).toContain('натиснув Записати');
    expect(text).toContain('застосунок закрився');
    expect(text).toContain('транзакція мала записатися');
    // The build and the device.
    expect(text).toContain('Версія: 0.0.0');
    expect(text).toContain('Коміт: 3df8103 (дерево було брудне)');
    expect(text).toContain('Платформа: android 16');
    expect(text).toContain('Пристрій: Pixel 7');
    expect(text).toContain('Міграцій застосовано: 12');
    // The screen and the moment.
    expect(text).toContain('## Current route · Екран');
    expect(text).toContain('/(tabs)/accounts');
    expect(text).toContain('Створено: 2026-09-02 17:10:00.000');
    // The failure with its stack, whole, in its own section.
    expect(text).toContain('## Relevant failures/errors · Що спричинило');
    expect(text).toContain('падіння · render');
    expect(text).toContain('  at AccountsScreen\n  at Stack');
    // The counts.
    expect(text).toContain('Рахунки: 5');
    expect(text).toContain('Транзакції: 1234');
    expect(text).toContain('Категорії: 18');
    expect(text).toContain('Правила: 7');
    expect(text).toContain('Чернетки: 2');
    // All ten entries, one line each, in order.
    const lines = text.split('\n');
    const positions = journal.map((entry) =>
      lines.findIndex((line) => line.includes(` · ${entry.name}`) && line.startsWith('2026-')),
    );
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
    expect(text).toContain('Recent journal (10)');

    // The image data is only in the file that is handed over.
    expect(text).not.toContain('data:image');
    expect(renderReportFile(report, images)).toContain('data:image/png;base64,AAECAwQ=');
  });

  it('Scenario: Rendering is deterministic', () => {
    expect(renderReport(report)).toBe(renderReport(report));
    expect(renderReportFile(report, images)).toBe(renderReportFile(report, images));
  });

  it('Scenario: Copying gives the text without image data', () => {
    const twoShots: BugReport = {
      ...report,
      screenshots: [
        { name: 'shot-1.png', addedAt: at(11) },
        { name: 'shot-2.png', addedAt: at(12) },
      ],
    };

    const text = renderReport(twoShots);

    expect(text).toContain('shot-1.png');
    expect(text).toContain('shot-2.png');
    expect(text).not.toContain('data:image');
    expect(text).not.toContain('base64');
  });

  it('says the репорт was filed on its own when nothing prompted it', () => {
    const text = renderReport({ ...report, prompting: null, screenshots: [] });

    expect(text).toContain('Нічого не спричинило — репорт заведено власноруч.');
    // «Screenshots» is present and says it holds nothing, rather than being left out.
    expect(text).toContain('## Screenshots · Скріншоти');
    expect(text).toContain('Немає.');
    // Still the whole context.
    expect(text).toContain('Коміт: 3df8103');
    expect(text).toContain('Recent journal (10)');
  });

  it('marks the lines the owner left empty rather than dropping them', () => {
    const text = renderReport({ ...report, happened: null, expected: '   ' });

    expect(text).toContain('### Що сталося\n\n—');
    // «Чого я очікував» is now a section of its own (§3), not a line inside «Що не так».
    expect(text).toContain('## Expected behaviour · Чого я очікував\n\n—');
  });

  it('says so when a named screenshot cannot be read', () => {
    expect(renderReportFile(report, [])).toContain('Файл не вдалося прочитати.');
  });

  it('names the file by the moment the репорт was created', () => {
    expect(reportFileName(report)).toBe('cap1tal-report-2026-09-02-1710.md');
  });

  it('says when the репорт was handed over', () => {
    expect(renderReport({ ...report, handedOverAt: at(30) })).toContain(
      'Передано: 2026-09-02 17:30:00.000',
    );
  });
});

/**
 * The route trail: a fold over the журнал the репорт already stores, never a stored value of its
 * own (design D7). Everything asserted here is therefore about *reading*, and the privacy question
 * it might have raised was settled by `JournalEntry` having no field a сума could sit in.
 */
describe('the route trail', () => {
  const screens = (...names: readonly string[]): JournalEntry[] =>
    names.map((name, index) => ({ id: `s${index}`, at: at(index), kind: 'screen', name }));

  it('Scenario: The route trail is routes and nothing else', () => {
    const trail = routeTrail([
      ...screens('/(tabs)/month', '/(tabs)/accounts'),
      { id: 'f1', at: at(3), kind: 'failure', name: 'account-rename', detail: 'Рахунок «Картка» вже існує' },
      { id: 'a1', at: at(4), kind: 'alert', name: 'collection' },
      ...screens('/account/abc123').map((entry) => ({ ...entry, id: 'z1' })),
    ]);

    // The order the owner walked, oldest first — and the refusal's text, which is the one place
    // the журнал is allowed to quote what they typed, is not in it.
    expect(trail).toEqual(['/(tabs)/month', '/(tabs)/accounts', '/account/abc123']);
    expect(trail.join(' ')).not.toContain('Картка');
  });

  it('is empty on a журнал with no screen entry — a phone that just started', () => {
    expect(routeTrail([{ id: 'c1', at: at(0), kind: 'crash', name: 'render' }])).toEqual([]);
    expect(routeTrail([])).toEqual([]);
  });

  it('keeps the newest, and keeps them in order, once there are more than the limit', () => {
    const many = screens(...Array.from({ length: 30 }, (_, index) => `/route/${index}`));

    const trail = routeTrail(many);

    expect(trail).toHaveLength(ROUTE_TRAIL_LIMIT);
    // The last twenty, newest last: the screens just before the bug are the ones that explain it.
    expect(trail[0]).toBe('/route/10');
    expect(trail[trail.length - 1]).toBe('/route/29');
  });

  it('is a fold over the репорт\'s own журнал, so it needs nothing stored beside it', () => {
    expect(routeTrail(report.journal)).toEqual(
      report.journal.filter((entry) => entry.kind === 'screen').map((entry) => entry.name),
    );
  });
});

/**
 * The ten sections, and the one renderer that produces both texts.
 *
 * The headings are English with a Ukrainian gloss after a `·` — the one place in the app where the
 * owner meets English on a screen, ratified deliberately (design D8): the English half is the
 * anchor the reader at the laptop looks for, the Ukrainian half keeps the text the owner's own,
 * and every word of *content* below them stays Ukrainian.
 */
const SECTIONS = [
  '# Bug report · Репорт про помилку',
  '## User observation · Що не так',
  '## Expected behaviour · Чого я очікував',
  '## Context · Контекст',
  '## App/build/device · Збірка і пристрій',
  '## Current route · Екран',
  '## Recent journal',
  '## Relevant failures/errors · Що спричинило',
  '## Screenshots · Скріншоти',
  '## Reproduction context · Як відтворити',
] as const;

/** Where each section starts, so «in that order» is an assertion and not an impression. */
function positionsOf(text: string): number[] {
  return SECTIONS.map((headingText) => text.indexOf(headingText));
}

describe('the sections the second reader looks for', () => {
  it('Scenario: The sections are the ones the reader looks for', () => {
    const text = renderReport(report);

    const positions = positionsOf(text);
    expect(positions.every((at) => at >= 0)).toBe(true);
    // In that order, and each exactly once.
    expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
    for (const headingText of SECTIONS) {
      expect(text.split(headingText)).toHaveLength(2);
    }
  });

  it('Scenario: An empty section says it is empty', () => {
    const bare = renderReport({
      ...report,
      prompting: null,
      screenshots: [],
      journal: [],
      expected: null,
    });

    // Not one heading is missing on a репорт that has nothing for it…
    expect(positionsOf(bare).every((at) => at >= 0)).toBe(true);
    // …and each says so in Ukrainian rather than standing blank.
    expect(bare).toContain('Нічого не спричинило — репорт заведено власноруч.');
    expect(bare).toContain('## Screenshots · Скріншоти\n\nНемає.');
    expect(bare).toContain('## Expected behaviour · Чого я очікував\n\n—');
  });

  it('carries how the репорт was opened, and says so plainly when it does not know', () => {
    expect(renderReport({ ...report, origin: 'here' })).toContain(
      'Заведено: з екрана, де сталася проблема',
    );
    expect(renderReport({ ...report, origin: 'dialog' })).toContain('Заведено: з діалогу про збій');
    // A репорт stored before the app recorded this says so, rather than guessing a door.
    expect(renderReport({ ...report, origin: null })).toContain('Заведено: невідомо звідки');
  });

  it('carries the route trail and the counts under «Reproduction context»', () => {
    const text = renderReport(report);
    const reproduction = text.slice(text.indexOf('## Reproduction context'));

    for (const route of routeTrail(report.journal)) {
      expect(reproduction).toContain(route);
    }
    expect(reproduction).toContain('Рахунки: 5');
    expect(reproduction).toContain('Чернетки: 2');
    // And the plain statement of what is not collected.
    expect(reproduction).toContain('Жодної суми');
  });

  it('numbers a revisited screen by where it was, not by where it first appeared', () => {
    // Головний → Місяць → Головний → Рахунки is ordinary use, and `indexOf` numbered the third
    // entry «1.» because it matched the first. The trail is a sequence, so it counts as one.
    const revisiting: JournalEntry[] = ['/(tabs)', '/(tabs)/month', '/(tabs)', '/(tabs)/accounts'].map(
      (name, index) => ({ id: `r${index}`, at: at(index), kind: 'screen', name }),
    );

    const text = renderReport({ ...report, journal: revisiting });
    const reproduction = text.slice(text.indexOf('## Reproduction context'));

    expect(reproduction).toContain('1. /(tabs)');
    expect(reproduction).toContain('2. /(tabs)/month');
    expect(reproduction).toContain('3. /(tabs)');
    expect(reproduction).toContain('4. /(tabs)/accounts');
  });

  it('lifts the failures out of the журнал without losing the stack', () => {
    const text = renderReport(report);
    const failures = text.slice(
      text.indexOf('## Relevant failures/errors'),
      text.indexOf('## Screenshots'),
    );

    // The prompting one whole, with its stack readable as a stack…
    expect(failures).toContain('  at AccountsScreen\n  at Stack');
    // …and every other failure or crash the журнал holds, counted.
    expect(failures).toContain('### Інші збої та падіння в журналі');
  });
});

describe('one renderer, two texts', () => {
  it('Scenario: The rendered text is the репорт — and only the file carries the bytes', () => {
    const onScreen = renderReport(report);
    const file = renderReportFile(report, images);

    // Named in both, so the owner can see a file would carry them…
    expect(onScreen).toContain('shot-1.png');
    expect(file).toContain('shot-1.png');
    // …but the bytes are only ever in the file.
    expect(onScreen).not.toContain('data:image');
    expect(onScreen).not.toContain('base64');
    expect(file).toContain('data:image/png;base64,');
    expect(file).toContain('Дістати: скопіюйте рядок після `base64,`');
  });

  it('holds «Screenshots» exactly once, in position 9 of 10, in both texts', () => {
    for (const text of [renderReport(report), renderReportFile(report, images)]) {
      expect(text.split('## Screenshots · Скріншоти')).toHaveLength(2);
      const positions = positionsOf(text);
      expect(positions.every((at) => at >= 0)).toBe(true);
      expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
      // The picture never lands after «Reproduction context» — the bug appending would have caused.
      expect(text.indexOf('## Screenshots')).toBeLessThan(text.indexOf('## Reproduction context'));
    }
  });

  it('Scenario: A скріншот that could not be taken is named', () => {
    const text = renderReport({
      ...report,
      screenshots: [],
      captureFailure: 'Вікно захищене від знімків',
    });

    expect(text).toContain('Скріншот не вдалося зробити: Вікно захищене від знімків');
    // And the same is true of the file, since there is one renderer.
    expect(renderReportFile({ ...report, screenshots: [], captureFailure: 'Вікно захищене від знімків' }, [])).toContain(
      'Вікно захищене від знімків',
    );
  });

  it('says a скріншот it holds could not be read, rather than dropping it', () => {
    // Its row is there, its file has gone. The file says so instead of silently shrinking.
    expect(renderReportFile(report, [])).toContain('Файл не вдалося прочитати.');
  });
});
