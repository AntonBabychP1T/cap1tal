import { money, type Money } from '../domain/money';
import { isoDate, type IsoDate } from '../domain/transaction';
import {
  asList,
  attribute,
  child,
  NOT_A_FISCAL_DOCUMENT,
  NOT_A_SALE_OR_RETURN,
  type ParsedItem,
  type ParseOutcome,
  type XmlNode,
} from './document';
import { plainInteger } from './numbers';

/**
 * The classic РРО dialect: the ФСКО `<RQ>` packet, whose figures are already integers — money in
 * kopiykas (`SM`, `PRC`) and quantities in thousandths (`Q`). Nothing here is scaled, because
 * nothing here is a decimal; a value carrying a decimal point is a document this parser does not
 * understand rather than one to round.
 *
 * The shape is `RQ > DAT > C > (L | P | D | M | E)`. Only `<P>` rows are позиції: `<L>` is the
 * free text a till prints (cashier, loyalty programme, the card line), `<M>` is the payment,
 * `<E>` the fiscal footer and `<TX>` the tax breakdown. That list is the whole of «what is a
 * позиція» in this dialect, and it is the same rule `check01.ts` applies to its own document.
 */

/** `<C T="…">`: 0 is a sale, 1 a return. Anything above is a service operation. */
const SALE = '0';
const RETURN = '1';

/** `<E TS="…">` and `<DAT><TS>`: `YYYYMMDDHHMMSS`. */
const STAMP = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;

const UAH = 'UAH';
/** A `<P>` row that names no `Q` sold one of the thing. */
const ONE = 1000;

function kopiykas(text: string | undefined): Money | undefined {
  if (text === undefined) return undefined;
  const amount = plainInteger(text);
  return amount === undefined ? undefined : money(amount, UAH);
}

function stampOf(value: string | undefined): { date: IsoDate; time: string } | undefined {
  const match = value === undefined ? null : STAMP.exec(value);
  if (!match) return undefined;
  const [, year = '', month = '', day = '', hh = '', mm = '', ss = ''] = match;
  if (Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59) return undefined;
  try {
    return { date: isoDate(`${year}-${month}-${day}`), time: `${hh}:${mm}:${ss}` };
  } catch {
    return undefined;
  }
}

/** One `<P>` row as a позиція. `NM` and `SM` are what a row must carry; the rest may be absent. */
function itemOf(row: XmlNode, index: number): ParsedItem | undefined {
  const rawName = attribute(row, 'NM');
  const lineTotal = kopiykas(attribute(row, 'SM'));
  if (rawName === undefined || lineTotal === undefined) return undefined;

  const quantity = attribute(row, 'Q');
  const quantityThousandths = quantity === undefined ? ONE : plainInteger(quantity);
  if (quantityThousandths === undefined) return undefined;

  const price = attribute(row, 'PRC');
  const unitPrice = price === undefined ? undefined : kopiykas(price);
  if (price !== undefined && unitPrice === undefined) return undefined;

  const line = attribute(row, 'N');
  const lineNumber = line === undefined ? index + 1 : plainInteger(line);

  return {
    line: lineNumber ?? index + 1,
    rawName,
    quantityThousandths,
    ...(attribute(row, 'AT_TM') === undefined ? {} : { unit: attribute(row, 'AT_TM') as string }),
    ...(unitPrice === undefined ? {} : { unitPrice }),
    lineTotal,
    ...(attribute(row, 'CD') === undefined ? {} : { barcode: attribute(row, 'CD') as string }),
    ...(attribute(row, 'CZD') === undefined ? {} : { uktzed: attribute(row, 'CZD') as string }),
    ...(attribute(row, 'C') === undefined ? {} : { code: attribute(row, 'C') as string }),
  };
}

/**
 * A `<RQ>` tree → a чек, or the reason it is not one.
 *
 * The total comes from `<E SM>`, the fiscal footer's own figure, exactly as the ПРРО total comes
 * from `CHECKTOTAL/SUM`: it is what the чек was closed at, discounts already applied, and the
 * позиції are not expected to add up to it.
 */
export function parseRroPacket(root: XmlNode): ParseOutcome {
  const dat = child(root, 'DAT');
  const body = child(dat, 'C');
  if (dat === undefined || body === undefined) return NOT_A_FISCAL_DOCUMENT;

  const type = attribute(body, 'T') ?? SALE;
  if (type !== SALE && type !== RETURN) return NOT_A_SALE_OR_RETURN;

  const footer = child(body, 'E');
  const total = kopiykas(attribute(footer, 'SM'));
  // `<E TS>` is the moment the document was closed; `<DAT><TS>` repeats it, and is the fallback
  // for a packet whose footer states none.
  const stamp = stampOf(attribute(footer, 'TS')) ?? stampOf(dat.TS as string | undefined);
  if (total === undefined || stamp === undefined) return NOT_A_FISCAL_DOCUMENT;

  const items: ParsedItem[] = [];
  for (const [index, row] of asList(body.P).entries()) {
    const item = itemOf(row, index);
    if (item === undefined) return NOT_A_FISCAL_DOCUMENT;
    items.push(item);
  }

  // A `<D>` naming a line (`NI`) is that позиція's discount. A `<D>` naming none is a чек-level
  // figure and is deliberately dropped: the total above already reflects it (design D2).
  const byLine = new Map(items.map((item) => [item.line, item]));
  for (const discount of asList(body.D)) {
    const line = attribute(discount, 'NI');
    const amount = kopiykas(attribute(discount, 'SM'));
    if (line === undefined || amount === undefined) continue;
    const target = byLine.get(plainInteger(line) ?? -1);
    if (target) byLine.set(target.line, { ...target, discount: amount });
  }

  return {
    kind: 'parsed',
    receipt: {
      dialect: 'rro',
      kind: type === RETURN ? 'return' : 'sale',
      issuedDate: stamp.date,
      issuedTime: stamp.time,
      total,
      // The packet names the реєстратор on `<DAT FN>` and repeats it on `<E FN>`; the fiscal
      // number of the document itself is `<E NO>`.
      ...(attribute(dat, 'FN') === undefined
        ? {}
        : { documentRegistrarNumber: attribute(dat, 'FN') as string }),
      ...(attribute(footer, 'NO') === undefined
        ? {}
        : { documentFiscalNumber: attribute(footer, 'NO') as string }),
      items: items.map((item) => byLine.get(item.line) ?? item),
    },
  };
}
