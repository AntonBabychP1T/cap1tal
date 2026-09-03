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

/**
 * How a репорт came to be filed — which of the four doors the owner used.
 *
 * A fact about the moment of filing that nothing else records, and the one a second reader wants
 * first: `here` means a human was standing in front of the screen and pointing at it, `dialog` and
 * `crash` mean the app asked, `section` means the owner went looking. Nullable on `BugReport`
 * because a репорт stored before this was recorded has no honest answer, and a guess in a
 * diagnostic file is worse than a blank (design D7).
 */
export type ReportOrigin = 'here' | 'dialog' | 'crash' | 'section';

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
  /** Which door this репорт came through, or `null` on one stored before that was recorded. */
  readonly origin: ReportOrigin | null;
  /**
   * Why there is no скріншот, when one was to be taken and could not be — in Ukrainian, as the
   * owner was told it.
   *
   * Stored rather than merely shown, because the saved репорт is rendered again after a restart
   * and «скріншота немає» without the reason is the one line of a репорт that cannot be
   * reproduced. `null` both when the capture succeeded and when none was ever attempted: the
   * rendering distinguishes those by whether there are screenshots, and an invented reason would
   * be worse than none.
   */
  readonly captureFailure: string | null;
}

/** One screenshot's bytes, read through the files port only when a file is being made. */
export interface ReportImage {
  readonly name: string;
  readonly mime: string;
  readonly base64: string;
}

/**
 * How many routes of the trail the репорт shows.
 *
 * Twenty is a dozen screens of context and a few lines of text. It is a *fold* over the журнал the
 * репорт already stores and never a stored value of its own (design D7): storing it would be
 * storing the same data twice and inviting the two copies to disagree, and the whole журнал is in
 * the same file anyway for anyone who wants more.
 */
export const ROUTE_TRAIL_LIMIT = 20;

/**
 * The screens the owner passed through before filing, oldest first — routes and nothing else.
 *
 * Nothing is collected for this. Every route is already a `screen` entry the журнал holds, so the
 * trail is a filter and a slice, and the privacy question it could have raised was answered when
 * `JournalEntry` was given no field a сума could go in.
 */
export function routeTrail(
  journal: readonly JournalEntry[],
  limit: number = ROUTE_TRAIL_LIMIT,
): readonly string[] {
  const routes = journal.filter((entry) => entry.kind === 'screen').map((entry) => entry.name);
  return limit >= routes.length ? routes : routes.slice(routes.length - limit);
}

/**
 * Section 1 of ten. English anchor, Ukrainian gloss — the same shape every other heading takes, so
 * the reader at the laptop can find the top of the report the way they find every other section.
 */
const TITLE = '# Bug report · Репорт про помилку';

function section(heading: string, body: readonly string[]): string {
  return [heading, '', ...body].join('\n');
}

/** «— » for a line the owner left empty: the репорт says it was left empty rather than omitting it. */
const EMPTY = '—';

function written(value: string | null): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : EMPTY;
}

/** What each door is called in the репорт — the label, never the enum value. */
const ORIGIN_LABELS: Readonly<Record<ReportOrigin, string>> = {
  here: 'з екрана, де сталася проблема',
  dialog: 'з діалогу про збій',
  crash: 'з екрана падіння',
  section: 'із «Репорти про помилки»',
};

/**
 * A heading addressed to both readers: English for the one at the laptop, Ukrainian for the owner.
 *
 * The English half is the anchor a coding agent looks for; the Ukrainian half is what keeps the
 * text the owner's own. This is the one place in the app where English appears on a screen, and it
 * is confined to headings — every word of content below them stays Ukrainian (design D8).
 */
function heading(english: string, ukrainian: string): string {
  return `## ${english} · ${ukrainian}`;
}

/** What a section with nothing in it says, so that no section is ever simply missing. */
const NOTHING = 'Немає.';

/**
 * The failure or crash that prompted the репорт, whole, followed by every other one the журнал
 * holds.
 *
 * The prompting entry is rendered with its stack readable as a stack — this is the one place that
 * happens, since the журнал below folds every entry onto one line. The rest are the `failure` and
 * `crash` entries in order, which is what turns «it broke» into «it broke after these three other
 * things went wrong».
 */
function failuresSection(report: BugReport): string {
  const lines: string[] = [];

  if (report.prompting === null) {
    lines.push('Нічого не спричинило — репорт заведено власноруч.');
  } else {
    lines.push(
      `- Коли: ${moment(report.prompting.at)}`,
      `- Що: ${report.prompting.kind === 'crash' ? 'падіння' : 'збій'} · ${report.prompting.name}`,
    );
    if (report.prompting.detail !== undefined) {
      lines.push('', '```', ...report.prompting.detail.split(/\r\n|\r|\n/), '```');
    }
  }

  // Everything else that went wrong, prompting entry excluded so it is not said twice.
  const others = report.journal.filter(
    (entry) =>
      (entry.kind === 'failure' || entry.kind === 'crash') && entry.id !== report.prompting?.id,
  );
  lines.push('', `### Інші збої та падіння в журналі (${others.length})`, '');
  lines.push(...(others.length === 0 ? [NOTHING] : ['```', ...others.map(entryLine), '```']));

  return section(heading('Relevant failures/errors', 'Що спричинило'), lines);
}

/**
 * Every скріншот by name — and, in the file that is handed over, its bytes with it.
 *
 * One section for both texts, which is why `images` is an argument rather than a second renderer
 * (design D8): appending the pictures after the whole text would put a second «Screenshots» after
 * «Reproduction context» and leave this one empty.
 */
function screenshotsSection(report: BugReport, images: readonly ReportImage[]): string {
  const lines: string[] = [];

  if (report.screenshots.length === 0) {
    // Two different nothings, and the difference is the whole point of storing the reason: a
    // репорт nobody tried to photograph, and one the app could not photograph and said why.
    lines.push(
      report.captureFailure === null
        ? NOTHING
        : `Скріншот не вдалося зробити: ${report.captureFailure}`,
    );
    return section(heading('Screenshots', 'Скріншоти'), lines);
  }

  for (const shot of report.screenshots) {
    lines.push(`### ${shot.name}`, '');
    if (images.length === 0) {
      // The on-screen and copied text: named, never carried. A megabyte of base64 on the clipboard
      // helps nobody, and the owner can still see that a file would carry it.
      lines.push(`Додано ${moment(shot.addedAt)}. У файлі, який передається, буде саме зображення.`, '');
      continue;
    }
    const image = images.find((candidate) => candidate.name === shot.name);
    if (image === undefined) {
      // Named in the репорт but its file has gone. Said, not silently dropped.
      lines.push('Файл не вдалося прочитати.', '');
      continue;
    }
    lines.push('```', `data:${image.mime};base64,${fold(image.base64)}`, '```', '');
  }

  if (images.length > 0) {
    lines.push(
      'Дістати: скопіюйте рядок після `base64,` і виконайте `base64 -d > shot.png`.',
      'Рядок склеєно в один — приберіть з нього пробіли, якщо вони лишилися.',
    );
  }
  if (report.captureFailure !== null) {
    lines.push('', `Скріншот екрана зробити не вдалося: ${report.captureFailure}`);
  }

  return section(heading('Screenshots', 'Скріншоти'), lines);
}

/**
 * The репорт as one text — the ten sections, in order, for the two readers it has.
 *
 * `images` is what makes one renderer serve both destinations. Called with nothing — the screen
 * and the clipboard — «Screenshots» names the pictures without their data; called with them, the
 * same section carries the base64 in the same place. So «what the owner reads is what would leave»
 * stays a property of the code and not a promise two functions have to keep in step (design D8).
 *
 * Every section is present even when the репорт has nothing for it: a reader who knows the shape
 * can tell «no failures» from «this build forgot to write them», and a missing heading is exactly
 * the ambiguity a diagnostic file must not have.
 */
export function renderReport(report: BugReport, images: readonly ReportImage[] = []): string {
  const observation = section(heading('User observation', 'Що не так'), [
    '### Що я робив',
    '',
    written(report.did),
    '',
    '### Що сталося',
    '',
    written(report.happened),
  ]);

  const expected = section(heading('Expected behaviour', 'Чого я очікував'), [
    written(report.expected),
  ]);

  const context = section(heading('Context', 'Контекст'), [
    `- Створено: ${moment(report.createdAt)}`,
    `- Заведено: ${report.origin === null ? 'невідомо звідки' : ORIGIN_LABELS[report.origin]}`,
    `- Передано: ${report.handedOverAt === null ? 'ще ні' : moment(report.handedOverAt)}`,
  ]);

  const build = section(heading('App/build/device', 'Збірка і пристрій'), [
    `- Версія: ${report.build.version}`,
    `- Коміт: ${report.build.commit}${report.build.dirty ? ' (дерево було брудне)' : ''}`,
    `- Зібрано: ${report.build.builtAt}`,
    `- Платформа: ${report.device.platform} ${report.device.systemVersion}`,
    `- Пристрій: ${report.device.model}`,
    `- Міграцій застосовано: ${report.migrationsApplied}`,
  ]);

  const route = section(heading('Current route', 'Екран'), [report.route]);

  const journal = section(heading(`Recent journal (${report.journal.length})`, 'Журнал'), [
    ...(report.journal.length === 0 ? [NOTHING] : ['```', ...report.journal.map(entryLine), '```']),
  ]);

  const trail = routeTrail(report.journal);
  const reproduction = section(heading('Reproduction context', 'Як відтворити'), [
    `### Шлях екранами (${trail.length})`,
    '',
    // Numbered by position, never by `indexOf`: revisiting a screen is ordinary use (Головний →
    // Місяць → Головний), and `indexOf` would number the second visit with the first one's number.
    ...(trail.length === 0 ? [NOTHING] : trail.map((name, at) => `${at + 1}. ${name}`)),
    '',
    '### Що на телефоні',
    '',
    `- Рахунки: ${report.counts.accounts}`,
    `- Транзакції: ${report.counts.transactions}`,
    `- Категорії: ${report.counts.categories}`,
    `- Правила: ${report.counts.rules}`,
    `- Чернетки: ${report.counts.drafts}`,
    '',
    '### Чого тут немає',
    '',
    'Жодної суми, назви рахунку чи категорії, опису, тексту банківського сповіщення, токена',
    'monobank чи даних бекапу. Єдина цитата — власна відмова застосунку, як її бачив власник.',
    ...(report.screenshots.length === 0
      ? []
      : [
          'Скріншот — виняток: він показує те, що було на екрані, разом із сумами й назвами.',
        ]),
  ]);

  return [
    TITLE,
    '',
    observation,
    '',
    expected,
    '',
    context,
    '',
    build,
    '',
    route,
    '',
    journal,
    '',
    failuresSection(report),
    '',
    screenshotsSection(report, images),
    '',
    reproduction,
    '',
  ].join('\n');
}

/**
 * The one file that is handed over: the same ten sections, with every скріншот embedded in §9.
 *
 * Base64 in fenced blocks rather than a zip — one file is what a репорт is, a zip would be a
 * dependency and an untested runtime, and one command at the laptop turns a block back into a PNG.
 * An image named in the репорт but missing from `images` (its file gone) is said to be missing
 * rather than silently dropped.
 *
 * It is `renderReport` with an argument, and deliberately nothing more: there is one renderer, one
 * order and one set of headings, so the file cannot drift from what the owner read.
 */
export function renderReportFile(report: BugReport, images: readonly ReportImage[]): string {
  return renderReport(report, images.length === 0 ? [MISSING_IMAGE] : images);
}

/**
 * The stand-in that tells `renderReport` «this is the file, embed what you have» when the file is
 * being made and not one image could be read.
 *
 * Without it, a hand-over whose screenshots have all vanished would render as the на-екрані text —
 * naming the pictures as if a file would carry them — which is the one thing the file must not do.
 * It matches no скріншот's name, so every one of them renders as unreadable, which is the truth.
 */
const MISSING_IMAGE: ReportImage = { name: '', mime: '', base64: '' };

/** `cap1tal-report-2026-09-02-1731.md` — the name the chooser shows. */
export function reportFileName(report: BugReport): string {
  const [date = '', time = ''] = moment(report.createdAt).split(' ');
  return `cap1tal-report-${date}-${time.slice(0, 5).replace(':', '')}.md`;
}
