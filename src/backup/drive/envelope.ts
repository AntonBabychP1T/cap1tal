import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

/**
 * The sealed envelope a бекап travels inside on its way to the owner's Google Drive — and the one
 * part of this change that must never be wrong, which is why it is a pure function over bytes and
 * proven in Node rather than on a device (design D5).
 *
 * The shape is deliberate (design D6). A plaintext head names what this is and what is inside it,
 * a 24-byte random nonce follows, and the ciphertext follows that:
 *
 * ```
 * cap1tal-drive\n
 * {"envelopeVersion":1,"schemaVersion":19,"createdAt":"…","keyId":"…"}\n
 * <24 bytes of nonce><ciphertext with its authentication tag>
 * ```
 *
 * The head is plaintext so that «Відновити» can read a версія бекапу's date and refuse one from a
 * newer app *before* the owner is asked for a код відновлення and before a whole body is fetched —
 * the head is a prefix, so a range read of a few hundred bytes answers it. And the head is passed
 * to the cipher as associated data, so a head edited in Drive to say a different date or a lower
 * schema version makes the envelope fail to open rather than open under a lie. Reading the head
 * without the key is therefore a claim; opening is what proves it.
 *
 * The envelope's own version is separate from the бекап's schema version on purpose: changing the
 * cipher later must not look like a database migration.
 *
 * The бекап's own checksum is deliberately *not* here. Nothing a listing decides needs it — the
 * date, the schema version and the key are enough — the phone keeps the last uploaded one in its
 * own table, and `readBackup` re-verifies the real thing once the envelope has opened. In the head
 * it would be a 32-bit fingerprint of the owner's whole state, readable by anyone holding the
 * folder: enough to tell that two версії are identical, or that a phone's state matches a guessed
 * one. It costs nothing to leave out (design D6).
 *
 * `keyId` is what makes design D14 decidable: a phone can see, from the head alone, which версії
 * бекапу its key opens. That is what lets «Відновити» say «this one belongs to another код
 * відновлення» instead of «you typed it wrong», and what stops rotation from deleting a версія no
 * key on this phone can open.
 *
 * Nothing here knows what a бекап holds. It takes the bytes `src/backup/backup.ts` produced and
 * gives them back unchanged, or refuses — no рахунок, no сума and no транзакція is readable in
 * this file, which is the property the whole change exists to keep.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The byte a line of the head ends on. Written once so sealing and reading cannot disagree. */
const NEWLINE = 0x0a;

/** What the file says it is, before anything else. One line, so a prefix read finds it. */
export const ENVELOPE_MAGIC = 'cap1tal-drive';

/** This envelope's own format. Bumped when the cipher or the layout changes, never for a schema. */
export const ENVELOPE_VERSION = 1;

/** XChaCha20-Poly1305's nonce: 24 random bytes per envelope, so no counter has to be persisted. */
export const NONCE_BYTES = 24;

/** The sealing key: 32 bytes, made once at connect and written down as the код відновлення. */
export const KEY_BYTES = 32;

/**
 * How much of a версія бекапу has to be fetched to read its head.
 *
 * The head is the magic line plus one line of JSON naming four short values; 512 bytes is several
 * times what that can come to, and it is what a range read asks Drive for. A head that is not
 * complete within it is a file this app did not write.
 */
export const ENVELOPE_HEAD_MAX_BYTES = 512;

/**
 * The nonce the key fingerprint is taken at, and which no sealed бекап may ever use.
 *
 * Reserved rather than random: a fingerprint has to be the same every time or it names nothing.
 * Publishing keystream at one fixed nonce is safe precisely because that nonce is never used to
 * seal anything — and a real 24-byte random nonce landing on this value is a 2⁻¹⁹² event.
 */
const KEY_ID_NONCE = new Uint8Array([
  0x63, 0x61, 0x70, 0x31, 0x74, 0x61, 0x6c, 0x2d, 0x6b, 0x65, 0x79, 0x2d, 0x69, 0x64, 0x2d, 0x76,
  0x31, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/**
 * Passed as the fingerprint's associated data. It labels the operation for a reader of the code
 * and it binds the tag, which is discarded — it does **not** separate the keystream, because
 * ChaCha20's keystream depends on the key and nonce alone. What actually keeps this output apart
 * from any sealed бекап is `KEY_ID_NONCE`, which `sealEnvelope` refuses.
 */
const KEY_ID_LABEL = 'cap1tal-drive:key-id:v1';

/** How many bytes of the fingerprint are kept: 8, written as 16 hex characters. */
const KEY_ID_BYTES = 8;

/**
 * Which key sealed this — a name for a key that gives nothing of the key away.
 *
 * Eight bytes of keystream under the key at `KEY_ID_NONCE`, as hex. ChaCha20 is a pseudo-random
 * function, so these bytes say nothing about the key that produced them; and because the nonce is
 * reserved and never seals a бекап, publishing keystream at it costs nothing either. Deterministic,
 * so the same key always names itself the same way (design D14).
 */
export function keyId(key: Uint8Array): string {
  if (key.length !== KEY_BYTES) {
    throw new RangeError(`a sealing key is ${KEY_BYTES} bytes, not ${key.length}`);
  }
  const stream = xchacha20poly1305(key, KEY_ID_NONCE, encoder.encode(KEY_ID_LABEL)).encrypt(
    new Uint8Array(KEY_ID_BYTES),
  );
  return Array.from(stream.subarray(0, KEY_ID_BYTES), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** What the plaintext head of a версія бекапу claims about the бекап sealed behind it. */
export interface EnvelopeHead {
  readonly envelopeVersion: number;
  /** The бекап's own storage-shape version — what decides whether this app can restore it. */
  readonly schemaVersion: number;
  /** When the бекап was made, as `makeBackup` recorded it. */
  readonly createdAt: Date;
  /** Which sealing key it was sealed under, as `keyId` names one (design D14). */
  readonly keyId: string;
}

/**
 * Why an envelope could not be read or opened. Every one of them leaves the phone untouched and
 * every one is a sentence the section shows — never an exception to catch (`src/ui/drive-backup.ts`
 * is where each becomes Ukrainian).
 *
 * `will-not-open` is deliberately one answer and not two. An authenticated cipher cannot tell a
 * wrong key from altered bytes — both are simply a tag that does not verify — so claiming to know
 * which would be an invention. The sentence the owner reads names both possibilities.
 */
export type EnvelopeRefusal =
  | { readonly kind: 'not-an-envelope' }
  | { readonly kind: 'damaged' }
  | { readonly kind: 'newer-envelope'; readonly envelopeVersion: number; readonly supported: number }
  | { readonly kind: 'will-not-open' };

/** Whether reading or opening produced an answer or a reason it could not. */
export function isEnvelopeRefusal<T extends object>(
  read: T | EnvelopeRefusal,
): read is EnvelopeRefusal {
  return 'kind' in read && (read as { kind: unknown }).kind !== 'ok';
}

/** What `readEnvelopeHead` answers with when the head is there and readable. */
export interface EnvelopeHeadRead extends EnvelopeHead {
  readonly kind: 'ok';
  /** Where the nonce begins — the length of the plaintext head, in bytes. */
  readonly headLength: number;
}

/** What `openEnvelope` answers with: the бекап's own bytes, exactly as they were sealed. */
export interface EnvelopeOpened {
  readonly kind: 'ok';
  /** The бекап file's text — what `readBackup` takes, unchanged and unjudged. */
  readonly bytes: string;
  readonly head: EnvelopeHead;
}

/**
 * One бекап, sealed.
 *
 * The head is built from what the бекап says about itself, never from a clock or a device: two
 * seals of the same бекап under the same key and nonce are the same bytes, which is what makes
 * «an unchanged бекап is not uploaded again» decidable without opening anything.
 */
export function sealEnvelope(input: {
  readonly bytes: string;
  readonly schemaVersion: number;
  readonly createdAt: Date;
  readonly key: Uint8Array;
  readonly nonce: Uint8Array;
}): Uint8Array {
  if (input.key.length !== KEY_BYTES) {
    throw new RangeError(`a sealing key is ${KEY_BYTES} bytes, not ${input.key.length}`);
  }
  if (input.nonce.length !== NONCE_BYTES) {
    throw new RangeError(`a nonce is ${NONCE_BYTES} bytes, not ${input.nonce.length}`);
  }
  if (input.nonce.every((byte, at) => byte === KEY_ID_NONCE[at])) {
    // The one nonce that is reserved. Sealing at it would publish keystream that `keyId` also
    // publishes, which is the single assumption the fingerprint's safety rests on. A CSPRNG will
    // never produce it (2⁻¹⁹²); a caller passing a fixed nonce might, and that is a bug.
    throw new RangeError('the key-fingerprint nonce may not seal a бекап');
  }

  const head = encoder.encode(
    `${ENVELOPE_MAGIC}\n${JSON.stringify({
      envelopeVersion: ENVELOPE_VERSION,
      schemaVersion: input.schemaVersion,
      createdAt: input.createdAt.toISOString(),
      keyId: keyId(input.key),
    })}\n`,
  );
  // The head is the associated data and is not encrypted: it is what a listing reads, and what a
  // tampered file fails on.
  const sealed = xchacha20poly1305(input.key, input.nonce, head).encrypt(encoder.encode(input.bytes));

  const file = new Uint8Array(head.length + NONCE_BYTES + sealed.length);
  file.set(head, 0);
  file.set(input.nonce, head.length);
  file.set(sealed, head.length + NONCE_BYTES);
  return file;
}

/**
 * What the head of a версія бекапу claims, read without the key — the whole point of the head
 * being plaintext.
 *
 * `bytes` may be a prefix: a range read of `ENVELOPE_HEAD_MAX_BYTES` is enough, and is what
 * listing the версії бекапу actually fetches. Nothing read here is trusted further than a
 * preview — `openEnvelope` is what proves the head was not edited.
 */
export function readEnvelopeHead(bytes: Uint8Array): EnvelopeHeadRead | EnvelopeRefusal {
  const magicEnd = bytes.indexOf(NEWLINE);
  const magic = magicEnd === -1 ? undefined : decoder.decode(bytes.subarray(0, magicEnd));
  if (magic !== ENVELOPE_MAGIC) {
    // Not this app's file at all — a photo, someone else's upload, an empty body.
    return { kind: 'not-an-envelope' };
  }

  const jsonEnd = bytes.indexOf(NEWLINE, magicEnd + 1);
  if (jsonEnd === -1) {
    // The magic is there, so it began as one of ours and was cut short or scribbled on.
    return { kind: 'damaged' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes.subarray(magicEnd + 1, jsonEnd)));
  } catch {
    return { kind: 'damaged' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { kind: 'damaged' };
  }

  const claim = parsed as Record<string, unknown>;
  const envelopeVersion = claim.envelopeVersion;
  if (!Number.isSafeInteger(envelopeVersion)) {
    return { kind: 'damaged' };
  }

  // The version is read first and on its own, before any other field is even looked at: a later
  // format may carry fields this build has never heard of and drop ones it expects, so judging its
  // shape by today's rules would report a damaged file where the honest answer is «update the
  // app». Saying it needs no key and no body.
  if ((envelopeVersion as number) > ENVELOPE_VERSION) {
    return {
      kind: 'newer-envelope',
      envelopeVersion: envelopeVersion as number,
      supported: ENVELOPE_VERSION,
    };
  }

  const schemaVersion = claim.schemaVersion;
  const createdAt = claim.createdAt;
  const sealedBy = claim.keyId;
  if (
    !Number.isSafeInteger(schemaVersion) ||
    typeof createdAt !== 'string' ||
    typeof sealedBy !== 'string'
  ) {
    return { kind: 'damaged' };
  }
  const made = new Date(createdAt);
  if (Number.isNaN(made.getTime())) {
    return { kind: 'damaged' };
  }

  return {
    kind: 'ok',
    envelopeVersion: envelopeVersion as number,
    schemaVersion: schemaVersion as number,
    createdAt: made,
    keyId: sealedBy,
    headLength: jsonEnd + 1,
  };
}

/**
 * One версія бекапу, opened — or the reason it will not open, with nothing on the phone touched.
 *
 * `bytes` must be the whole file here: the head told the preview what this claims to be, and this
 * is where that claim is either proven by the cipher or refused.
 */
export function openEnvelope(
  bytes: Uint8Array,
  key: Uint8Array,
): EnvelopeOpened | EnvelopeRefusal {
  const head = readEnvelopeHead(bytes);
  if (isEnvelopeRefusal(head)) {
    return head;
  }
  if (key.length !== KEY_BYTES) {
    // A key of the wrong size opens nothing; refusing here keeps the cipher from throwing.
    return { kind: 'will-not-open' };
  }

  const nonce = bytes.subarray(head.headLength, head.headLength + NONCE_BYTES);
  if (nonce.length !== NONCE_BYTES) {
    return { kind: 'damaged' };
  }
  const sealed = bytes.subarray(head.headLength + NONCE_BYTES);

  let opened: Uint8Array;
  try {
    opened = xchacha20poly1305(key, nonce, bytes.subarray(0, head.headLength)).decrypt(sealed);
  } catch {
    // A tag that does not verify: the wrong key, or bytes that were altered anywhere — in the
    // ciphertext, in the nonce, or in the head the cipher was given as associated data.
    return { kind: 'will-not-open' };
  }

  return {
    kind: 'ok',
    bytes: decoder.decode(opened),
    head: {
      envelopeVersion: head.envelopeVersion,
      schemaVersion: head.schemaVersion,
      createdAt: head.createdAt,
      keyId: head.keyId,
    },
  };
}
