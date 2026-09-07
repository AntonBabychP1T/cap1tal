import { BACKUP_SCHEMA_VERSION } from '../format';
import { isRefusal, readBackup, type BackupHeader } from '../backup';
import { isEnvelopeRefusal, openEnvelope, type EnvelopeRefusal, type EnvelopeHead } from './envelope';

/**
 * Whether a версія бекапу may be restored — the rule, as a pure function, and the only path to a
 * confirmable restore.
 *
 * The order is the point and it is the spec's: **opens → its own integrity check holds → the
 * schema is one this app understands → and then, and only then, is it confirmable.** Nothing local
 * is read or written anywhere in this file. What it returns is either the preview the section
 * shows — with the бекап already read, so confirming restores exactly what the owner was shown —
 * or a named refusal that leaves the phone exactly as it was.
 *
 * Two of the refusals can be reached without the key at all, from the 512-byte head: a версія from
 * a newer app, and a версія of another line. Both are answered before the owner is asked for a код
 * відновлення and before a whole бекап is fetched, which is what design D6's plaintext head is for.
 */

/** Why a версія бекапу may not be restored. Every one leaves the phone untouched. */
export type RestoreRefusal =
  /** The envelope itself: not ours, damaged, from a later envelope format, or it will not open. */
  | EnvelopeRefusal
  /** Sealed under a key this phone does not hold — a different код відновлення, not a typo. */
  | { readonly kind: 'another-line'; readonly keyId: string }
  /** It opened, and the бекап inside was written by a newer app than this one. */
  | { readonly kind: 'newer-schema'; readonly schemaVersion: number; readonly supported: number }
  /** It opened, and the бекап inside is damaged, not a бекап, or contradicts itself. */
  | { readonly kind: 'unreadable-backup'; readonly why: string };

/** A версія бекапу found admissible: what it is, ready to be named and then applied. */
export interface RestoreCandidate {
  readonly kind: 'ok';
  /** When the бекап was made, from the бекап itself — the date the confirmation names. */
  readonly createdAt: Date;
  /**
   * The бекап already read and already found sound. Confirming hands **this** to step 11's
   * `applyRestore`, so the file is never parsed a second time and what is restored cannot differ
   * from what the preview described.
   */
  readonly backup: BackupHeader;
}

/**
 * Whether this phone can even try a версія, from its head alone — no key, no body, no network past
 * the 512 bytes already fetched.
 *
 * `undefined` means "nothing stands in the way yet"; the answer proper needs the key.
 */
export function refusalFromHead(input: {
  readonly head: EnvelopeHead;
  readonly keyId?: string;
  readonly supportedSchema?: number;
}): RestoreRefusal | undefined {
  const supported = input.supportedSchema ?? BACKUP_SCHEMA_VERSION;
  if (input.head.schemaVersion > supported) {
    // Refused before a код відновлення is asked for: the owner needs to update the app, and asking
    // them to find a code first would waste the one thing they may not have.
    return { kind: 'newer-schema', schemaVersion: input.head.schemaVersion, supported };
  }
  if (input.keyId !== undefined && input.head.keyId !== input.keyId) {
    // Design D14: this версія belongs to another код відновлення. Saying «код неправильний» here
    // would send the owner to check a code that is perfectly correct for a different line.
    return { kind: 'another-line', keyId: input.head.keyId };
  }
  return undefined;
}

/**
 * One версія бекапу, opened and judged — or the reason it may not be restored.
 *
 * The steps in the spec's order, each one refusing before the next is attempted, so a бекап that
 * fails at any of them has had nothing on the phone touched by the attempt.
 */
export function admitVersion(input: {
  readonly bytes: Uint8Array;
  readonly key: Uint8Array;
  readonly supportedSchema?: number;
}): RestoreCandidate | RestoreRefusal {
  // 1. It opens. The AEAD tag is what proves the head was not edited and the bytes not altered.
  const opened = openEnvelope(input.bytes, input.key);
  if (isEnvelopeRefusal(opened)) {
    return opened;
  }

  // 2. The schema is one this app understands — asked again over the head the cipher authenticated,
  //    not only over the plaintext one a listing read, because that one was merely a claim.
  const supported = input.supportedSchema ?? BACKUP_SCHEMA_VERSION;
  if (opened.head.schemaVersion > supported) {
    return { kind: 'newer-schema', schemaVersion: opened.head.schemaVersion, supported };
  }

  // 3. The бекап's own integrity check and its own consistency — step 11's, not this change's.
  const read = readBackup(opened.bytes);
  if (isRefusal(read)) {
    return { kind: 'unreadable-backup', why: read.kind };
  }

  // 4. And only now is it confirmable, carrying the бекап it was judged on.
  return { kind: 'ok', createdAt: read.createdAt, backup: read };
}

/** Whether admitting a версія produced a candidate or a reason it may not be restored. */
export function isRestoreRefusal(
  answer: RestoreCandidate | RestoreRefusal,
): answer is RestoreRefusal {
  return answer.kind !== 'ok';
}
