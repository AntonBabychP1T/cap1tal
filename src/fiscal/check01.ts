import { money, type Money } from '../domain/money';
import { isoDate, type IsoDate } from '../domain/transaction';
import {
  asList,
  attribute,
  child,
  NOT_A_FISCAL_DOCUMENT,
  NOT_A_SALE_OR_RETURN,
  text,
  type ParsedItem,
  type ParseOutcome,
  type XmlNode,
} from './document';
import { scaledInteger } from './numbers';

/**
 * The ПРРО dialect: the `<CHECK>` document of `check01.xsd`, whose figures are decimal strings.
 *
 * Everything this file decides is decided once, here, so that «what is a позиція» has one answer
 * in the app: `CHECKBODY/ROW` rows and nothing else. `CHECKPAY` (how it was paid), `CHECKTAX`
 * (the ПДВ breakdown) and the header are read for the чек's own fields or not at all.
 */

/** `DOCTYPE` 0 is a sale-or-return document; 100+ are shift and service documents. */
const SALE_DOCTYPE = '0';
/** `DOCSUBTYPE`: 0 is a касовий чек, 1 a видатковий чек (повернення). 2+ are service operations. */
const SUBTYPE_SALE = '0';
const SUBTYPE_RETURN = '1';

const MONEY_SCALE = 2;
const QUANTITY_SCALE = 3;
/** A row that names no quantity sold one of the thing. */
const ONE = 1000;

const ORDER_DATE = /^(\d{2})(\d{2})(\d{4})$/;
const ORDER_TIME = /^(\d{2})(\d{2})(\d{2})$/;

const UAH = 'UAH';

function uah(text: string | undefined): Money | undefined {
  if (text === undefined) return undefined;
  const amount = scaledInteger(text, MONEY_SCALE);
  return amount === undefined ? undefined : money(amount, UAH);
}

/** `ddmmyyyy`, the order the ЄВПЕЗ format writes a date in — day first, not year. */
function orderDate(value: string | undefined): IsoDate | undefined {
  const match = value === undefined ? null : ORDER_DATE.exec(value);
  if (!match) return undefined;
  try {
    return isoDate(`${match[3]}-${match[2]}-${match[1]}`);
  } catch {
    return undefined;
  }
}

function orderTime(value: string | undefined): string | undefined {
  const match = value === undefined ? null : ORDER_TIME.exec(value);
  if (!match) return undefined;
  const [, hh = '', mm = '', ss = ''] = match;
  if (Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59) return undefined;
  return `${hh}:${mm}:${ss}`;
}

/**
 * One `CHECKBODY/ROW` as a позиція, or nothing when the row is not one this app can hold.
 *
 * A row must have a name and a `COST`; everything else is optional and stays absent when the
 * document leaves it out. `COST` is taken verbatim and `AMOUNT × PRICE` is never computed in its
 * place — the registrar already rounded that product, and recomputing it is how a позиція starts
 * disagreeing with the paper in the owner's hand.
 */
function itemOf(row: XmlNode, index: number): ParsedItem | undefined {
  const rawName = text(row, 'NAME');
  const lineTotal = uah(text(row, 'COST'));
  if (rawName === undefined || lineTotal === undefined) return undefined;

  const amount = text(row, 'AMOUNT');
  const quantityThousandths = amount === undefined ? ONE : scaledInteger(amount, QUANTITY_SCALE);
  if (quantityThousandths === undefined) return undefined;

  const price = text(row, 'PRICE');
  const unitPrice = price === undefined ? undefined : uah(price);
  if (price !== undefined && unitPrice === undefined) return undefined;

  // A discount stated *inside the row* belongs to this позиція. The one in `CHECKTOTAL` does not
  // belong to any, and is deliberately not read anywhere in this file (design D2).
  const discountText = text(row, 'DISCOUNTSUM');
  const discount = discountText === undefined ? undefined : uah(discountText);
  if (discountText !== undefined && discount === undefined) return undefined;

  const line = attribute(row, 'ROWNUM');
  const lineNumber = line === undefined ? index + 1 : Number(line);

  return {
    line: Number.isSafeInteger(lineNumber) ? lineNumber : index + 1,
    rawName,
    quantityThousandths,
    ...(text(row, 'UNITNM') === undefined ? {} : { unit: text(row, 'UNITNM') as string }),
    ...(unitPrice === undefined ? {} : { unitPrice }),
    lineTotal,
    ...(discount === undefined ? {} : { discount }),
    ...(text(row, 'BARCODE') === undefined ? {} : { barcode: text(row, 'BARCODE') as string }),
    ...(text(row, 'UKTZED') === undefined ? {} : { uktzed: text(row, 'UKTZED') as string }),
    ...(text(row, 'CODE') === undefined ? {} : { code: text(row, 'CODE') as string }),
  };
}

/**
 * A `<CHECK>` tree → a чек, or the reason it is not one.
 *
 * The caller has already established that the root is `CHECK`; this reads it. A document whose
 * `DOCTYPE` is not a sale, or whose `DOCSUBTYPE` is neither a чек nor a повернення, is refused
 * as «not a sale or return» rather than parsed into an empty чек — attaching a shift-open
 * document to a витрата is never the right answer.
 */
export function parseCheck01(root: XmlNode): ParseOutcome {
  const head = child(root, 'CHECKHEAD');
  if (head === undefined) return NOT_A_FISCAL_DOCUMENT;

  // The kind is decided before anything else is required, because a shift or service document
  // legitimately carries no CHECKTOTAL and no CHECKBODY. Asking for a total first would tell the
  // owner «this is not a fiscal document» about a document that is perfectly valid and simply
  // is not a чек.
  const docType = text(head, 'DOCTYPE');
  const subtype = text(head, 'DOCSUBTYPE') ?? SUBTYPE_SALE;
  if (docType !== SALE_DOCTYPE || (subtype !== SUBTYPE_SALE && subtype !== SUBTYPE_RETURN)) {
    return NOT_A_SALE_OR_RETURN;
  }

  const total = uah(text(child(root, 'CHECKTOTAL'), 'SUM'));
  const issuedDate = orderDate(text(head, 'ORDERDATE'));
  const issuedTime = orderTime(text(head, 'ORDERTIME'));
  if (total === undefined || issuedDate === undefined || issuedTime === undefined) {
    return NOT_A_FISCAL_DOCUMENT;
  }

  const rows = asList(child(root, 'CHECKBODY')?.ROW);
  const items: ParsedItem[] = [];
  for (const [index, row] of rows.entries()) {
    const item = itemOf(row, index);
    // One unreadable row fails the whole document, as one unreadable statement row fails a whole
    // monobank answer: half a чек is worse than none, because the owner cannot see what is missing.
    if (item === undefined) return NOT_A_FISCAL_DOCUMENT;
    items.push(item);
  }

  return {
    kind: 'parsed',
    receipt: {
      dialect: 'prro',
      kind: subtype === SUBTYPE_RETURN ? 'return' : 'sale',
      issuedDate,
      issuedTime,
      total,
      ...(text(head, 'ORGNM') === undefined ? {} : { sellerName: text(head, 'ORGNM') as string }),
      ...(text(head, 'POINTNM') === undefined ? {} : { pointName: text(head, 'POINTNM') as string }),
      ...(text(head, 'CASHREGISTERNUM') === undefined
        ? {}
        : { documentRegistrarNumber: text(head, 'CASHREGISTERNUM') as string }),
      // `ORDERTAXNUM` is optional in the format and absent from real receipts; when it is there it
      // must agree with the реквізити, which `attachable` is what checks.
      ...(text(head, 'ORDERTAXNUM') === undefined
        ? {}
        : { documentFiscalNumber: text(head, 'ORDERTAXNUM') as string }),
      items,
    },
  };
}
