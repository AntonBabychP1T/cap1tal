/**
 * The seam between the app and wherever the owner keeps a бекап: one file goes out, one file comes
 * back. The port and its double only — the device adapter is `backup-file-device.ts`, and it is
 * not imported from here.
 *
 * That separation is the one `monobank-token.ts` and `notification-capture.ts` keep, for the same
 * reason: nothing under `npm run verify` may load a native module, so the port lives in a file no
 * platform code touches and everything decided about a бекап is decided against the double in
 * `src/ui/backup-screen.ts`'s tests.
 *
 * Failures are values here too. A folder the owner did not choose, a build with nowhere to write,
 * a file that will not read — each is an answer the screen shows in the owner's own words, never
 * an exception to catch. In particular `cancelled` is its own answer and not a quiet success: the
 * screen may claim a бекап was saved only where one actually was (design D8).
 */

/**
 * What handing a бекап to the system can come to.
 *
 * `cancelled` is the owner dismissing the destination chooser — nothing was written and nothing
 * is claimed. `unavailable` is a platform with no such place to write at all; `failed` is one that
 * tried and could not, and it carries what to say about it.
 */
export type BackupSaveOutcome =
  | { readonly kind: 'ok' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly reason: string };

/**
 * What picking a бекап can come to. `unreadable` is a file the device would not hand over — not a
 * judgement about its contents, which is `readBackup`'s and no one else's.
 */
export type BackupPickOutcome =
  | { readonly kind: 'ok'; readonly text: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'unreadable'; readonly reason: string };

export interface BackupFilePort {
  /**
   * Hands one бекап to the system under `name`, so the owner chooses where it goes. The whole file
   * as one string: a бекап of the vision's own history is about a megabyte (design D10).
   */
  save(name: string, text: string): Promise<BackupSaveOutcome>;
  /** Lets the owner pick a file and hands back its text, unread and unjudged. */
  pick(): Promise<BackupPickOutcome>;
}

/**
 * The port the tests use, and the only implementation `verify` ever loads.
 *
 * `picked` is what the owner would choose; leaving it out is an owner who backs out of the picker.
 * `saveOutcome` and `pickOutcome` make the double answer as an unwilling device would, and `saved`
 * is what actually left — so «backing out claims nothing» is provable rather than assumed.
 */
export function inMemoryBackupFiles(
  options: {
    readonly picked?: string;
    readonly saveOutcome?: BackupSaveOutcome;
    readonly pickOutcome?: Exclude<BackupPickOutcome, { kind: 'ok' }>;
  } = {},
): BackupFilePort & {
  /** Every file that was actually handed over, in order — empty after a refusal or a dismissal. */
  readonly saved: () => readonly { readonly name: string; readonly text: string }[];
} {
  const saved: { name: string; text: string }[] = [];

  return {
    save: async (name: string, text: string) => {
      const outcome = options.saveOutcome ?? { kind: 'ok' };
      if (outcome.kind === 'ok') {
        saved.push({ name, text });
      }
      return outcome;
    },

    pick: async () => {
      if (options.pickOutcome) {
        return options.pickOutcome;
      }
      // No file to hand over means the owner dismissed the picker — the honest default.
      return options.picked === undefined
        ? { kind: 'cancelled' }
        : { kind: 'ok', text: options.picked };
    },

    saved: () => saved,
  };
}
