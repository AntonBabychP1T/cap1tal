import { canonicalJson } from '../backup/canonical';
import { formatMoney } from '../ui/amount-input';
import { monthLabel } from '../ui/months';
import { minorUnitsOf, type Amount } from './decimal';
import type { AnalysisPackage, CurrencyReport } from './package';
import {
  CONTEXT,
  DETAIL_INSTRUCTIONS,
  INSTRUCTIONS,
  REQUEST,
  SHORT_REQUEST,
  type PromptProfile,
} from './prompt';

/**
 * The файл для аналізу: one пакет rendered as one self-contained text an assistant can answer from
 * with nothing added by the owner.
 *
 * Five sections, in the order they have to be read in. **Запит** — what this файл is and the ask
 * to analyse it, first, because a файл handed to another app arrives as an attachment and the top
 * of it is the first thing anyone reads. **Інструкції** — what to do with the data
 * and what never to do with it. **Контекст** — what every word in it means, in the glossary's own
 * terms, so «інвестовано» is not guessed at. **Підсумок** — the same numbers a person can read,
 * formatted the way the app formats money. **Дані** — the пакет itself, whole, so nothing an
 * assistant might want is missing and nothing has to be inferred from prose.
 *
 * Markdown, because the файл is read by a person first — in «Показати файл», before it goes
 * anywhere — and by a model second, and headings are what carry the five sections to both.
 *
 * The rendering is repeatable to the character: the prompt is constant, the summary is a fold over
 * the пакет in the пакет's own order, and the data section goes through `canonicalJson`, whose
 * sorted keys are what make two renderings of one пакет the same bytes. That is what lets the
 * preview, the copied text and the shared file be the same thing rather than three that agree.
 *
 * Every figure in `## Підсумок` comes from the пакет through `minorUnitsOf` — the summary can only
 * show what the data already says, so «no summary figure is absent from the data section» is a
 * property of the code and not a rule someone has to remember.
 */

export interface AnalysisDocument {
  /** `cap1tal-ai-monthly-picture-2026-06_2026-08.md`. */
  readonly name: string;
  /** Request + instructions + context + summary + data, in that order. */
  readonly text: string;
  /**
   * The короткий запит offered to the phone beside the файл, and copied on its own.
   *
   * It lives here so the screen never assembles text of its own: what goes with the файл and what
   * lands on the clipboard are one constant, read from the same place.
   */
  readonly shortRequest: string;
  readonly package: AnalysisPackage;
  readonly profile: PromptProfile;
}

const TITLE = '# cap1tal · AI-аналіз місячної картини';

/** The Ukrainian name of a kind — the glossary's own term, never «бюджет» (vision §9 owns that). */
const KIND_LABEL: Readonly<Record<AnalysisPackage['kind'], string>> = {
  'monthly-picture': 'місячна картина',
};

export function documentName(packaged: AnalysisPackage): string {
  return `cap1tal-ai-${packaged.kind}-${packaged.period.from}_${packaged.period.to}.md`;
}

/** A сума of the пакет, written the way every screen of the app writes one: «4 125,34 UAH». */
function shown(amount: Amount): string {
  return formatMoney(minorUnitsOf(amount));
}

/** «25,00 %» from 2500 basis points — and «—» for the `null` the пакет means as «no number». */
function percent(basisPoints: number | null): string {
  if (basisPoints === null) {
    return '—';
  }
  const negative = basisPoints < 0;
  const digits = String(Math.abs(basisPoints)).padStart(3, '0');
  return `${negative ? '−' : ''}${digits.slice(0, -2)},${digits.slice(-2)} %`;
}

function monthColumn(month: string, partial: boolean): string {
  return partial ? `${monthLabel(month)} (частковий)` : monthLabel(month);
}

function summaryOf(report: CurrencyReport): string[] {
  const lines: string[] = [`### ${report.currency}`, ''];

  lines.push('| Місяць | Витрачено | Дохід | Інвестовано | Відкладено | Позичено | Залишилось |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const month of report.months) {
    lines.push(
      `| ${monthColumn(month.month, month.partial)} | ${shown(month.spent)} | ${shown(month.income)} ` +
        `| ${shown(month.invested)} | ${shown(month.saved)} | ${shown(month.lent)} | ${shown(month.left)} |`,
    );
  }
  lines.push(
    `| **За період** | ${shown(report.period.spent)} | ${shown(report.period.income)} ` +
      `| ${shown(report.period.invested)} | ${shown(report.period.saved)} ` +
      `| ${shown(report.period.lent)} | ${shown(report.period.left)} |`,
  );
  lines.push('');
  lines.push(
    `Відкладено до доходу: ${percent(report.period.savingsRate)} · ` +
      `інвестовано до доходу: ${percent(report.period.investmentRate)}.`,
  );
  lines.push('');

  if (report.trends.largestCategories.length > 0) {
    lines.push('**Найбільші категорії за період**');
    lines.push('');
    for (const category of report.trends.largestCategories) {
      lines.push(`- ${category.name} — ${shown(category.total)} (${percent(category.share)})`);
    }
    lines.push('');
  }

  const exceeded = report.categories.filter(
    (category) => category.limit && category.limit.exceeded.length > 0,
  );
  if (exceeded.length > 0) {
    lines.push('**Перевищені ліміти**');
    lines.push('');
    for (const category of exceeded) {
      const overruns = category
        .limit!.exceeded.map((month) => `${monthLabel(month.month)} на ${shown(month.by)}`)
        .join(', ');
      lines.push(`- ${category.name} — ліміт ${shown(category.limit!.amount)}: ${overruns}`);
    }
    lines.push('');
  }

  return lines;
}

export function renderDocument(
  packaged: AnalysisPackage,
  profile: PromptProfile,
): AnalysisDocument {
  const partial = packaged.period.partialMonth;
  const header =
    `${packaged.schema} · версія ${packaged.version} · вид: ${KIND_LABEL[packaged.kind]} · ` +
    `період: ${packaged.period.from} — ${packaged.period.to} · станом на ${packaged.builtOn}` +
    (partial
      ? ` · ${partial.month} — частковий місяць, минуло ${partial.daysElapsed} з ${partial.daysInMonth} днів`
      : '');

  const period = `${packaged.period.from} — ${packaged.period.to}`;

  const lines: string[] = [TITLE, ''];

  // First, before the machine header and before every number: what this файл is, and the ask.
  lines.push('## Запит', '');
  for (const paragraph of REQUEST(KIND_LABEL[packaged.kind], period)) {
    lines.push(paragraph, '');
  }

  lines.push(header, '');

  lines.push('## Інструкції', '');
  for (const sentence of INSTRUCTIONS[profile]) {
    lines.push(`- ${sentence}`);
  }
  // Each detail strictly from its own flag, and from the пакет rather than from the choices: the
  // файл may only instruct about detail the пакет actually carries.
  if (packaged.included.descriptions) {
    lines.push(`- ${DETAIL_INSTRUCTIONS.descriptions}`);
  }
  if (packaged.included.transactions) {
    lines.push(`- ${DETAIL_INSTRUCTIONS.transactions}`);
  }
  lines.push('');

  lines.push('## Контекст', '');
  for (const sentence of CONTEXT) {
    lines.push(`- ${sentence}`);
  }
  lines.push('');

  lines.push('## Підсумок', '');
  if (packaged.history === 'short') {
    lines.push(
      `Історія коротка: транзакції є лише в ${packaged.counts.monthsWithData} місяці періоду — ` +
        'одного місяця не досить, щоб побачити тренд.',
      '',
    );
  }
  for (const report of packaged.byCurrency) {
    lines.push(...summaryOf(report));
  }
  if (packaged.approximateUah) {
    lines.push('### Приблизно в гривні', '');
    lines.push(
      'Приблизна оцінка, не сума: за курсом monobank на ' +
        packaged.approximateUah.rates.map((rate) => `${rate.currency} ${rate.rateAsOf}`).join(', ') +
        '.',
      '',
    );
    lines.push(
      `Витрачено ${shown(packaged.approximateUah.period.spent)} · ` +
        `дохід ${shown(packaged.approximateUah.period.income)} · ` +
        `залишилось ${shown(packaged.approximateUah.period.left)}.`,
      '',
    );
  }
  if (packaged.goals.length > 0) {
    lines.push('### Цілі', '');
    for (const goal of packaged.goals) {
      // A ціль whose progress rests on a conversion is in the пакет by назва, target and дата and
      // by nothing else: the файл says the progress is missing rather than showing «X з Y» from
      // numbers the пакет deliberately does not carry.
      if (goal.progressNotInPackage) {
        const by = goal.deadline === undefined ? '' : ` (до ${goal.deadline})`;
        lines.push(
          `- ${goal.name} — ${shown(goal.target)}${by}, прогрес не входить у пакет ` +
            '(рахунки цілі в різних валютах)',
        );
        continue;
      }
      // A ціль with no дата says neither «до …» nor «прострочена»: there is no deadline to name
      // and none to be past.
      const state =
        goal.reached === true
          ? 'досягнута'
          : goal.overdue === true
            ? 'прострочена'
            : goal.deadline === undefined
              ? 'без дати'
              : `до ${goal.deadline}`;
      const pace = goal.perMonth
        ? `, треба ${shown(goal.perMonth)} на місяць протягом ${goal.monthsLeft} міс.`
        : '';
      lines.push(
        `- ${goal.name} — ${shown(goal.progress!)} з ${shown(goal.target)}, ` +
          `лишилось ${shown(goal.remaining!)} (${state})${pace}`,
      );
    }
    lines.push('');
  }

  lines.push('## Дані', '');
  lines.push('```json');
  lines.push(canonicalJson(packaged));
  lines.push('```');
  lines.push('');

  return {
    name: documentName(packaged),
    text: lines.join('\n'),
    shortRequest: SHORT_REQUEST,
    package: packaged,
    profile,
  };
}
