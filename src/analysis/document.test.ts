import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault } from '../domain/transaction';
import { documentName, renderDocument } from './document';
import { DETAIL_INSTRUCTIONS } from './prompt';
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

/** Everything between `## Інструкції` and `## Контекст`. */
function instructionSection(text: string): string {
  return text.slice(text.indexOf('## Інструкції'), text.indexOf('## Контекст'));
}

/** Everything between `## Запит` and `## Інструкції` — the header line included. */
function requestSection(text: string): string {
  return text.slice(text.indexOf('## Запит'), text.indexOf('## Інструкції'));
}

/** The machine header: the one line that names the schema and the version. */
function headerLine(text: string): string {
  return text.split('\n').find((line) => line.startsWith('cap1tal.analysis-package'))!;
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
  it('is one text of five sections, in the order they are read in', () => {
    const headings = document.text
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice(3));

    expect(headings).toEqual(['Запит', 'Інструкції', 'Контекст', 'Підсумок', 'Дані']);
    expect(document.text.startsWith('# cap1tal · AI-аналіз місячної картини')).toBe(true);
    expect(document.profile).toBe('external-advanced');
    expect(document.package).toBe(packaged);
  });

  it('Scenario: The request is the first thing in the файл', () => {
    const lines = document.text.split('\n');

    // Only the title stands above it, and the machine header stands below it.
    expect(lines[0]).toBe('# cap1tal · AI-аналіз місячної картини');
    expect(lines[2]).toBe('## Запит');
    expect(document.text.indexOf('## Запит')).toBeLessThan(
      document.text.indexOf('cap1tal.analysis-package'),
    );
    // And before every other section and every number.
    for (const heading of ['## Інструкції', '## Контекст', '## Підсумок', '## Дані']) {
      expect(document.text.indexOf('## Запит')).toBeLessThan(document.text.indexOf(heading));
    }
  });

  it('Scenario: The request names the task, the kind and the period', () => {
    const request = requestSection(document.text);

    expect(request).toContain('пакет фінансових даних із застосунку cap1tal');
    expect(request).toContain('Проаналізуй наведені дані');
    expect(request).toContain('практичний фінансовий огляд за цей період');
    expect(request).toContain('місячна картина за період 2026-07 — 2026-09');
    expect(request).toContain('Усе потрібне є в цьому ж файлі, нижче');
  });

  it('Scenario: The request adds no number', () => {
    // Everything above `## Інструкції` except the machine header — which is the header's own job,
    // and stands below the запит for exactly that reason.
    const request = requestSection(document.text).replace(headerLine(document.text), '');

    // No сума, no share, no count: every figure of the файл is in `## Підсумок` or in `## Дані`.
    expect(request).not.toMatch(/\d+,\d{2}/);
    expect(request).not.toMatch(/%/);
    const withoutPeriod = request.split('2026-07 — 2026-09').join('').split('cap1tal').join('');
    expect(withoutPeriod).not.toMatch(/\d/);
  });

  it('names the schema, the version, the kind, the period and the day it was built for', () => {
    const header = headerLine(document.text);

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

    // And the same for the пакет that carries both details: one пакет, one файл, byte for byte.
    const detailed = { descriptions: true, transactions: true };
    expect(renderDocument(fixturePackage(detailed), 'external-advanced').text).toBe(
      renderDocument(fixturePackage(detailed), 'external-advanced').text,
    );
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
    // The fixture's транзакції do carry описи — that is what the detailed golden is for — and with
    // «Продавці» off not one word of them reaches the файл, in any casing.
    const lowered = document.text.toLowerCase();
    for (const merchant of ['aroma kava', 'сільпо', 'автопрофі']) {
      expect(lowered, `the файл carries «${merchant}»`).not.toContain(merchant);
    }
    expect(document.text).not.toContain('"merchants"');
  });

  it('shows the продавці it was given when «Продавці» is on', () => {
    // The other half of the same claim, so «off leaves nothing behind» is a real assertion and not
    // a fixture that had nothing to leave behind in the first place.
    const detailed = renderDocument(
      fixturePackage({ descriptions: true, transactions: true }),
      'external-advanced',
    ).text.toLowerCase();

    for (const merchant of ['aroma kava', 'сільпо 4512', 'сто автопрофі']) {
      expect(detailed).toContain(merchant);
    }
    // And the two spellings of the кафе across two months are folded into one продавець.
    expect(detailed).toContain('"merchant":"aroma kava"');
    expect(detailed).toContain('"count":2');
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

  it('renders the fixture exactly as the two goldens hold it', () => {
    // A golden file is the whole rendering of one пакет. A change to any wording — an instruction,
    // a context sentence, a heading, a table — fails here and is updated on purpose, by
    // `npx tsx scripts/regen-analysis-goldens.ts`: this text is what leaves the phone, and it
    // should never change by accident.
    const goldens = [
      ['document.golden.md', { descriptions: false, transactions: false }],
      ['document-detailed.golden.md', { descriptions: true, transactions: true }],
    ] as const;

    for (const [file, included] of goldens) {
      const golden = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');

      expect(renderDocument(fixturePackage(included), 'external-advanced').text, file).toBe(golden);
    }
    // The first of them is the файл this whole describe reads.
    expect(document.text).toBe(readFileSync(new URL('./document.golden.md', import.meta.url), 'utf8'));
  });
});

describe('the instructions about detail the owner switched on', () => {
  const instructions = (descriptions: boolean, transactions: boolean): string =>
    instructionSection(
      renderDocument(fixturePackage({ descriptions, transactions }), 'external-advanced').text,
    );

  it('Scenario: Опис detail is instructed as context only', () => {
    const both = instructions(true, true);

    expect(both).toContain(DETAIL_INSTRUCTIONS.descriptions);
    // Context beside the aggregates, and never a figure of the assistant's own.
    expect(both).toContain('Читай їх як контекст поруч з агрегатами');
    expect(both).toContain('не підсумовуй їх, не рахуй за ними і не роби з них власного числа');
  });

  it('Scenario: One switch on does not speak for the other', () => {
    const merchantsOnly = instructions(true, false);

    expect(merchantsOnly).toContain(DETAIL_INSTRUCTIONS.descriptions);
    expect(merchantsOnly).not.toContain(DETAIL_INSTRUCTIONS.transactions);
    expect(merchantsOnly).not.toContain('Окремі транзакції');

    const rowsOnly = instructions(false, true);

    expect(rowsOnly).toContain(DETAIL_INSTRUCTIONS.transactions);
    expect(rowsOnly).not.toContain(DETAIL_INSTRUCTIONS.descriptions);
    expect(rowsOnly).not.toContain('Продавці');
  });

  it('Scenario: A switch that is off leaves no instruction behind', () => {
    const neither = instructions(false, false);

    expect(neither).not.toContain('Продавці');
    expect(neither).not.toContain('Окремі транзакції');
    expect(neither).not.toContain(DETAIL_INSTRUCTIONS.descriptions);
    expect(neither).not.toContain(DETAIL_INSTRUCTIONS.transactions);
  });

  it('reads the switches from the пакет, so the файл can only describe what it holds', () => {
    const packagedWithBoth = fixturePackage({ descriptions: true, transactions: true });

    expect(packagedWithBoth.included).toEqual({ descriptions: true, transactions: true });
    // The renderer takes one argument, the пакет, and there is no second opinion to disagree with.
    expect(instructionSection(renderDocument(packagedWithBoth, 'external-advanced').text)).toContain(
      DETAIL_INSTRUCTIONS.transactions,
    );
  });
});

describe('the fixture the golden file stands on', () => {
  it('holds every part the файл can render', () => {
    expect(packaged.byCurrency).toHaveLength(2);
    expect(packaged.approximateUah).not.toBeNull();
    expect(packaged.goals).toHaveLength(3);
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
