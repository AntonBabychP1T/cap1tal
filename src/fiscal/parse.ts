import type { IsoDate } from '../domain/transaction';
import { parseCheck01 } from './check01';
import {
  NOT_A_FISCAL_DOCUMENT,
  readXml,
  type ParsedReceipt,
  type ParseOutcome,
  type XmlNode,
} from './document';
import type { ReceiptLookup } from './qr';
import { parseRroPacket } from './rro-packet';

/**
 * The door into parsing: a decoded document's text → a чек, or one typed reason.
 *
 * Two things happen here and nowhere else. First the dialect is chosen — by the root element,
 * which is the only honest signal, since both dialects are plain XML with no namespace to tell
 * them apart. Then, once a чек exists, `attachable` decides whether it is *the* чек: the document
 * arrived in answer to реквізити, and a document naming a different реєстратор, date or total is
 * not the one asked for, however well it parses.
 */

export type { ParsedItem, ParsedReceipt, ParseFailure, ParseOutcome } from './document';

/** `<CHECK>` is the ПРРО document of `check01.xsd`; `<RQ>` is the classic РРО ФСКО packet. */
const CHECK01_ROOT = 'CHECK';
const RRO_ROOT = 'RQ';

/**
 * A decoded fiscal document → a чек or a reason.
 *
 * Anything that is not XML, is empty, or whose root is neither dialect's is refused *whole*: this
 * function never returns a partial чек, because a чек missing позиції the owner can see on the
 * paper is worse than no чек at all.
 */
export function parseFiscalDocument(text: string): ParseOutcome {
  const tree = readXml(text);
  if (tree === undefined) return NOT_A_FISCAL_DOCUMENT;

  const check01 = tree[CHECK01_ROOT];
  if (check01 !== null && typeof check01 === 'object' && !Array.isArray(check01)) {
    return parseCheck01(check01 as XmlNode);
  }
  const rro = tree[RRO_ROOT];
  if (rro !== null && typeof rro === 'object' && !Array.isArray(rro)) {
    return parseRroPacket(rro as XmlNode);
  }
  return NOT_A_FISCAL_DOCUMENT;
}

/** A чек with the identity the реквізити gave it, ready to be stored. */
export interface AttachableReceipt {
  readonly receipt: ParsedReceipt;
  readonly registrarNumber: string;
  readonly fiscalNumber: string;
  readonly issuedDate: IsoDate;
}

export type AttachableOutcome =
  | { readonly kind: 'attachable'; readonly attachable: AttachableReceipt }
  /**
   * A perfectly valid document that is not the чек the реквізити asked for. Its own reason, apart
   * from «not a fiscal document», because the owner's next step is different: rescan, rather than
   * conclude the tax service is broken.
   */
  | { readonly kind: 'not-this-receipt'; readonly disagreesOn: 'registrar' | 'fiscalNumber' | 'date' | 'total' };

/**
 * The identity is the lookup's, and agreement is checked (design D2a).
 *
 * A ПРРО document need not name its own fiscal number, so the чек is filed under the реквізити it
 * was found by — that is what makes «two чеки with the same identity are one чек» decidable at
 * all. What the document *does* say is compared, and a disagreement refuses it rather than
 * storing the document under a number it never claimed.
 *
 * The date compared is the document's own issue date: the реквізити carry the date printed on the
 * QR, and the two must be the same day or this is a different чек.
 */
export function attachable(receipt: ParsedReceipt, lookup: ReceiptLookup): AttachableOutcome {
  if (
    receipt.documentRegistrarNumber !== undefined &&
    receipt.documentRegistrarNumber !== lookup.registrarNumber
  ) {
    return { kind: 'not-this-receipt', disagreesOn: 'registrar' };
  }
  if (
    receipt.documentFiscalNumber !== undefined &&
    receipt.documentFiscalNumber !== lookup.fiscalNumber
  ) {
    return { kind: 'not-this-receipt', disagreesOn: 'fiscalNumber' };
  }
  if (receipt.issuedDate !== lookup.date) {
    return { kind: 'not-this-receipt', disagreesOn: 'date' };
  }
  if (receipt.total.amount !== lookup.total.amount || receipt.total.currency !== lookup.total.currency) {
    return { kind: 'not-this-receipt', disagreesOn: 'total' };
  }

  return {
    kind: 'attachable',
    attachable: {
      receipt,
      registrarNumber: lookup.registrarNumber,
      fiscalNumber: lookup.fiscalNumber,
      issuedDate: receipt.issuedDate,
    },
  };
}
