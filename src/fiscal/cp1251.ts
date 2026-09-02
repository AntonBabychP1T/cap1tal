/**
 * The bytes the tax service serves → the text of a fiscal document.
 *
 * Every `checkXml` observed is base64 over windows-1251 bytes with a matching declaration, and
 * Hermes' `TextDecoder` speaks UTF-8 and nothing else — so the single-byte table below is ours to
 * keep. It is 128 entries, the upper half of windows-1251; the lower half is ASCII and is decoded
 * as itself.
 *
 * The decode is declaration-aware rather than assuming: a registrar that starts serving UTF-8
 * would otherwise turn every Ukrainian letter into two, silently, in a snapshot kept forever.
 */

/**
 * Bytes 0x80–0xFF of windows-1251, in order. Index `byte - 0x80`.
 *
 * 0x98 has no character assigned to it in the vendor encoding; it maps here to U+0098, which is
 * what the WHATWG encoding index says and therefore what every browser and Node's own decoder
 * produce. Following the standard rather than choosing a replacement character is what lets
 * `cp1251.test.ts` hold this table against `TextDecoder('windows-1251')` for all 256 bytes —
 * an oracle written by someone else, which is the only kind worth testing a table against.
 */
const UPPER_HALF =
  'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏ' +
  'ђ‘’“”•–—\u0098™љ›њќћџ' +
  '\u00a0ЎўЈ¤Ґ¦§Ё©Є«¬\u00ad®Ї' +
  '°±Ііґµ¶·ё№є»јЅѕї' +
  'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' +
  'абвгдежзийклмнопрстуфхцчшщъыьэюя';

/** How much of the head is read to find the declaration. Every observed one is far inside this. */
const DECLARATION_WINDOW = 256;

const DECLARATION = /^<\?xml[^>]*\?>/;
const ENCODING = /encoding\s*=\s*["']([^"']*)["']/i;

/** windows-1251 bytes → text, one byte to one code point. */
export function decodeWindows1251(bytes: Uint8Array): string {
  let out = '';
  // Built in chunks rather than one `fromCharCode(...bytes)`: a document is a couple of kilobytes
  // now, but spreading an array into a call is the line that breaks on the first long one.
  for (const byte of bytes) {
    out += byte < 0x80 ? String.fromCharCode(byte) : (UPPER_HALF[byte - 0x80] as string);
  }
  return out;
}

/** The ASCII head of a document, enough to read its declaration and nothing more. */
function head(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < Math.min(bytes.length, DECLARATION_WINDOW); i += 1) {
    const byte = bytes[i] as number;
    out += byte < 0x80 ? String.fromCharCode(byte) : ' ';
  }
  return out;
}

/**
 * The declaration rewritten to name UTF-8, because that is what the stored snapshot now is: the
 * text is kept, and a later re-parse of it must not be told to read it as windows-1251 again.
 * A document that declares nothing is left exactly as it is — inventing a declaration would be
 * changing what the registrar served.
 */
function declareUtf8(text: string): string {
  const declaration = DECLARATION.exec(text);
  if (!declaration) return text;
  const found = declaration[0];
  if (!ENCODING.test(found)) return text;
  return text.replace(found, found.replace(ENCODING, 'encoding="UTF-8"'));
}

/**
 * The document's bytes as text, honouring the declaration and leaving the result declaring UTF-8.
 *
 * A UTF-8 byte-order mark is dropped: it is a marker about the bytes, not a character of the
 * document, and leaving it in front of `<?xml` makes the declaration unfindable to every parser
 * including ours.
 */
export function decodeFiscalDocument(bytes: Uint8Array): string {
  const body =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes;

  const declared = ENCODING.exec(DECLARATION.exec(head(body))?.[0] ?? '')?.[1] ?? '';
  const utf8 = declared.toLowerCase().replace(/[-_]/g, '') === 'utf8';
  const text = utf8 ? new TextDecoder('utf-8').decode(body) : decodeWindows1251(body);
  return declareUtf8(text);
}

/**
 * The base64 of an answer as bytes. `atob` exists on Hermes and in Node, and is the only decoder
 * both have; anything it refuses is not base64, which the caller reads as an unreadable answer.
 *
 * Returns nothing rather than throwing — a malformed payload is one of the adapter's outcomes,
 * not an exception for it to catch.
 */
export function bytesFromBase64(payload: string): Uint8Array | undefined {
  // Whitespace is legal inside base64 as it travels and illegal to `atob`; the tax service does
  // not wrap its payloads today, and a version that starts to must not become «unreadable».
  const compact = payload.replace(/\s+/g, '');
  let binary: string;
  try {
    binary = atob(compact);
  } catch {
    return undefined;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i) & 0xff;
  }
  return bytes;
}
