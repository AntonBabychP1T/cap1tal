import { entryLine, fold, moment, type JournalEntry } from './journal';

/**
 * The репорт про помилку as values, and the one rendering of it.
 *
 * **One text, three destinations.** What the saved репорт's screen shows, what «Скопіювати» puts
 * on the clipboard and what «Передати» hands to the chooser are the same string — `renderReport`'s
 * — and the file only appends the image data to it. So «what the owner reads is what would leave»
 * is a property of the code rather than a promise two renderers have to keep in step. It is the
 * same discipline `src/analysis/document.ts` keeps for the файл для аналізу, and for the same
 * reason: the owner is the last check before anything leaves the phone, and they can only check
 * what they can see.
 *
 * **Markdown, because the репорт is read twice.** Once on the phone, by the owner, before it goes
 * anywhere; once at the laptop, in a chat, by the person who will fix the bug. Headings carry the
 * sections to both, and the fenced журнал survives being pasted.
 *
 * The rendering is deterministic to the character: every moment goes through `moment`, which
 * builds from the date's own parts rather than through `Intl`, and every section is a fold over
 * values the репорт already holds. Nothing here reads a clock, a locale or a device.
 */

/** Which tree this build came from — `app.config.js` reads it from git at bundle time. */
export interface BuildInfo {
  /** `app.json`'s version, as `expo-constants` reports it. */
  readonly version: string;
  /** The short commit, or `unknown` on a build made without git. */
  readonly commit: string;
  /** Whether the working tree had uncommitted changes when the bundle was made. */
  readonly dirty: boolean;
  readonly builtAt: string;
}

/** The phone, as much of it as reproduction needs and no more. */
export interface DeviceInfo {
  readonly platform: string;
  readonly systemVersion: string;
  readonly model: string;
}

/**
 * How much of each thing the phone holds — numbers only, never the things themselves.
 *
 * A bug that only shows up on a phone with two thousand транзакції and none on an empty one is a
 * bug these five numbers name. Anything more than a count would be the owner's money, and the
 * репорт does not carry the owner's money.
 */
export interface ReportCounts {
  readonly accounts: number;
  readonly transactions: number;
  readonly categories: number;
  readonly rules: number;
  readonly drafts: number;
}

/** One screenshot the owner attached: the name it is kept under, and when it was added. */
export interface ReportScreenshot {
  readonly name: string;
  readonly addedAt: Date;
}

export interface BugReport {
  readonly id: string;
  readonly createdAt: Date;
  /** «Що я робив» — the one line the form requires. */
  readonly did: string;
  /** «Що сталося» and «Чого я очікував» — offered, never required. */
  readonly happened: string | null;
  readonly expected: string | null;
  /** The route of the screen the репорт was filed from, derived from the журнал. */
  readonly route: string;
  readonly build: BuildInfo;
  readonly device: DeviceInfo;
  readonly migrationsApplied: number;
  readonly counts: ReportCounts;
  /**
   * The whole журнал as it stood when the репорт was created — a copy, not a view. The live
   * журнал keeps rolling (every screen change is an entry), so a репорт that pointed at it would
   * eventually stop being able to show the failure it was filed about.
   */
  readonly journal: readonly JournalEntry[];
  /** The failure or crash that prompted this репорт, where one did. */
  readonly prompting: JournalEntry | null;
  readonly screenshots: readonly ReportScreenshot[];
  readonly handedOverAt: Date | null;
}

/** One screenshot's bytes, read through the files port only when a file is being made. */
export interface ReportImage {
  readonly name: string;
  readonly mime: string;
  readonly base64: string;
}

const TITLE = '# cap1tal · репорт про помилку';

function section(heading: string, body: readonly string[]): string {
  return [heading, '', ...body].join('\n');
}

/** «— » for a line the owner left empty: the репорт says it was left empty rather than omitting it. */
const EMPTY = '—';

function written(value: string | null): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : EMPTY;
}

function promptingSection(prompting: JournalEntry | null): string {
  if (prompting === null) {
    return section('## Що спричинило', ['Нічого — репорт заведено власноруч.']);
  }
  const head = [
    `- Коли: ${moment(prompting.at)}`,
    `- Що: ${prompting.kind === 'crash' ? 'падіння' : 'збій'} · ${prompting.name}`,
  ];
  // The detail whole and unfolded — this is the one place a stack is readable as a stack. The
  // журнал below still carries the same entry on its own single line.
  const detail =
    prompting.detail === undefined ? [] : ['', '```', ...prompting.detail.split(/\r\n|\r|\n/), '```'];
  return section('## Що спричинило', [...head, ...detail]);
}

/**
 * The репорт as one text — everything it holds except the image bytes.
 *
 * This is what the screen shows and what the clipboard gets. The screenshots are named here so the
 * owner can see that a file would carry them; only `renderReportFile` adds the data itself, since
 * a megabyte of base64 on the clipboard helps nobody.
 */
export function renderReport(report: BugReport): string {
  const screenshots =
    report.screenshots.length === 0
      ? 'немає'
      : report.screenshots.map((shot) => shot.name).join(' · ');

  const meta = section('## Репорт', [
    `- Створено: ${moment(report.createdAt)}`,
    `- Екран: ${report.route}`,
    `- Передано: ${report.handedOverAt === null ? 'ще ні' : moment(report.handedOverAt)}`,
    `- Скріншоти: ${screenshots}`,
  ]);

  const wrote = section('## Що написав власник', [
    '### Що я робив',
    '',
    written(report.did),
    '',
    '### Що сталося',
    '',
    written(report.happened),
    '',
    '### Чого я очікував',
    '',
    written(report.expected),
  ]);

  const build = section('## Збірка і пристрій', [
    `- Версія: ${report.build.version}`,
    `- Коміт: ${report.build.commit}${report.build.dirty ? ' (дерево було брудне)' : ''}`,
    `- Зібрано: ${report.build.builtAt}`,
    `- Платформа: ${report.device.platform} ${report.device.systemVersion}`,
    `- Пристрій: ${report.device.model}`,
    `- Міграцій застосовано: ${report.migrationsApplied}`,
  ]);

  const counts = section('## Що на телефоні', [
    `- Рахунки: ${report.counts.accounts}`,
    `- Транзакції: ${report.counts.transactions}`,
    `- Категорії: ${report.counts.categories}`,
    `- Правила: ${report.counts.rules}`,
    `- Чернетки: ${report.counts.drafts}`,
  ]);

  const journal = section(`## Журнал (${report.journal.length})`, [
    '```',
    ...report.journal.map(entryLine),
    '```',
  ]);

  return [
    TITLE,
    '',
    meta,
    '',
    wrote,
    '',
    build,
    '',
    promptingSection(report.prompting),
    '',
    counts,
    '',
    journal,
    '',
  ].join('\n');
}

/**
 * The one file that is handed over: the rendered text with every screenshot embedded after it.
 *
 * Base64 in fenced blocks rather than a zip — one file is what a репорт is, a zip would be a
 * dependency and an untested runtime, and three lines at the laptop turn a block back into a PNG.
 * An image named in the репорт but missing from `images` (its file gone) is said to be missing
 * rather than silently dropped.
 */
export function renderReportFile(report: BugReport, images: readonly ReportImage[]): string {
  if (report.screenshots.length === 0) {
    return renderReport(report);
  }
  const blocks = report.screenshots.flatMap((shot) => {
    const image = images.find((candidate) => candidate.name === shot.name);
    if (image === undefined) {
      return [`### ${shot.name}`, '', 'Файл не вдалося прочитати.', ''];
    }
    return [
      `### ${shot.name}`,
      '',
      '```',
      `data:${image.mime};base64,${fold(image.base64)}`,
      '```',
      '',
    ];
  });
  return [renderReport(report), section('## Скріншоти', blocks).trimEnd(), ''].join('\n');
}

/** `cap1tal-report-2026-09-02-1731.md` — the name the chooser shows. */
export function reportFileName(report: BugReport): string {
  const [date = '', time = ''] = moment(report.createdAt).split(' ');
  return `cap1tal-report-${date}-${time.slice(0, 5).replace(':', '')}.md`;
}
