import { describe, expect, it } from 'vitest';

import type { JournalEntry } from './journal';
import {
  renderReport,
  renderReportFile,
  reportFileName,
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
    expect(text).toContain('Екран: /(tabs)/accounts');
    expect(text).toContain('Створено: 2026-09-02 17:10:00.000');
    // The failure with its stack, whole, in its own section.
    expect(text).toContain('## Що спричинило');
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
    expect(text).toContain('Журнал (10)');

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

    expect(text).toContain('Нічого — репорт заведено власноруч.');
    expect(text).toContain('Скріншоти: немає');
    // Still the whole context.
    expect(text).toContain('Коміт: 3df8103');
    expect(text).toContain('Журнал (10)');
  });

  it('marks the lines the owner left empty rather than dropping them', () => {
    const text = renderReport({ ...report, happened: null, expected: '   ' });

    expect(text).toContain('### Що сталося\n\n—');
    expect(text).toContain('### Чого я очікував\n\n—');
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
