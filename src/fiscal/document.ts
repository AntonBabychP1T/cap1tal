import { XMLParser } from 'fast-xml-parser';

import type { Money } from '../domain/money';
import type { ReceiptDialect, ReceiptKind } from '../domain/fiscal-receipt';
import type { IsoDate } from '../domain/transaction';

/**
 * What a fiscal document means, once a dialect parser has read it — and the one XML reader both
 * dialects share.
 *
 * A `ParsedReceipt` is a чек *before it has an identity*: the tax service serves a document in
 * answer to реквізити, and the реквізити are what the чек is filed under (design D2a). The
 * parsers therefore never invent `registrarNumber` or `fiscalNumber`; they report what the
 * document said about itself, and `attachable` in `parse.ts` compares the two and stamps the
 * identity. That way a document that is not the one asked for is refused instead of being stored
 * under someone else's number.
 */

/** One позиція as the document printed it, before it belongs to a stored чек. */
export interface ParsedItem {
  readonly line: number;
  readonly rawName: string;
  readonly quantityThousandths: number;
  readonly unit?: string;
  readonly unitPrice?: Money;
  readonly lineTotal: Money;
  readonly discount?: Money;
  readonly barcode?: string;
  readonly uktzed?: string;
  readonly code?: string;
}

/** A чек as the document states it. Identity is the lookup's business, not the document's. */
export interface ParsedReceipt {
  readonly dialect: ReceiptDialect;
  readonly kind: ReceiptKind;
  readonly issuedDate: IsoDate;
  /** 'HH:mm:ss'. */
  readonly issuedTime: string;
  readonly total: Money;
  readonly sellerName?: string;
  readonly pointName?: string;
  /**
   * What the document says about its own реєстратор and fiscal number, when it says anything.
   * Checked against the реквізити; never used as the identity on its own — a ПРРО document need
   * not carry `ORDERTAXNUM` at all.
   */
  readonly documentRegistrarNumber?: string;
  readonly documentFiscalNumber?: string;
  readonly items: readonly ParsedItem[];
}

/** Why a document yielded no чек. Each is a sentence the screen has to be able to say. */
export type ParseFailure =
  /** Not a fiscal document at all: not XML, or a root neither dialect knows. */
  | { readonly kind: 'not-a-fiscal-document' }
  /** A shift, service or other document that is neither a sale nor a return. */
  | { readonly kind: 'not-a-sale-or-return' };

export type ParseOutcome = { readonly kind: 'parsed'; readonly receipt: ParsedReceipt } | ParseFailure;

export const NOT_A_FISCAL_DOCUMENT: ParseFailure = { kind: 'not-a-fiscal-document' };
export const NOT_A_SALE_OR_RETURN: ParseFailure = { kind: 'not-a-sale-or-return' };

/**
 * The one XML reader, configured once for both dialects.
 *
 * `parseTagValue` and `parseAttributeValue` are off deliberately and matter more than anything
 * else here: with them on, `SM="5180"` arrives as the number 5180 and `AMOUNT>5.701` as the float
 * 5.701, and the string arithmetic in `numbers.ts` would be reading digits back out of a value
 * that had already been through a float. Everything a document says stays text until this module
 * turns it into an integer.
 */
const PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
});

export type XmlNode = Record<string, unknown>;

/**
 * A document's text as a tree, or nothing when it is not XML at all. `fast-xml-parser` throws on
 * malformed input; a malformed document is one of this module's outcomes, so it is caught here
 * and nowhere else.
 */
export function readXml(text: string): XmlNode | undefined {
  // Trimmed before parsing, not merely to test for emptiness: `trim` also takes off a leading
  // U+FEFF, and the official ЄВПЕЗ examples carry one in front of their declaration.
  const source = text.trim();
  if (source === '') return undefined;
  try {
    const tree: unknown = PARSER.parse(source);
    return tree !== null && typeof tree === 'object' ? (tree as XmlNode) : undefined;
  } catch {
    return undefined;
  }
}

/** A child that may appear once or many times, always as a list. */
export function asList(value: unknown): XmlNode[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is XmlNode => entry !== null && typeof entry === 'object');
  }
  return value !== null && typeof value === 'object' ? [value as XmlNode] : [];
}

/** A node's child as an object, when it is one. */
export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  const value = node?.[name];
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as XmlNode)
    : undefined;
}

/**
 * A field's text, or nothing when the document does not carry it.
 *
 * An empty element (`<UNITNM/>`, or `<UNITNM></UNITNM>`) is *nothing*, not an empty string: the
 * rule is that absent stays absent, and a name the parser sets to `''` would be a value no screen
 * could tell from a real one. Numbers arrive here as strings because the parser is configured not
 * to touch them; a document that carries a bare number is still read as its digits.
 */
export function text(node: XmlNode | undefined, name: string): string | undefined {
  const value = node?.[name];
  if (typeof value === 'string') {
    return value === '' ? undefined : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

/** An attribute's text, under the `@` prefix this parser is configured with. */
export function attribute(node: XmlNode | undefined, name: string): string | undefined {
  return text(node, `@${name}`);
}
