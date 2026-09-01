import {
  applyRestore,
  figuresOf,
  isRefusal,
  readBackup,
  saveBackup,
  type BackupFigures,
  type BackupHeader,
  type BackupRefusal,
  type BackupStore,
} from '../backup/backup';
import type { BackupFilePort } from '../platform/backup-file';
import { todayIso } from './dates';
import { accountCount, transactionCount } from './labels';
import { monthLabel } from './months';

/**
 * What «Бекап» says and what it lets the owner decide, with none of its JSX — so `verify`, which
 * never runs a screen and never loads a native module, holds the section to what the spec says it
 * must offer.
 *
 * The whole flow is a small state machine (design D11) and every transition is a function that
 * takes what it needs and returns the next state. Two of its rules live here and nowhere else:
 * nothing restores without passing `previewing`, and both columns of that preview are counted by
 * the same `figuresOf`, so «the бекап» and «the phone» cannot be counted differently.
 *
 * The screen's own vocabulary is Ukrainian, and its refusals name the reason rather than the
 * mechanism: the owner picked a file, and what they need to know is whether they can use it.
 */

/** What the section says the file is, before the owner does anything with it. */
export const BACKUP_EXPLANATION =
  'Бекап — це один файл з усіма вашими рахунками, транзакціями та налаштуваннями. ' +
  'Він не зашифрований: тримайте його там, де тримаєте документи.';

/** What restoring does, said before it is offered and again before it happens. */
export const RESTORE_WARNING =
  'Відновлення замінює все, що зараз на телефоні. Спершу збережіть бекап поточного стану.';

/**
 * Where the flow stands.
 *
 * `idle` is also where backing out lands — of the destination chooser, of the picker and of the
 * preview alike — because in all three the owner said no and nothing happened, and a screen that
 * announced something anyway would be claiming an act that never took place.
 */
export type BackupScreenState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'picking' }
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'previewing'; readonly preview: RestorePreview }
  | { readonly kind: 'restoring' }
  | { readonly kind: 'restored'; readonly message: string };

/** One line of the preview: what the бекап holds, beside what the phone holds now. */
export interface PreviewRow {
  readonly label: string;
  readonly backup: string;
  readonly phone: string;
}

/** The бекап put beside the phone, and the бекап itself, ready to be applied unchanged. */
export interface RestorePreview {
  /** The calendar date the бекап was made on, as the owner reads it. */
  readonly made: string;
  readonly rows: readonly PreviewRow[];
  /** What is about to be replaced, in numbers rather than adjectives. */
  readonly warning: string;
  /** Already read and already found sound — confirming restores exactly what was shown. */
  readonly header: BackupHeader;
}

/** What the section needs: the whole state, and somewhere to put a file. */
export interface BackupScreenPorts {
  readonly store: BackupStore;
  readonly files: BackupFilePort;
}

/**
 * The file's name, carrying the date it was made — so a folder of them reads as a history and the
 * owner can tell at a glance which one is which, without opening any.
 */
export function backupFileName(now: Date): string {
  return `cap1tal-${todayIso(now)}.json`;
}

/**
 * «Зберегти у файл»: make the бекап, hand it to the system, and say what was saved.
 *
 * The claim is made only where the file actually left — a dismissed destination chooser returns
 * to `idle` with nothing said, which is what «backing out claims nothing» means.
 */
export async function saveToFile(
  ports: BackupScreenPorts,
  now: Date,
): Promise<BackupScreenState> {
  const snapshot = await saveBackup(ports.store, now);
  const outcome = await ports.files.save(backupFileName(now), snapshot.bytes);
  switch (outcome.kind) {
    case 'ok':
      return {
        kind: 'saved',
        // Counted from the very state the file was made from, never re-read: the sentence and
        // the file have to agree about what left the phone.
        message: `Бекап від ${todayIso(snapshot.createdAt)} збережено: ${countsOf(snapshot.figures)}.`,
      };
    case 'cancelled':
      return { kind: 'idle' };
    case 'unavailable':
      return {
        kind: 'failed',
        message: 'Бекап не збережено: немає куди зберегти файл на цьому пристрої.',
      };
    case 'failed':
      return { kind: 'failed', message: `Бекап не збережено: ${outcome.reason}.` };
  }
}

/**
 * «Відновити з файлу», up to but not past the preview: pick a file, read it, and either name why
 * it cannot be used or show what restoring it would do. Nothing on the phone is touched either way
 * — `readBackup` is pure, and this is the only path to `previewing`.
 */
export async function pickForRestore(ports: BackupScreenPorts): Promise<BackupScreenState> {
  const picked = await ports.files.pick();
  if (picked.kind === 'cancelled') {
    return { kind: 'idle' };
  }
  if (picked.kind === 'unreadable') {
    return { kind: 'refused', message: `Файл не вдалося прочитати: ${picked.reason}.` };
  }

  const read = readBackup(picked.text);
  if (isRefusal(read)) {
    return { kind: 'refused', message: refusalMessage(read) };
  }
  return { kind: 'previewing', preview: previewOf(read, ports.store) };
}

/**
 * The owner's word: replace everything with the бекап they were just shown.
 *
 * The бекап comes from the preview and is not read again, so what is restored is exactly what the
 * numbers on the screen described. A rejection deep in the write is reported and changes nothing —
 * the replacement is one SQLite transaction.
 */
export async function confirmRestore(
  ports: Pick<BackupScreenPorts, 'store'>,
  preview: RestorePreview,
): Promise<BackupScreenState> {
  let outcome: 'ok' | BackupRefusal;
  try {
    outcome = await applyRestore(ports.store, preview.header);
  } catch (error) {
    return {
      kind: 'failed',
      message: `Відновлення не відбулося, на телефоні все як було: ${
        error instanceof Error ? error.message : String(error)
      }.`,
    };
  }
  if (outcome !== 'ok') {
    return { kind: 'failed', message: refusalMessage(outcome) };
  }
  return {
    kind: 'restored',
    message: `Відновлено: ${countsOf(preview.header.figures)}.`,
  };
}

/** Backing out, from wherever: nothing was done, so nothing is said. */
export function backOut(): BackupScreenState {
  return { kind: 'idle' };
}

/** What the bare figures read as: «12 рахунків, 4300 транзакцій». */
function countsOf(figures: BackupFigures): string {
  return `${accountCount(figures.accounts)}, ${transactionCount(figures.transactions)}`;
}

/** The months a state spans, or nothing at all when it holds no транзакція. */
function monthsOf(figures: BackupFigures): string {
  if (!figures.firstMonth || !figures.lastMonth) {
    return '—';
  }
  return figures.firstMonth === figures.lastMonth
    ? monthLabel(figures.firstMonth)
    : `${monthLabel(figures.firstMonth)} — ${monthLabel(figures.lastMonth)}`;
}

/**
 * The бекап beside the phone. Both columns come from `figuresOf` over a whole state — the бекап's
 * from the file, the phone's from the same snapshot read a бекап would be made from — so the two
 * are counted by one function and cannot disagree about what a рахунок is.
 */
function previewOf(header: BackupHeader, store: BackupStore): RestorePreview {
  const phone = figuresOf(store.snapshot());
  return {
    made: todayIso(header.createdAt),
    rows: [
      {
        label: 'Рахунки',
        backup: String(header.figures.accounts),
        phone: String(phone.accounts),
      },
      {
        label: 'Транзакції',
        backup: String(header.figures.transactions),
        phone: String(phone.transactions),
      },
      { label: 'Місяці', backup: monthsOf(header.figures), phone: monthsOf(phone) },
    ],
    warning:
      `Відновлення замінить те, що зараз на телефоні: ${countsOf(phone)}. ` +
      'Скасувати відновлення буде неможливо.',
    header,
  };
}

/**
 * Why a file cannot be restored, in the owner's own words — the reason, never the mechanism. Both
 * newer versions read the same, because from where the owner stands they are one fact: this бекап
 * comes from a newer app than the one on this phone.
 */
export function refusalMessage(refusal: BackupRefusal): string {
  switch (refusal.kind) {
    case 'not-a-backup':
      return 'Це не файл бекапу cap1tal. Оберіть інший файл.';
    case 'damaged':
      return 'Файл пошкоджений — відновити з нього не можна. На телефоні нічого не змінилося.';
    case 'newer-format':
    case 'newer-schema':
      return 'Цей бекап зроблено новішою версією застосунку. Спершу оновіть застосунок.';
    case 'inconsistent':
      return `Вміст бекапу суперечить сам собі: ${refusal.problem}. Нічого не відновлено.`;
  }
}
