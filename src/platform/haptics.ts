/**
 * The seam between the app and the phone's haptics (motion, "An outcome the owner caused is felt
 * once"; app-motion-pass design D13). Only the system's own three effects, by what they mean, never
 * a pattern of the app's own. The port and its test double only — the adapter is
 * `haptics-device.ts`, never imported from here or from a test.
 */
export type HapticEffect = 'confirm' | 'reject' | 'tick';

export interface HapticsPort {
  /** Plays one effect, fire-and-forget: never awaited, never an error the owner sees. */
  play(effect: HapticEffect): void;
}

/** The haptics the tests use: it plays nothing and lists what it was asked to play, in order. */
export function recordingHaptics(): HapticsPort & { readonly played: readonly HapticEffect[] } {
  const played: HapticEffect[] = [];
  return {
    play(effect) {
      played.push(effect);
    },
    played,
  };
}
