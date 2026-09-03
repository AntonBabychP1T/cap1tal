import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { StoredReceipt } from '../db/receipts-repo';
import type { FiscalReceipt, ReceiptItem } from '../domain/fiscal-receipt';
import { money } from '../domain/money';
import { isoDate, type Transaction } from '../domain/transaction';
import type { LookupOutcome } from '../fiscal/lookup';
import {
  askedFor,
  ATTACH_ANYWAY_LABEL,
  ATTACH_LABEL,
  cancelled,
  cancelPreview,
  decoded,
  detachConfirmation,
  formatHryvnia,
  formatQuantity,
  IDLE,
  itemCount,
  lookedUp,
  previewView,
  receiptHeader,
  receiptItemRows,
  receiptOffer,
  refusalView,
  retry,
  scanAgain,
  startScan,
  storeRefused,
  stored,
  type FlowState,
} from './receipt-screen';

/**
 * The whole flow, as values. Every named failure of the `fiscal-receipts-screen` spec has a test
 * here, and none of them needs a screen, a camera or a network — which is the point of the state
 * machine existing at all.
 */

const fixture = (name: string) =>
  readFileSync(new URL(`../fiscal/fixtures/${name}`, import.meta.url), 'utf8');

const GROCERY_QR =
  'https://cabinet.tax.gov.ua/cashregs/check?id=696582&fn=3000909908&date=20260429&time=222006&sm=437.40';

function expense(over: Partial<Extract<Transaction, { type: 'expense' }>> = {}): Transaction {
  return {
    type: 'expense',
    id: 'tx-1',
    date: isoDate('2026-04-29'),
    accountId: 'card',
    amount: money(43740, 'UAH'),
    categoryId: 'groceries',
    ...over,
  };
}

/** The flow up to the point a lookup is about to answer. */
function lookingUp(url = GROCERY_QR): FlowState {
  return decoded(startScan('granted'), url);
}

const FOUND: LookupOutcome = { kind: 'found', document: fixture('rro-real-grocery-8-items.xml') };

// ─── The offer on a транзакція ────────────────────────────────────────────────────────────────

function storedReceipt(over: Partial<FiscalReceipt> = {}, items: ReceiptItem[] = []): StoredReceipt {
  return {
    receipt: {
      id: 'rc-1',
      transactionId: 'tx-1',
      registrarNumber: '3000909908',
      fiscalNumber: '696582',
      issuedDate: isoDate('2026-04-29'),
      issuedTime: '22:20:06',
      dialect: 'rro',
      kind: 'sale',
      total: money(74230, 'UAH'),
      acquisition: 'qr_scan',
      fetchedAt: 1,
      snapshot: '<RQ/>',
      ...over,
    },
    items,
  };
}

describe('what a транзакція offers', () => {
  it('A grocery витрата offers the scan prominently', () => {
    // By the seeded id, not the name: the owner has renamed it «Продукти».
    const offer = receiptOffer({ type: 'expense', categoryId: 'groceries' });

    expect(offer).toEqual({ kind: 'scan', label: 'Сканувати QR чека', prominent: true });
  });

  it('Another category offers it too', () => {
    const offer = receiptOffer({ type: 'expense', categoryId: 'home' });

    expect(offer).toEqual({ kind: 'scan', label: 'Сканувати QR чека', prominent: false });
  });

  it('offers the scan on a повернення as well', () => {
    const offer = receiptOffer({ type: 'refund', categoryId: 'home' });

    expect(offer.kind).toBe('scan');
  });

  it('A транзакція with a чек shows it', () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({
      id: `i${i}`,
      receiptId: 'rc-1',
      line: i + 1,
      rawName: `Товар ${i}`,
      quantityThousandths: 1000,
      lineTotal: money(1000, 'UAH'),
    }));

    const offer = receiptOffer({ type: 'expense', receipt: storedReceipt({}, nine) });

    expect(offer).toEqual({
      kind: 'attached',
      label: 'Фіскальний чек · 9 позицій · 742,30\u00a0₴',
      receiptId: 'rc-1',
    });
  });

  it('A переказ offers no scan', () => {
    expect(receiptOffer({ type: 'transfer' })).toEqual({ kind: 'none' });
  });

  it('offers no scan on a дохід or a коригування either', () => {
    expect(receiptOffer({ type: 'income' }).kind).toBe('none');
    expect(receiptOffer({ type: 'correction' }).kind).toBe('none');
  });

  it('A retyped переказ still shows its чек, and claims no difference about it', () => {
    const transfer: Transaction = {
      type: 'transfer',
      id: 'tx-1',
      date: isoDate('2026-04-29'),
      fromAccountId: 'a',
      toAccountId: 'b',
      left: money(74230, 'UAH'),
      arrived: money(74230, 'UAH'),
    };

    const offer = receiptOffer({ type: transfer.type, receipt: storedReceipt() });

    expect(offer.kind).toBe('attached');
    // And the чек opens and reads normally: a переказ has no single сума, so nothing is marked as
    // differing from one.
    const header = receiptHeader({ stored: storedReceipt(), transaction: transfer });
    expect(header.total).toBe('742,30\u00a0₴');
    expect(header.differsFrom).toBeUndefined();
  });
});

// ─── The позиції list ─────────────────────────────────────────────────────────────────────────

describe('the позиції list', () => {
  it('Позиції are listed as printed', () => {
    const rows = receiptItemRows([
      { id: 'a', receiptId: 'r', line: 1, rawName: 'Молоко 2.5%', quantityThousandths: 1000, lineTotal: money(4720, 'UAH') },
      { id: 'b', receiptId: 'r', line: 2, rawName: 'Хліб житній', quantityThousandths: 1000, lineTotal: money(3890, 'UAH') },
      { id: 'c', receiptId: 'r', line: 3, rawName: 'Coca-Cola 2L', quantityThousandths: 1000, lineTotal: money(6490, 'UAH') },
    ]);

    expect(rows.map((r) => [r.name, r.total])).toEqual([
      ['Молоко 2.5%', '47,20\u00a0₴'],
      ['Хліб житній', '38,90\u00a0₴'],
      ['Coca-Cola 2L', '64,90\u00a0₴'],
    ]);
  });

  it('A weighed позиція shows its quantity', () => {
    const [row] = receiptItemRows([
      {
        id: 'a',
        receiptId: 'r',
        line: 1,
        rawName: 'Куряче стегно',
        quantityThousandths: 5701,
        unit: 'кг',
        unitPrice: money(5230, 'UAH'),
        lineTotal: money(29816, 'UAH'),
      },
    ]);

    expect(row?.quantity).toBe('5,701 кг × 52,30\u00a0₴');
    expect(row?.total).toBe('298,16\u00a0₴');
  });

  it('A позиція without a unit price shows no invented one', () => {
    const [row] = receiptItemRows([
      { id: 'a', receiptId: 'r', line: 1, rawName: 'Вода', quantityThousandths: 1000, lineTotal: money(2340, 'UAH') },
    ]);

    expect(row?.total).toBe('23,40\u00a0₴');
    expect(row?.quantity).toBeUndefined();
  });

  it('shows a line discount beside its позиція', () => {
    const [row] = receiptItemRows([
      {
        id: 'a',
        receiptId: 'r',
        line: 1,
        rawName: 'Морква',
        quantityThousandths: 1000,
        unitPrice: money(10000, 'UAH'),
        lineTotal: money(10000, 'UAH'),
        discount: money(5000, 'UAH'),
      },
    ]);

    expect(row?.discount).toBe('Знижка 50,00\u00a0₴');
  });

  it('lists позиції in document order whatever order they arrive in', () => {
    const rows = receiptItemRows([
      { id: 'b', receiptId: 'r', line: 9, rawName: 'Другий', quantityThousandths: 1000, lineTotal: money(1, 'UAH') },
      { id: 'a', receiptId: 'r', line: 5, rawName: 'Перший', quantityThousandths: 1000, lineTotal: money(1, 'UAH') },
    ]);

    expect(rows.map((r) => r.name)).toEqual(['Перший', 'Другий']);
  });

  it('An edited транзакція marks the difference', () => {
    const header = receiptHeader({
      stored: storedReceipt(),
      transaction: expense({ amount: money(70000, 'UAH') }),
    });

    expect(header.total).toBe('742,30\u00a0₴');
    expect(header.differsFrom).toContain('742,30');
    expect(header.differsFrom).toContain('700,00');
  });

  it('marks no difference when the сума still matches', () => {
    const header = receiptHeader({
      stored: storedReceipt(),
      transaction: expense({ amount: money(74230, 'UAH') }),
    });

    expect(header.differsFrom).toBeUndefined();
  });

  it('Screens read the parsed чек', () => {
    // The rows are built from the позиції, and the snapshot is not among their inputs: altering it
    // cannot change a single character the list shows.
    const items: ReceiptItem[] = [
      { id: 'a', receiptId: 'r', line: 1, rawName: 'Молоко', quantityThousandths: 1000, lineTotal: money(4720, 'UAH') },
    ];
    const before = receiptItemRows(items);

    const tampered = storedReceipt({ snapshot: '<RQ>ЩОСЬ ЗОВСІМ ІНШЕ</RQ>' }, items);

    expect(receiptItemRows(tampered.items)).toEqual(before);
    expect(receiptHeader({ stored: tampered, transaction: expense() }).total).toBe('742,30\u00a0₴');
  });

  it('formats quantities the way a till prints them', () => {
    expect(formatQuantity(5701)).toBe('5,701');
    expect(formatQuantity(2000)).toBe('2');
    expect(formatQuantity(1500)).toBe('1,5');
    expect(formatQuantity(1000)).toBe('1');
  });

  it('counts позиції with the Ukrainian plural', () => {
    expect(itemCount(1)).toBe('1 позиція');
    expect(itemCount(3)).toBe('3 позиції');
    expect(itemCount(9)).toBe('9 позицій');
    expect(itemCount(11)).toBe('11 позицій');
  });

  it('writes a сума with the hryvnia sign', () => {
    expect(formatHryvnia(money(74230, 'UAH'))).toBe('742,30\u00a0₴');
  });
});

// ─── The flow ─────────────────────────────────────────────────────────────────────────────────

describe('starting a scan', () => {
  it('A first scan asks', () => {
    expect(startScan('deniable')).toEqual({ kind: 'permission', permission: 'deniable' });
  });

  it('A blocked permission offers the settings', () => {
    const state = startScan('blocked');

    expect(state).toEqual({ kind: 'refused', refusal: { kind: 'camera-blocked' } });
    expect(refusalView({ kind: 'camera-blocked' }).next).toBe('open-settings');
  });

  it('says so where there is no camera, and offers nothing', () => {
    expect(startScan('unsupported')).toEqual({ kind: 'refused', refusal: { kind: 'no-camera' } });
    expect(refusalView({ kind: 'no-camera' }).next).toBe('none');
  });

  it('opens the scanner once the permission is granted', () => {
    expect(startScan('granted')).toEqual({ kind: 'scanning' });
  });

  it('waits while the system asks, and shows a reason once it has answered', () => {
    // Before the ask, `deniable` is «the system will ask» and the flow waits.
    expect(startScan('deniable')).toEqual({ kind: 'permission', permission: 'deniable' });

    // After it, the same word means «the owner said no». Running it back through `startScan`
    // would leave the screen in `permission` with nothing to render — the empty screen the
    // emulator showed on 2026-09-02.
    const refused = askedFor('deniable');
    expect(refused).toEqual({ kind: 'refused', refusal: { kind: 'camera-deniable' } });
    expect(refusalView({ kind: 'camera-deniable' })).toEqual({
      text: 'Щоб сканувати чек, потрібен доступ до камери.',
      next: 'ask-permission',
    });
  });

  it('carries every other answer to the ask straight through', () => {
    expect(askedFor('granted')).toEqual({ kind: 'scanning' });
    expect(askedFor('blocked')).toEqual({ kind: 'refused', refusal: { kind: 'camera-blocked' } });
    expect(askedFor('unsupported')).toEqual({ kind: 'refused', refusal: { kind: 'no-camera' } });
  });

  it('leaves no state the screen cannot render', () => {
    // `permission` is the one state with no branch on `scan.tsx`, and it is reachable only while
    // the system dialog is up. Every state a transition can *settle* on must be renderable.
    const settled = [
      startScan('granted'),
      startScan('blocked'),
      startScan('unsupported'),
      askedFor('granted'),
      askedFor('deniable'),
      askedFor('blocked'),
      askedFor('unsupported'),
    ];

    for (const state of settled) {
      expect(state.kind).not.toBe('permission');
    }
  });
});

describe('what the camera decoded', () => {
  it('A non-чек QR asks for another', () => {
    const state = decoded(startScan('granted'), 'WIFI:S:home;P:secret;;');

    expect(state).toEqual({ kind: 'refused', refusal: { kind: 'not-a-receipt' } });
    const view = refusalView({ kind: 'not-a-receipt' });
    expect(view.text).toBe('Це не QR фіскального чека.');
    expect(view.next).toBe('scan-again');
  });

  it('names what a чек QR is missing', () => {
    const state = decoded(
      startScan('granted'),
      'https://cabinet.tax.gov.ua/cashregs/check?id=133104756&fn=4000096193&date=20211212',
    );

    expect(state).toEqual({
      kind: 'refused',
      refusal: { kind: 'incomplete', missing: ['time', 'total'] },
    });
    expect(refusalView({ kind: 'incomplete', missing: ['time', 'total'] }).text).toBe(
      'QR чека не містить усього потрібного: час, суму.',
    );
  });

  it('Two codes in quick succession yield one', () => {
    const first = decoded(startScan('granted'), GROCERY_QR);

    // A second decode arriving before the view has closed changes nothing at all.
    const second = decoded(first, 'https://cabinet.tax.gov.ua/cashregs/check?id=1&fn=2&date=20260429&time=1130&sm=1.00');

    expect(second).toBe(first);
    expect(first.kind).toBe('looking-up');
    if (first.kind === 'looking-up') expect(first.lookup.fiscalNumber).toBe('696582');
  });

  it('Leaving the scanner is cancelled', () => {
    expect(cancelled(startScan('granted'))).toEqual(IDLE);
    // And leaving anything else is not a cancel — the flow has already moved on.
    expect(cancelled(lookingUp())).toEqual(lookingUp());
  });
});

describe('what the lookup answered', () => {
  it('A successful scan ends in a preview to confirm', () => {
    const state = lookedUp(lookingUp(), FOUND, expense());

    expect(state.kind).toBe('preview');
    if (state.kind !== 'preview') return;
    const view = previewView(state);
    expect(view.total).toBe('437,40\u00a0₴');
    expect(view.items).toHaveLength(8);
    expect(view.confirmLabel).toBe(ATTACH_LABEL);
    expect(view.mismatch).toBeUndefined();
    expect(view.items[4]?.name).toBe('Снек Кіндер Мілк Слайс 28г');
  });

  it('A mismatch is a warning with a choice', () => {
    const state = lookedUp(lookingUp(), FOUND, expense({ amount: money(70000, 'UAH') }));

    expect(state.kind).toBe('preview');
    if (state.kind !== 'preview') return;
    const view = previewView(state);
    expect(view.mismatch).toContain('437,40');
    expect(view.mismatch).toContain('700,00');
    expect(view.confirmLabel).toBe(ATTACH_ANYWAY_LABEL);
  });

  it('A чек not found can be retried without scanning again', () => {
    const state = lookedUp(lookingUp(), { kind: 'not-found' }, expense());

    expect(state.kind).toBe('refused');
    if (state.kind !== 'refused') return;
    expect(refusalView(state.refusal).next).toBe('retry');
    expect(refusalView(state.refusal).text).toContain('може зʼявитися');

    // Retrying reuses the реквізити — no second scan, and the same чек is asked for.
    const again = retry(state);
    expect(again.kind).toBe('looking-up');
    if (again.kind === 'looking-up') expect(again.lookup.fiscalNumber).toBe('696582');
  });

  it('Offline is a reason, not a crash', () => {
    const state = lookedUp(lookingUp(), { kind: 'unavailable' }, expense());

    expect(state).toMatchObject({ kind: 'refused', refusal: { kind: 'unavailable' } });
    expect(refusalView({ kind: 'unavailable' })).toEqual({
      text: 'Немає звʼязку з податковою.',
      next: 'retry',
    });
    expect(retry(state).kind).toBe('looking-up');
  });

  it('A changed service is named as such', () => {
    for (const outcome of [{ kind: 'request-rejected' }, { kind: 'unreadable' }] as const) {
      const state = lookedUp(lookingUp(), outcome, expense());

      expect(state).toMatchObject({ kind: 'refused', refusal: { kind: 'service-changed' } });
      expect(refusalView({ kind: 'service-changed' }).text).toContain('оновлення');
      expect(refusalView({ kind: 'service-changed' }).next).toBe('retry');
    }
  });

  it('A document that is not the чек asks for another scan', () => {
    // A shift document...
    const shift = lookedUp(
      lookingUp(),
      { kind: 'found', document: fixture('synthetic-prro-shift.xml') },
      expense(),
    );
    expect(shift).toMatchObject({ refusal: { kind: 'not-a-sale-or-return' } });
    expect(refusalView({ kind: 'not-a-sale-or-return' }).next).toBe('scan-again');

    // ...and one naming another реєстратор than the QR.
    const wrong = lookedUp(
      lookingUp(),
      { kind: 'found', document: fixture('prro-real-1-item-test-payer.xml') },
      expense(),
    );
    expect(wrong).toMatchObject({ refusal: { kind: 'not-this-receipt' } });
    expect(refusalView({ kind: 'not-this-receipt' }).next).toBe('scan-again');
  });

  it('refuses a document that is not fiscal at all', () => {
    const state = lookedUp(lookingUp(), { kind: 'found', document: '<html/>' }, expense());

    expect(state).toMatchObject({ refusal: { kind: 'not-a-fiscal-document' } });
  });

  it('offers no retry for something rescanning is the answer to', () => {
    const state = lookedUp(lookingUp(), { kind: 'found', document: '<html/>' }, expense());

    // The реквізити are kept — but the offer is to scan again, since the same lookup would serve
    // the same unreadable document.
    expect(scanAgain(state)).toEqual({ kind: 'scanning' });
  });
});

describe('information beside the comparison', () => {
  it('reports a date difference without blocking', () => {
    const state = lookedUp(lookingUp(), FOUND, expense({ date: isoDate('2026-04-30') }));

    expect(state.kind).toBe('preview');
    if (state.kind !== 'preview') return;
    const view = previewView(state);
    expect(view.mismatch).toBeUndefined();
    expect(view.notes.join(' ')).toContain('1 день');
    expect(view.confirmLabel).toBe(ATTACH_LABEL);
  });

  it('reports a return чек on a витрата as information', () => {
    const state = lookedUp(
      decoded(
        startScan('granted'),
        'https://cabinet.tax.gov.ua/cashregs/check?id=696583&fn=3000909908&date=20260430&time=101500&sm=75.00',
      ),
      { kind: 'found', document: fixture('synthetic-rro-return-discount.xml') },
      expense({ amount: money(7500, 'UAH'), date: isoDate('2026-04-30') }),
    );

    expect(state.kind).toBe('preview');
    if (state.kind !== 'preview') return;
    const view = previewView(state);
    expect(view.mismatch).toBeUndefined();
    expect(view.notes.join(' ')).toContain('чек повернення');
  });
});

describe('what storing came to', () => {
  it('Cancelling leaves nothing behind', () => {
    const preview = lookedUp(lookingUp(), FOUND, expense());

    expect(cancelPreview(preview)).toEqual(IDLE);
  });

  it('Backing out stores nothing: no state before `attached` names a stored чек', () => {
    const states = [
      IDLE,
      startScan('granted'),
      lookingUp(),
      lookedUp(lookingUp(), FOUND, expense()),
    ];

    for (const state of states) {
      expect(state.kind).not.toBe('attached');
    }
  });

  it('ends at attached once the repository has stored it', () => {
    const preview = lookedUp(lookingUp(), FOUND, expense());

    expect(stored(preview, 'rc-1')).toEqual({ kind: 'attached', receiptId: 'rc-1' });
  });

  it('A чек attached elsewhere is refused, not moved', () => {
    const preview = lookedUp(lookingUp(), FOUND, expense());
    const state = storeRefused(preview, { kind: 'attached-elsewhere', where: 'АТБ 29.04' });

    expect(state).toMatchObject({ refusal: { kind: 'attached-elsewhere' } });
    expect(refusalView({ kind: 'attached-elsewhere', where: 'АТБ 29.04' })).toEqual({
      text: 'Цей чек уже прикріплено до транзакції «АТБ 29.04».',
      next: 'none',
    });
  });

  it('A second чек on the same транзакція is refused', () => {
    const preview = lookedUp(lookingUp(), FOUND, expense());
    const state = storeRefused(preview, { kind: 'already-has-receipt' });

    expect(state).toMatchObject({ refusal: { kind: 'already-has-receipt' } });
    expect(refusalView({ kind: 'already-has-receipt' }).next).toBe('none');
  });

  it('A транзакція gone during the flow ends it', () => {
    const preview = lookedUp(lookingUp(), FOUND, expense());
    const state = storeRefused(preview, { kind: 'transaction-gone' });

    expect(state).toMatchObject({ refusal: { kind: 'transaction-gone' } });
    expect(refusalView({ kind: 'transaction-gone' })).toEqual({
      text: 'Транзакції більше немає.',
      next: 'none',
    });
  });

  it('Scanning the same QR twice is one чек', () => {
    // The flow's half of it: reading the same QR again reaches the same реквізити, so the second
    // attempt asks storage about the чек that is already there. That storage answers «already
    // attached to this транзакція» rather than storing a second is proven against real SQLite in
    // `src/db/receipts-repo.test.ts` under this same title.
    const first = lookingUp();
    const second = lookingUp();
    expect(first).toEqual(second);

    // And the refusal the screen shows when it is this транзакція's own чек.
    const preview = lookedUp(lookingUp(), FOUND, expense());
    expect(storeRefused(preview, { kind: 'already-has-receipt' })).toMatchObject({
      refusal: { kind: 'already-has-receipt' },
    });
  });
});

describe('detaching', () => {
  it('Detaching after confirmation', () => {
    // The screen's side of it: a confirmation that names the чек, and a confirm that removes it
    // and nothing else. That the транзакція's own values survive is proven against real SQLite in
    // `src/db/receipts-repo.test.ts` («Detaching deletes the чек and frees its identity»).
    const receipt = storedReceipt({}, [
      { id: 'a', receiptId: 'rc-1', line: 1, rawName: 'Молоко', quantityThousandths: 1000, lineTotal: money(4720, 'UAH') },
    ]);
    const source = readFileSync(new URL('../app/transaction/receipt.tsx', import.meta.url), 'utf8');

    expect(detachConfirmation(receipt)).toContain('Транзакція залишиться без змін');
    // Confirming removes the чек by its own id, and touches no transactions repository at all.
    expect(source).toContain('receiptsRepo.remove(receipt.receipt.id)');
    expect(source).not.toContain('transactionsRepo.save');
    expect(source).not.toContain('transactionsRepo.remove');
    // And the транзакція offers the scan again afterwards, because it now carries no чек.
    expect(receiptOffer({ type: 'expense' }).kind).toBe('scan');
  });

  it('Backing out of the confirmation keeps the чек', () => {
    const source = readFileSync(new URL('../app/transaction/receipt.tsx', import.meta.url), 'utf8');

    // «Скасувати» is the cancel style and carries no `onPress` — cancelling does nothing at all,
    // which is what «the чек is still attached with all its позиції» means at this layer.
    expect(source).toContain("{ text: 'Скасувати', style: 'cancel' }");
    expect(source).toMatch(/text: 'Відкріпити',\s*style: 'destructive',\s*onPress:/);
  });

  it('asks for confirmation naming what goes', () => {
    const text = detachConfirmation(
      storedReceipt({}, [
        { id: 'a', receiptId: 'rc-1', line: 1, rawName: 'Молоко', quantityThousandths: 1000, lineTotal: money(4720, 'UAH') },
      ]),
    );

    expect(text).toContain('742,30\u00a0₴');
    expect(text).toContain('1 позицію');
    expect(text).toContain('Транзакція залишиться без змін');
  });
});

/**
 * `src/ui/` is pure TypeScript by rule — the gate runs no JSX. Asserted here because this module
 * is the one the screens lean on hardest, and a `react-native` import in it would take the whole
 * flow out of `verify`.
 */
it('the flow module loads no React and no device', () => {
  const source = readFileSync(new URL('./receipt-screen.ts', import.meta.url), 'utf8');

  for (const forbidden of ['react', 'react-native', 'expo']) {
    expect(source).not.toContain(`from '${forbidden}`);
  }
  // The camera port's *type* is imported; its device adapter never is.
  expect(source).not.toContain('qr-scan-device');
});

/**
 * The screens, read by path.
 *
 * `verify` runs no JSX, so what these assertions can prove is that the wiring is present and that
 * the decisions were left where they are tested. Behaviour is the emulator smoke of §11 — a
 * structural test is evidence a button exists, never evidence it works.
 *
 * The tests live here and never under `src/app/`: expo-router bundles that whole tree through
 * `require.context`, so a test file in it would ship into the app and its `node:fs` import would
 * crash the bundle on launch (`rules/testing.md`).
 */
describe('the screens are wired to this module', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const form = source('../app/transaction/[id].tsx');
  const scan = source('../app/transaction/scan.tsx');
  const receipt = source('../app/transaction/receipt.tsx');

  it('the транзакція form asks this module what to offer, and decides nothing itself', () => {
    expect(form).toContain("import { receiptOffer } from '@/ui/receipt-screen'");
    expect(form).toContain('receiptsRepo.forTransaction(id)');
    // The form's own choice, never the stored транзакція: `form.shape` is what the «Тип» chips
    // set, so switching to переказ withdraws the offer before the save rather than after it.
    expect(form).toContain('type={form.shape}');
    expect(form).not.toContain('receiptOffer({ transaction');
    expect(form).not.toContain('transaction={original}');
    // The label and the prominence come from the offer, not from anything written out here: both
    // weights render `offer.label`, and the seeded-category rule appears nowhere in the screen.
    expect(form).toContain('title={offer.label}');
    expect(form).toContain('{offer.label}</ThemedText>');
    expect(form).not.toContain('title="Сканувати QR чека"');
    // The seeded-category rule is the module's; the screen compares no category id of its own.
    // Matched as a quoted id and as a comparison, so prose explaining the rule may still appear.
    expect(form).not.toContain("'groceries'");
    expect(form).not.toMatch(/categoryId\s*===/);
  });

  it('leaves «Зберегти» as the screen`s only filled action', () => {
    // `components/form.tsx`: the filled action is the loudest thing on its screen. The emulator
    // run of 2026-09-02 showed the prominent scan offer competing with the form's own verb, so
    // the offer is an outline at most — the two weights are `secondary` and a link.
    expect(form).toContain('<Action variant="secondary" title={offer.label} onPress={onScan} />');
    expect(form).not.toMatch(/variant=\{offer\.prominent \? 'primary'/);
    // «Зберегти» is the one Action on this screen with no variant, i.e. the primary.
    expect(form).toContain('<Action title="Зберегти" onPress={apply} />');
  });

  it('the scan offer and the чек line lead to their own screens', () => {
    expect(form).toContain("pathname: '/transaction/scan'");
    expect(form).toContain("pathname: '/transaction/receipt'");
  });

  it('the scanner decodes QR only and latches the first decode', () => {
    expect(scan).toContain("barcodeScannerSettings={{ barcodeTypes: ['qr'] }}");
    expect(scan).toContain('onBarcodeScanned={onScanned}');
    // Both latches: the ref for the decodes that arrive within one commit, and `decoded` itself.
    expect(scan).toContain('latched.current');
    expect(scan).toContain('decoded(current, data)');
  });

  it('the scanner takes its states, sentences and provider from the tested modules', () => {
    expect(scan).toContain("from '@/ui/receipt-screen'");
    expect(scan).toContain('refusalView(state.refusal)');
    expect(scan).toContain('previewView(state)');
    expect(scan).toContain('chkAllWebProvider');
    // The endpoint is the adapter's business; no screen writes one.
    expect(scan).not.toContain('cabinet.tax.gov.ua');
  });

  it('the scanner re-reads the транзакція before it stores anything', () => {
    // A транзакція deleted while the scanner was open must end the flow with the typed reason,
    // not with a foreign-key error.
    expect(scan).toContain("storeRefused(state, { kind: 'transaction-gone' })");
    expect(scan).toContain("storeRefused(state, { kind: 'already-has-receipt' })");
    expect(scan).toContain("kind: 'attached-elsewhere'");
    expect(scan).toContain('receiptsRepo.byIdentity(identity)');
  });

  it('the чек view lists позиції from storage and asks before detaching', () => {
    expect(receipt).toContain('receiptItemRows(loaded.stored.items)');
    // «Скасувати» at the preview goes through the transition that names the case.
    expect(scan).toContain('cancelPreview(current)');
    expect(receipt).toContain('detachConfirmation(receipt)');
    expect(receipt).toContain("Alert.alert('Відкріпити чек?'");
    expect(receipt).toContain('receiptsRepo.remove(receipt.receipt.id)');
    // Cancelling is offered and is the non-destructive choice.
    expect(receipt).toContain("{ text: 'Скасувати', style: 'cancel' }");
  });

  it('Offline reading', () => {
    // An attached чек is read from storage and from nothing else: the чек screen names no address,
    // takes no transport and never touches the provider, so it renders identically with the phone
    // offline. (The позиції it shows are `receiptItemRows`, proven above.)
    expect(receipt).not.toContain('cabinet.tax.gov.ua');
    expect(receipt).not.toContain('chkAllWebProvider');
    expect(receipt).not.toContain('fetch');
    expect(receipt).toContain('receiptsRepo.forTransaction(id)');
  });

  it('asks the system for the camera through the transition that has a screen', () => {
    // `askedFor`, not `startScan`: the latter answers `{kind:'permission'}` for a refusal the
    // system will accept again, and no branch renders that — the empty screen the emulator showed
    // on 2026-09-02. Asserted on the source because the flow's own test cannot see the wiring.
    expect(scan).toContain('askedFor(await qrScan.request())');
    expect(scan).not.toContain('startScan(await qrScan.request())');
  });

  it('no screen reads the source snapshot', () => {
    // «Screens read the parsed чек»: the snapshot is written once by the scanner and read by
    // nothing. Matched as a property access, so the word may still appear in prose explaining why.
    for (const [name, text] of [
      ['[id].tsx', form],
      ['scan.tsx', scan],
      ['receipt.tsx', receipt],
    ] as const) {
      expect(text.match(/\.snapshot\b/g), name).toBeNull();
    }
    // The scanner writes it, once, from the document the lookup returned.
    expect(scan).toContain('snapshot: state.document');
  });

  it('no screen holds a rule this module could hold', () => {
    for (const [name, text] of [
      ['scan.tsx', scan],
      ['receipt.tsx', receipt],
    ] as const) {
      // Every Ukrainian sentence about a failure lives in `refusalView`, so a screen that spelled
      // one out would be a second place to change when the wording changes.
      expect(text, name).not.toContain('Це не QR фіскального чека');
      expect(text, name).not.toContain('Немає звʼязку з податковою');
    }
  });
});

/**
 * fiscal-receipts-screen «The scan offer answers the type the form is showing, not the stored one».
 *
 * The offer is computed from the values the form holds, so a «Тип» switched to переказ withdraws
 * it at the tap — the emulator found the old signature keeping «Сканувати QR чека» on screen until
 * the транзакція was saved.
 */
describe('the offer follows the form, not the store', () => {
  it('Scenario: Choosing переказ withdraws the scan offer', () => {
    expect(receiptOffer({ type: 'expense', categoryId: 'home' }).kind).toBe('scan');

    expect(receiptOffer({ type: 'transfer', categoryId: 'home' }).kind).toBe('none');
  });

  it('Scenario: Choosing витрата brings the offer back', () => {
    expect(receiptOffer({ type: 'transfer' }).kind).toBe('none');

    expect(receiptOffer({ type: 'expense' }).kind).toBe('scan');
  });

  it('Scenario: The prominence follows the category being chosen', () => {
    expect(receiptOffer({ type: 'expense', categoryId: 'home' })).toMatchObject({
      prominent: false,
    });

    expect(receiptOffer({ type: 'expense', categoryId: 'groceries' })).toMatchObject({
      prominent: true,
    });
  });

  it('Scenario: An attached чек is shown whatever the form says', () => {
    const offer = receiptOffer({ type: 'transfer', receipt: storedReceipt() });

    expect(offer.kind).toBe('attached');
  });
});
