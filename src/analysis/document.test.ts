import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault } from '../domain/transaction';
import { documentName, renderDocument } from './document';
import { fixtureInput, fixturePackage } from './document.fixture';
import { buildAnalysisPackage, type AnalysisPackage } from './package';

const packaged = fixturePackage();
const document = renderDocument(packaged, 'external-advanced');

/** The fenced JSON block of `## Дані`, as text. */
function dataBlock(text: string): string {
  const start = text.indexOf('```json\n');
  const end = text.indexOf('\n```', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return text.slice(start + '```json\n'.length, end);
}

/** Everything between `## Підсумок` and `## Дані`. */
function summarySection(text: string): string {
  return text.slice(text.indexOf('## Підсумок'), text.indexOf('## Дані'));
}

/** Every сума the пакет carries, as the `"4125.34"` texts it writes them in. */
function amountsOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) amountsOf(entry, found);
  } else if (value !== null && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    if (typeof row.amount === 'string' && typeof row.currency === 'string') {
      found.add(`${row.amount} ${row.currency}`);
    }
    for (const entry of Object.values(row)) amountsOf(entry, found);
  }
  return found;
}

describe('renderDocument', () => {
  it('is one text of four sections, in the order they are read in', () => {
    const headings = document.text
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice(3));

    expect(headings).toEqual(['Інструкції', 'Контекст', 'Підсумок', 'Дані']);
    expect(document.text.startsWith('# cap1tal · AI-аналіз місячної картини')).toBe(true);
    expect(document.profile).toBe('external-advanced');
    expect(document.package).toBe(packaged);
  });

  it('names the schema, the version, the kind, the period and the day it was built for', () => {
    const header = document.text.split('\n')[2]!;

    expect(header).toContain('cap1tal.analysis-package');
    expect(header).toContain('версія 1');
    expect(header).toContain('вид: місячна картина');
    expect(header).toContain('період: 2026-07 — 2026-09');
    expect(header).toContain('станом на 2026-09-02');
    // And says the last month is not finished.
    expect(header).toContain('2026-09 — частковий місяць, минуло 2 з 30 днів');
    // «бюджет» is vision §9's word for ліміти and is never a kind of AI-аналіз.
    expect(document.text).not.toContain('бюджет');
  });

  it('Scenario: The data section is the пакет', () => {
    expect(JSON.parse(dataBlock(document.text))).toEqual(packaged);
  });

  it('Scenario: Rendering is repeatable', () => {
    const again = renderDocument(fixturePackage(), 'external-advanced');

    expect(again.text).toBe(document.text);
    expect(again.name).toBe(document.name);
  });

  it('Scenario: The summary repeats the data, formatted', () => {
    const summary = summarySection(document.text);

    // The пакет's August UAH витрачено, shown the way every screen of the app shows a сума.
    const august = packaged.byCurrency[0]!.months.find((month) => month.month === '2026-08')!;
    expect(august.spent).toEqual({ amount: '40900.00', currency: 'UAH' });
    // The thousands separator is the no-break space `formatMoney` writes, as on every screen.
    expect(summary).toContain('40\u00A0900,00 UAH');

    // And no figure of its own: every сума in the summary is one the data section carries.
    const carried = amountsOf(packaged);
    const shown = summary.match(/−?[\d\u00A0]+,\d{2} [A-Z]{3}/g) ?? [];
    expect(shown.length).toBeGreaterThan(20);
    for (const text of shown) {
      const reparsed = text.replace(/\u00A0/g, '').replace('−', '-').replace(',', '.');
      expect(carried).toContain(reparsed);
    }
  });

  it('says so when the history is short', () => {
    const short = buildAnalysisPackage({
      ...fixtureInput,
      transactions: [
        expenseByDefault({
          id: 'only',
          date: '2026-09-01',
          accountId: 'card',
          amount: money(100000, 'UAH'),
          categoryId: 'cafe',
        }),
      ],
    }) as AnalysisPackage;

    expect(renderDocument(short, 'external-advanced').text).toContain('Історія коротка');
    // The full fixture is not short, and says nothing of the kind.
    expect(document.text).not.toContain('Історія коротка');
  });

  it('marks the приблизно в гривні as approximate and dates its rate', () => {
    const summary = summarySection(document.text);

    expect(summary).toContain('Приблизна оцінка, не сума');
    expect(summary).toContain('USD 2026-08-30');
  });

  it('names no рахунок, no id and no опис of the fixture', () => {
    for (const secret of ['mono black', 'Банка на авто', 'Військові облігації', 'goal-car', 'card']) {
      expect(document.text).not.toContain(secret);
    }
  });

  it('names the файл by its kind and its period', () => {
    expect(documentName(packaged)).toBe('cap1tal-ai-monthly-picture-2026-07_2026-09.md');
    expect(document.name).toBe('cap1tal-ai-monthly-picture-2026-07_2026-09.md');

    const june = buildAnalysisPackage({
      ...fixtureInput,
      period: { from: '2026-06', to: '2026-08' },
    }) as AnalysisPackage;
    expect(documentName(june)).toBe('cap1tal-ai-monthly-picture-2026-06_2026-08.md');
  });

  it('renders the fixture exactly as `document.golden.md` holds it', () => {
    // The golden file is the whole rendering of one пакет. A change to any wording — an
    // instruction, a context sentence, a heading, a table — fails here and is updated on purpose:
    // this text is what leaves the phone, and it should never change by accident.
    const golden = readFileSync(new URL('./document.golden.md', import.meta.url), 'utf8');

    expect(document.text).toBe(golden);
  });
});

describe('the fixture the golden file stands on', () => {
  it('holds every part the файл can render', () => {
    expect(packaged.byCurrency).toHaveLength(2);
    expect(packaged.approximateUah).not.toBeNull();
    expect(packaged.goals).toHaveLength(1);
    expect(packaged.period.partialMonth).not.toBeNull();
    expect(
      packaged.byCurrency[0]!.categories.some((c) => c.limit && c.limit.exceeded.length > 0),
    ).toBe(true);
    // And the accounts it names are real ones, so «no рахунок назва» above is a real assertion.
    expect(account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' }).name).toBe(
      'mono black',
    );
  });
});
