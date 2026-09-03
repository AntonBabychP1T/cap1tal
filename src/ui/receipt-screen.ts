import type { StoredReceipt } from '../db/receipts-repo';
import {
  compareReceiptToTransaction,
  type ReceiptComparison,
  type ReceiptItem,
} from '../domain/fiscal-receipt';
import type { Money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import type { LookupOutcome } from '../fiscal/lookup';
import { attachable, parseFiscalDocument, type ParsedReceipt } from '../fiscal/parse';
import { readReceiptQr, type MissingRequisite, type ReceiptLookup } from '../fiscal/qr';
import type { CameraPermission } from '../platform/qr-scan';
import { formatMinorUnitsGrouped, formatMoney } from './amount-input';
import { plural } from './labels';

/**
 * The scan → lookup → parse → compare → attach flow, as values.
 *
 * Everything about what the owner sees is here and nothing about React is: the states, the
 * transitions between them, every failure's sentence in Ukrainian, and the rows of the позиції
 * list. The screens under `src/app/transaction/` render this and decide nothing — which is what
 * lets every named failure have a test before a screen exists (design D12).
 *
 * The flow is a value that transitions produce, in the idiom `saldo-import.ts` already keeps: no
 * object holds state, so a screen can hand a state to a transition and render what comes back.
 */

/** The seeded groceries category, by id — the scan offer's prominence keys on this and never on
 * the name «Продукти», which the owner may rename to anything at all. */
const GROCERIES_CATEGORY_ID = 'groceries';

/**
 * The sign, and the no-break space in front of it — written as an escape because an invisible
 * character in a format string is how «742,30 ₴» and «742,30 ₴» become two different strings
 * nobody can tell apart in a diff. No-break for the reason `THOUSANDS` is: a сума must never be
 * split from its currency across two lines.
 */
const HRYVNIA = '\u00a0₴';

/** «742,30 ₴» — a чек is UAH by construction, so its own figures are shown with the sign. */
export function formatHryvnia(amount: Money): string {
  return `${formatMinorUnitsGrouped(amount.amount)}${HRYVNIA}`;
}

/**
 * A quantity in thousandths as the чек would print it: 5701 → «5,701», 2000 → «2», 1500 → «1,5».
 * Trailing zeros go, because a till prints «2 шт» and not «2,000 шт», and the fraction is only
 * ever there because the thing was weighed.
 */
export function formatQuantity(thousandths: number): string {
  const whole = Math.trunc(thousandths / 1000);
  const fraction = String(Math.abs(thousandths % 1000)).padStart(3, '0').replace(/0+$/, '');
  return fraction === '' ? String(whole) : `${whole},${fraction}`;
}

/** «9 позицій», with the Ukrainian three-form plural. */
export function itemCount(n: number): string {
  return `${n} ${plural(n, 'позиція', 'позиції', 'позицій')}`;
}

// ─── What a транзакція's form offers ──────────────────────────────────────────────────────────

export type ReceiptOffer =
  /** «Сканувати QR чека». `prominent` is the seeded groceries category and nothing else. */
  | { readonly kind: 'scan'; readonly label: string; readonly prominent: boolean }
  /** «Фіскальний чек · 9 позицій · 742,30 ₴», which opens the позиції. */
  | { readonly kind: 'attached'; readonly label: string; readonly receiptId: string }
  /** A переказ, дохід or коригування carrying no чек: nothing at all. */
  | { readonly kind: 'none' };

export const SCAN_LABEL = 'Сканувати QR чека';

/**
 * What the транзакція's form shows where the чек goes.
 *
 * A транзакція carrying a чек shows it whatever its type has become — a витрата retyped into a
 * переказ keeps the чек, and hiding it would be the app quietly holding data the owner cannot
 * reach. Only a витрата or повернення *without* one is offered the scan.
 *
 * It takes the тип and the категорія rather than a `Transaction` because on an open form the only
 * `Transaction` a caller has is the **stored** one, and the offer must answer the тип the owner has
 * just chosen. Handed a whole транзакція, the editing screen could not say anything else — which is
 * how «Сканувати QR чека» stayed on screen after «переказ» was picked, until the save. The form
 * hands its own `shape` and `categoryId`; a screen that only shows a stored транзакція hands that
 * one's.
 */
export function receiptOffer(input: {
  readonly type: Transaction['type'];
  readonly categoryId?: string;
  readonly receipt?: StoredReceipt;
}): ReceiptOffer {
  const { type, categoryId, receipt } = input;
  if (receipt) {
    return {
      kind: 'attached',
      label: `Фіскальний чек · ${itemCount(receipt.items.length)} · ${formatHryvnia(receipt.receipt.total)}`,
      receiptId: receipt.receipt.id,
    };
  }
  if (type !== 'expense' && type !== 'refund') {
    return { kind: 'none' };
  }
  return {
    kind: 'scan',
    label: SCAN_LABEL,
    // «more prominent for a витрата in the seeded groceries category» — a повернення there is
    // money coming back, not a shop full of позиції, so it gets the same quiet offer as any
    // other category.
    prominent: type === 'expense' && categoryId === GROCERIES_CATEGORY_ID,
  };
}

// ─── The позиції list ─────────────────────────────────────────────────────────────────────────

export interface ReceiptItemRow {
  readonly id: string;
  readonly name: string;
  /** «5,701 кг × 52,30 ₴» — absent when the позиція names no unit price to multiply by. */
  readonly quantity?: string;
  readonly total: string;
  /** «Знижка 1,00 ₴», beside its own позиція. */
  readonly discount?: string;
}

/**
 * The позиції as the list shows them: in document order, names exactly as printed, and nothing
 * invented. A позиція with no unit price gets no «×» line — writing one would mean dividing the
 * line total by the quantity, which is a number the seller never printed.
 */
export function receiptItemRows(items: readonly ReceiptItem[]): ReceiptItemRow[] {
  return [...items]
    .sort((a, b) => a.line - b.line)
    .map((item) => ({
      id: item.id,
      name: item.rawName,
      ...(item.unitPrice === undefined
        ? {}
        : {
            quantity: `${formatQuantity(item.quantityThousandths)}${item.unit ? ` ${item.unit}` : ''} × ${formatHryvnia(item.unitPrice)}`,
          }),
      total: formatHryvnia(item.lineTotal),
      ...(item.discount === undefined
        ? {}
        : { discount: `Знижка ${formatHryvnia(item.discount)}` }),
    }));
}

/** The чек's own heading: what it totals, who issued it and when. */
export interface ReceiptHeader {
  readonly total: string;
  readonly seller?: string;
  readonly issued: string;
  /** Both amounts, when the транзакція's сума has moved away from the чек's since it was attached. */
  readonly differsFrom?: string;
}

export function receiptHeader(input: {
  readonly stored: StoredReceipt;
  readonly transaction: Transaction;
}): ReceiptHeader {
  const { stored, transaction } = input;
  const comparison = compareReceiptToTransaction({
    receipt: stored.receipt,
    transaction,
  });
  return {
    total: formatHryvnia(stored.receipt.total),
    ...(stored.receipt.sellerName === undefined ? {} : { seller: stored.receipt.sellerName }),
    issued: `${stored.receipt.issuedDate} ${stored.receipt.issuedTime}`,
    // A переказ has no single сума to differ from — `compareReceiptToTransaction` falls back to
    // the чек's own total for it, and printing that twice under «не збігається» would be the
    // screen inventing a disagreement. A retyped переказ shows its чек and claims nothing.
    ...(comparison.amounts === 'match' || transaction.type === 'transfer'
      ? {}
      : {
          differsFrom: `Чек ${formatMoney(comparison.receiptTotal)}, транзакція ${formatMoney(comparison.transactionAmount)}`,
        }),
  };
}

// ─── The flow ─────────────────────────────────────────────────────────────────────────────────

/** Why the flow stopped. Each is a different sentence and a different thing to do next. */
export type Refusal =
  | { readonly kind: 'camera-deniable' }
  | { readonly kind: 'camera-blocked' }
  | { readonly kind: 'no-camera' }
  | { readonly kind: 'not-a-receipt' }
  | { readonly kind: 'incomplete'; readonly missing: readonly MissingRequisite[] }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'service-changed' }
  | { readonly kind: 'not-a-fiscal-document' }
  | { readonly kind: 'not-a-sale-or-return' }
  | { readonly kind: 'not-this-receipt' }
  | { readonly kind: 'attached-elsewhere'; readonly where: string }
  | { readonly kind: 'already-has-receipt' }
  | { readonly kind: 'transaction-gone' };

export type FlowState =
  | { readonly kind: 'idle' }
  /** The camera cannot be used yet; `permission` says whether asking is even possible. */
  | { readonly kind: 'permission'; readonly permission: CameraPermission }
  | { readonly kind: 'scanning' }
  | { readonly kind: 'looking-up'; readonly lookup: ReceiptLookup }
  | {
      readonly kind: 'preview';
      readonly lookup: ReceiptLookup;
      readonly parsed: ParsedReceipt;
      readonly document: string;
      readonly comparison: ReceiptComparison;
    }
  /** A named stop. `lookup` is kept when there is something to retry with. */
  | { readonly kind: 'refused'; readonly refusal: Refusal; readonly lookup?: ReceiptLookup }
  | { readonly kind: 'attached'; readonly receiptId: string };

export const IDLE: FlowState = { kind: 'idle' };

/**
 * Starting a scan, given what the device said about the camera *before* anything was asked.
 *
 * `deniable` is the one answer that is not yet a conclusion: the system will ask, so the flow
 * waits in `permission` while it does. Every other answer is final and becomes its own state.
 * The permission is asked for here and only here — never on launch and never on opening a
 * транзакція, which is the qr-scan requirement in one line of control flow.
 */
export function startScan(permission: CameraPermission): FlowState {
  switch (permission) {
    case 'granted':
      return { kind: 'scanning' };
    case 'unsupported':
      return { kind: 'refused', refusal: { kind: 'no-camera' } };
    case 'blocked':
      return { kind: 'refused', refusal: { kind: 'camera-blocked' } };
    default:
      return { kind: 'permission', permission };
  }
}

/**
 * What the system dialog came back with.
 *
 * Separate from `startScan` because the same `deniable` means two different things on the two
 * sides of the ask: before it, «the system will ask»; after it, «the owner said no, and may be
 * asked again». Running the answer back through `startScan` would leave the flow sitting in
 * `permission` for ever with nothing to show — which is exactly the empty screen this function
 * exists to prevent.
 */
export function askedFor(permission: CameraPermission): FlowState {
  if (permission === 'deniable') {
    return { kind: 'refused', refusal: { kind: 'camera-deniable' } };
  }
  return startScan(permission);
}

/**
 * A QR's text, decoded by the camera.
 *
 * The first decode wins: a state that is not `scanning` is returned untouched, so a second code
 * arriving before the view has closed changes nothing («Two codes in quick succession yield one»).
 * The latch lives here rather than in the screen because here it can be tested.
 */
export function decoded(state: FlowState, text: string): FlowState {
  if (state.kind !== 'scanning') return state;

  const reading = readReceiptQr(text);
  switch (reading.kind) {
    case 'lookup':
      return { kind: 'looking-up', lookup: reading.lookup };
    case 'incomplete':
      return { kind: 'refused', refusal: { kind: 'incomplete', missing: reading.missing } };
    default:
      return { kind: 'refused', refusal: { kind: 'not-a-receipt' } };
  }
}

/** Leaving the scanner without a code. Nothing was stored, and nothing is left behind. */
export function cancelled(state: FlowState): FlowState {
  return state.kind === 'scanning' ? IDLE : state;
}

/**
 * What the tax service answered, and what the document turned out to be.
 *
 * The whole of «found» is handled here: the document is parsed, checked against the реквізити and
 * compared with the транзакція, so the screen receives either a preview to confirm or one named
 * reason — never a half-read чек.
 */
export function lookedUp(
  state: FlowState,
  outcome: LookupOutcome,
  transaction: Transaction,
): FlowState {
  if (state.kind !== 'looking-up') return state;
  const { lookup } = state;

  const refuse = (refusal: Refusal): FlowState => ({ kind: 'refused', refusal, lookup });
  switch (outcome.kind) {
    case 'not-found':
      return refuse({ kind: 'not-found' });
    case 'unavailable':
      return refuse({ kind: 'unavailable' });
    case 'request-rejected':
    case 'unreadable':
      return refuse({ kind: 'service-changed' });
    default:
      break;
  }

  const parsed = parseFiscalDocument(outcome.document);
  if (parsed.kind === 'not-a-sale-or-return') return refuse({ kind: 'not-a-sale-or-return' });
  if (parsed.kind !== 'parsed') return refuse({ kind: 'not-a-fiscal-document' });

  const checked = attachable(parsed.receipt, lookup);
  if (checked.kind !== 'attachable') return refuse({ kind: 'not-this-receipt' });

  return {
    kind: 'preview',
    lookup,
    parsed: parsed.receipt,
    document: outcome.document,
    comparison: compareReceiptToTransaction({ receipt: parsed.receipt, transaction }),
  };
}

/**
 * Looking the same чек up again, with the реквізити already decoded.
 *
 * Only from a refusal that kept them, and only when the owner taps: nothing is retried on its own,
 * in the background, or after the screen is left (design D12).
 */
export function retry(state: FlowState): FlowState {
  if (state.kind !== 'refused' || state.lookup === undefined) return state;
  return { kind: 'looking-up', lookup: state.lookup };
}

/** Scanning again, after a QR that was not a чек or a document that was not the one. */
export function scanAgain(state: FlowState): FlowState {
  return state.kind === 'refused' ? { kind: 'scanning' } : state;
}

/** The owner chose «Скасувати». Nothing was stored — a preview stores nothing by construction. */
export function cancelPreview(state: FlowState): FlowState {
  return state.kind === 'preview' ? IDLE : state;
}

/** What storing came to. Called after the repository has been asked, never instead of it. */
export function stored(state: FlowState, receiptId: string): FlowState {
  return state.kind === 'preview' ? { kind: 'attached', receiptId } : state;
}

export function storeRefused(state: FlowState, refusal: Refusal): FlowState {
  if (state.kind !== 'preview') return state;
  return { kind: 'refused', refusal, lookup: state.lookup };
}

// ─── What each state says ─────────────────────────────────────────────────────────────────────

/** What the owner can do next about a refusal. */
export type NextStep = 'scan-again' | 'retry' | 'open-settings' | 'ask-permission' | 'none';

export interface RefusalView {
  readonly text: string;
  readonly next: NextStep;
}

const MISSING_NAMES: Record<MissingRequisite, string> = {
  fiscalNumber: 'фіскальний номер чека',
  registrarNumber: 'фіскальний номер реєстратора',
  date: 'дату',
  time: 'час',
  total: 'суму',
};

/**
 * Every refusal in the owner's words, with what is on offer beside it.
 *
 * Two of them are worth reading twice. `not-found` says the чек may appear later, because that is
 * usually what has happened — the tax service registers a чек with a delay — and because the same
 * sentence has to cover the other cause, a QR whose сума the service does not agree with, which no
 * amount of retrying can fix. `service-changed` says the app needs an update rather than blaming
 * the tax service, because from the owner's side that is the actionable half.
 */
export function refusalView(refusal: Refusal): RefusalView {
  switch (refusal.kind) {
    case 'camera-deniable':
      return { text: 'Щоб сканувати чек, потрібен доступ до камери.', next: 'ask-permission' };
    case 'camera-blocked':
      return {
        text: 'Доступ до камери заборонено. Увімкніть його в налаштуваннях застосунку.',
        next: 'open-settings',
      };
    case 'no-camera':
      return { text: 'На цьому пристрої немає камери, доступної застосунку.', next: 'none' };
    case 'not-a-receipt':
      return { text: 'Це не QR фіскального чека.', next: 'scan-again' };
    case 'incomplete':
      return {
        text: `QR чека не містить усього потрібного: ${refusal.missing
          .map((what) => MISSING_NAMES[what])
          .join(', ')}.`,
        next: 'scan-again',
      };
    case 'not-found':
      return {
        text: 'Податкова не знайшла цей чек. Він може зʼявитися через кілька днів — або сума в QR не збігається з зареєстрованою.',
        next: 'retry',
      };
    case 'unavailable':
      return { text: 'Немає звʼязку з податковою.', next: 'retry' };
    case 'service-changed':
      return {
        text: 'Податкова відповіла так, як ця версія застосунку не вміє прочитати. Потрібне оновлення.',
        next: 'retry',
      };
    case 'not-a-fiscal-document':
      return { text: 'Податкова віддала не фіскальний документ.', next: 'scan-again' };
    case 'not-a-sale-or-return':
      return {
        text: 'Це службовий документ, а не чек продажу чи повернення.',
        next: 'scan-again',
      };
    case 'not-this-receipt':
      return { text: 'Документ від податкової — не той чек, що в цьому QR.', next: 'scan-again' };
    case 'attached-elsewhere':
      return { text: `Цей чек уже прикріплено до транзакції «${refusal.where}».`, next: 'none' };
    case 'already-has-receipt':
      return { text: 'Ця транзакція вже має фіскальний чек.', next: 'none' };
    default:
      return { text: 'Транзакції більше немає.', next: 'none' };
  }
}

/** The preview's own sentences: what will be attached, and what does not match. */
export interface PreviewView {
  readonly total: string;
  readonly items: readonly ReceiptItemRow[];
  readonly seller?: string;
  readonly issued: string;
  /** Set only on a mismatch — and then the screen must ask before anything is stored. */
  readonly mismatch?: string;
  /** Information beside the amounts; neither blocks nor decides anything. */
  readonly notes: readonly string[];
  readonly confirmLabel: string;
}

export const ATTACH_LABEL = 'Прикріпити';
export const ATTACH_ANYWAY_LABEL = 'Прикріпити все одно';

/**
 * The preview a `preview` state shows. The позиції come from the parsed чек — never from the
 * snapshot, which no screen reads.
 */
export function previewView(state: Extract<FlowState, { kind: 'preview' }>): PreviewView {
  const { parsed, comparison } = state;
  const notes: string[] = [];
  if (comparison.dateDiffersBy !== undefined) {
    notes.push(
      `Чек виписано ${parsed.issuedDate}, а транзакція за іншу дату (різниця — ${comparison.dateDiffersBy} ${plural(comparison.dateDiffersBy, 'день', 'дні', 'днів')}).`,
    );
  }
  if (comparison.sellerHint !== undefined) {
    notes.push(`Продавець на чеку: ${comparison.sellerHint}.`);
  }
  if (comparison.kindDiffers) {
    notes.push(
      parsed.kind === 'return'
        ? 'Це чек повернення, а транзакція — витрата.'
        : 'Це чек продажу, а транзакція — повернення.',
    );
  }

  return {
    total: formatHryvnia(parsed.total),
    // Позиції need ids to be listed; the parsed чек has none yet, so the line number is the key
    // until the repository gives each one its own.
    items: receiptItemRows(
      parsed.items.map((item) => ({ ...item, id: `line-${item.line}`, receiptId: '' })),
    ),
    ...(parsed.sellerName === undefined ? {} : { seller: parsed.sellerName }),
    issued: `${parsed.issuedDate} ${parsed.issuedTime}`,
    ...(comparison.amounts === 'match'
      ? {}
      : {
          mismatch: `Сума чека ${formatMoney(comparison.receiptTotal)} не збігається із сумою транзакції ${formatMoney(comparison.transactionAmount)}.`,
        }),
    notes,
    confirmLabel: comparison.amounts === 'match' ? ATTACH_LABEL : ATTACH_ANYWAY_LABEL,
  };
}

export const DETACH_LABEL = 'Відкріпити чек';

/** The confirmation «Відкріпити чек» asks for. Detaching deletes a чек, so it is asked once. */
export function detachConfirmation(stored: StoredReceipt): string {
  const n = stored.items.length;
  // The accusative, which the nominative `itemCount` label does not give: «видалити його
  // 1 позицію», «3 позиції», «9 позицій».
  const items = `${n} ${plural(n, 'позицію', 'позиції', 'позицій')}`;
  return `Відкріпити чек на ${formatHryvnia(stored.receipt.total)} і видалити його ${items}? Транзакція залишиться без змін.`;
}
