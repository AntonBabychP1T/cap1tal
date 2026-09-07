import { KEY_BYTES } from './envelope';

/**
 * The **код відновлення**: the sealing key written so a person can copy it onto paper, and read
 * back from paper at three in the morning on a phone they have just bought (design D7).
 *
 * Crockford's base32 alphabet is the whole reason this is not a hex dump. It leaves out `I`, `L`,
 * `O` and `U` entirely, and on *reading* folds `I` and `L` into `1` and `O` into `0` — which is
 * exactly the mistake a person makes transcribing by hand. Four check characters over the code's
 * own symbols are what let the app say «цей код неправильний» before it downloads or decrypts
 * anything: the
 * spec's "refused as wrong before anything is opened" is this checksum and not a failed
 * decryption, because a failed decryption cannot tell a typo from a версія of another line.
 *
 * The code is shown in eight groups of seven so the eye keeps its place; spacing, hyphens and case
 * are all ignored on the way back in, since a person copying 56 characters will not reproduce them.
 *
 * Nothing here touches storage or a device. The key it encodes is the key `src/platform/backup-key.ts`
 * holds, and this module never sees where that is.
 */

/**
 * Crockford's base32, in order. Twenty-two letters and ten digits: no `I`, `L`, `O` or `U` — the
 * first three because they are read as `1`, `1` and `0`, and `U` so no code can spell an obscenity.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** How the eye is helped: eight groups of seven, which is exactly the 56 characters of a code. */
export const GROUP_SIZE = 7;
export const GROUP_COUNT = 8;

/**
 * 32 bytes is 256 bits; base32 carries 5 bits a character, so 52 characters, then 4 of check.
 *
 * Four and not two, which is what design D7 first said: 52 + 2 is 54 and does not divide into the
 * eight groups of seven the same decision asks for, and four characters make the layout exact while
 * widening the check from 10 bits to 20. The extra two characters cost the owner nothing — they are
 * copying a line either way — and buy a check that no realistic mistake slips past.
 */
const KEY_CHARS = 52;
const CHECK_CHARS = 4;

/** What a complete код відновлення comes to, ignoring the spaces it is shown with. */
export const CODE_LENGTH = KEY_CHARS + CHECK_CHARS;

/** Why a код відновлення could not be read. Each is a different sentence for the owner. */
export type RecoveryCodeRefusal =
  /** Not enough characters, too many, or a character the alphabet does not contain. */
  | { readonly kind: 'malformed' }
  /** The right shape, and the check characters say it was copied down wrong. */
  | { readonly kind: 'mistyped' };

/** A read код відновлення: the key it spells. */
export interface RecoveryCodeRead {
  readonly kind: 'ok';
  readonly key: Uint8Array;
}

/**
 * Where each character of the alphabet sits, plus the confusions Crockford folds on read. Built
 * once: a code is read a handful of times in the life of a phone, but building this per call would
 * be the kind of waste that is embarrassing rather than expensive.
 */
const VALUE_OF: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  for (const [index, character] of [...ALPHABET].entries()) {
    map.set(character, index);
  }
  // The three transcription mistakes worth surviving, and the only ones: a written `I` or `L` is a
  // `1`, and a written `O` is a `0`. Nothing else is guessed at — a wrong character stays wrong.
  map.set('I', 1);
  map.set('L', 1);
  map.set('O', 0);
  return map;
})();

/** Each half of the check is two characters, so it runs modulo 32² rather than modulo 32. */
const CHECK_MODULUS = ALPHABET.length * ALPHABET.length;

/**
 * The check over the **characters of the code**, as a Fletcher-style pair of running sums.
 *
 * Over the characters and not over the key's bytes, which is the difference between a check that
 * works and one that mostly does. A person mistypes a *character*; a substitution changes exactly
 * one symbol by 1…31, so `a` cannot come out unchanged and the mistake is always caught. Taken over
 * the bytes instead, two different codes can decode to the same key — the last character carries
 * one significant bit and four of padding — and a byte that shifts by a multiple of the modulus
 * slips past `a` entirely. Both were live defects in the first draft of this file.
 *
 * `b` accumulates `a`, so it is position-sensitive: swapping two adjacent characters leaves `a`
 * alone and moves `b`, which is the other mistake hand-copying makes.
 *
 * It is not a security check and is not asked to be one. The envelope's AEAD tag is what refuses a
 * wrong key; this only saves the owner from being told «не відкривається» after a download when
 * what they actually did was write a `V` where they meant a `W`.
 */
function checkValues(symbols: readonly number[]): readonly [number, number] {
  let a = 1;
  let b = 0;
  for (const symbol of symbols) {
    a = (a + symbol) % CHECK_MODULUS;
    b = (b + a) % CHECK_MODULUS;
  }
  return [a, b];
}

/** One check half as its two symbol values, most significant first. */
function checkSymbols(value: number): readonly [number, number] {
  return [Math.floor(value / ALPHABET.length), value % ALPHABET.length];
}

/** One check half as the two characters it is written with. */
function checkCharacters(value: number): string {
  const [high, low] = checkSymbols(value);
  return `${ALPHABET[high]}${ALPHABET[low]}`;
}

/**
 * A sealing key as the owner writes it down: eight groups of seven, separated by spaces.
 *
 * The grouping is presentation and the reader ignores it, so a code copied without the spaces, or
 * with hyphens instead, still reads back. What must not change is the order of the characters.
 */
export function encodeRecoveryCode(key: Uint8Array): string {
  if (key.length !== KEY_BYTES) {
    throw new RangeError(`a sealing key is ${KEY_BYTES} bytes, not ${key.length}`);
  }

  let bits = 0;
  let pending = 0;
  const symbols: number[] = [];
  for (const byte of key) {
    pending = (pending << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      symbols.push((pending >>> bits) & 0b11111);
    }
  }
  // 256 bits is not a multiple of 5: one bit is left over, and it becomes the last character's
  // high bit with four zeroes under it. `decodeRecoveryCode` drops them again.
  if (bits > 0) {
    symbols.push((pending << (5 - bits)) & 0b11111);
  }

  const [a, b] = checkValues(symbols);
  const body = symbols.map((symbol) => ALPHABET[symbol]).join('');
  return group(`${body}${checkCharacters(a)}${checkCharacters(b)}`);
}

/** The code as it is shown and copied: eight groups of seven, single-spaced. */
export function group(code: string): string {
  const groups: string[] = [];
  for (let at = 0; at < code.length; at += GROUP_SIZE) {
    groups.push(code.slice(at, at + GROUP_SIZE));
  }
  return groups.join(' ');
}

/**
 * A код відновлення as the owner typed it, back to the key it spells — or the reason it is not one.
 *
 * Spacing, hyphens and case are thrown away before anything is read, and `I`, `L` and `O` are read
 * as the digits they were meant to be. What survives that and still fails the check characters was
 * copied down wrong, and saying *that* — rather than «не відкривається» — is the whole point.
 */
export function decodeRecoveryCode(typed: string): RecoveryCodeRead | RecoveryCodeRefusal {
  const cleaned = typed.toUpperCase().replace(/[\s-]/g, '');
  if (cleaned.length !== CODE_LENGTH) {
    return { kind: 'malformed' };
  }

  const values: number[] = [];
  for (const character of cleaned) {
    const value = VALUE_OF.get(character);
    if (value === undefined) {
      return { kind: 'malformed' };
    }
    values.push(value);
  }

  const body = values.slice(0, KEY_CHARS);
  const [a, b] = checkValues(body);
  // Compared as symbol values rather than as text, so a check character the owner wrote as `O`
  // is read as the `0` it stands for, exactly as the body's characters are.
  const expected = [...checkSymbols(a), ...checkSymbols(b)];
  if (!expected.every((symbol, at) => values[KEY_CHARS + at] === symbol)) {
    // The shape was right and the content is not: a character was copied down wrong. Nothing has
    // been downloaded, nothing opened, nothing replaced — and the owner can simply type it again.
    return { kind: 'mistyped' };
  }

  let bits = 0;
  let pending = 0;
  const key = new Uint8Array(KEY_BYTES);
  let written = 0;
  for (const value of body) {
    pending = (pending << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      key[written] = (pending >>> bits) & 0xff;
      written += 1;
    }
  }
  return { kind: 'ok', key };
}
