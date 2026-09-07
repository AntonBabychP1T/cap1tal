import { ENVELOPE_HEAD_MAX_BYTES, isEnvelopeRefusal, readEnvelopeHead } from './envelope';

/**
 * Which версії бекапу may be removed once a newer one is safely up (design D10, D14).
 *
 * The whole rule, as a pure function over what the folder holds. Two things it must never do, and
 * both are the reason it is a function rather than a few lines inside the upload:
 *
 * - **Nothing is deletable until a newer complete version exists.** The list it is given is the
 *   folder *after* the upload was confirmed, so the newest is always the one just written; a
 *   failed upload never reaches here at all, and the folder is untouched.
 * - **Nothing sealed under another key is deletable, ever.** A phone that started a fresh line
 *   (design D14) cannot open the версії of the old one — and pruning by age alone would delete,
 *   within five days, every версія the old код відновлення still opens. That is the loss this
 *   whole change exists to prevent, so the filter is by key first and by age second.
 */

/** How many версії бекапу of the current line are kept. The spec says "several most recent". */
export const VERSIONS_KEPT = 5;

/** One версія as the folder shows it, with what its head says — read without any key. */
export interface KnownVersion {
  readonly id: string;
  readonly name: string;
  /** Which sealing key it was sealed under, or absent when the head could not be read. */
  readonly keyId?: string;
  /** When the бекап inside it was made, from its own head — never from the file name. */
  readonly createdAt?: Date;
}

/**
 * What a listing's files and their heads amount to, as versions this app understands.
 *
 * A file whose head will not read keeps its place in the list with no `keyId` and no date: it is
 * something this app did not write, or wrote and something later damaged, and either way it is not
 * ours to delete. Dropping it from the list would make it invisible to the rule above.
 */
export function versionsOf(
  files: readonly { readonly id: string; readonly name: string; readonly head: Uint8Array }[],
): readonly KnownVersion[] {
  return files.map((file) => {
    const head = readEnvelopeHead(file.head.subarray(0, ENVELOPE_HEAD_MAX_BYTES));
    if (isEnvelopeRefusal(head)) {
      return { id: file.id, name: file.name };
    }
    return { id: file.id, name: file.name, keyId: head.keyId, createdAt: head.createdAt };
  });
}

/**
 * The версії бекапу to delete, given everything in the folder and the key the app seals under now.
 *
 * Ordered newest first by the moment each бекап was made — from the authenticated head and not from
 * the file name, so a file someone renamed cannot change which one is kept. Versions with no
 * readable date fall to the end of their line's order, which is where a file that cannot be read
 * belongs; they are never in another line's, because they have no key to be in one.
 */
export function versionsToPrune(input: {
  readonly versions: readonly KnownVersion[];
  /** The line the app is currently uploading to — nothing outside it is ever a candidate. */
  readonly keyId: string;
  readonly keep?: number;
}): readonly KnownVersion[] {
  const keep = input.keep ?? VERSIONS_KEPT;

  const mine = input.versions.filter((version) => version.keyId === input.keyId);
  const newestFirst = [...mine].sort((a, b) => {
    const at = a.createdAt?.getTime();
    const bt = b.createdAt?.getTime();
    if (at === undefined && bt === undefined) return 0;
    // A версія whose date will not read sorts last, so it is pruned before a dated one — but only
    // ever after the newest `keep` dated ones are safe.
    if (at === undefined) return 1;
    if (bt === undefined) return -1;
    return bt - at;
  });

  return newestFirst.slice(keep);
}
