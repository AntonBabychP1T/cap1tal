import { hapticsPreference } from '@/db/repos';
import type { HapticEffect } from '@/platform/haptics';
import { deviceHaptics } from '@/platform/haptics-device';
import { hapticFor, strongestHaptic, type HapticEvent } from '@/ui/haptics';

/**
 * The haptics a screen plays, bound to this phone (app-motion-pass design D13, D14). The only file
 * that loads the adapter: every decision is `src/ui/haptics.ts`'s, and the «Вібрація» switch is read
 * through its repository on every event, so a change — the switch, or a restored бекап — governs
 * the very next one.
 *
 * It sits in `src/hooks/` for `monobank-ports.ts`'s reason: it reaches for a platform adapter,
 * which nothing under `verify` may load. Background work never imports it (`motion-usage.test.ts`).
 */

/** The effects raised by the owner action now running, played once it has finished. */
let raised: HapticEffect[] = [];

/**
 * Plays what `event` means, once per owner action: everything one tap raises is collected until the
 * end of the JS task it runs in, and only the strongest plays (`strongestHaptic`) — a chip that
 * ticks while the same tap stores a категорія gives way to the store's confirm.
 */
function play(event: HapticEvent): void {
  const effect = hapticFor(event, { enabled: hapticsPreference.enabled() });
  if (effect === null) return;
  raised.push(effect);
  if (raised.length > 1) return;
  queueMicrotask(() => {
    const strongest = strongestHaptic(raised);
    raised = [];
    if (strongest) deviceHaptics.play(strongest);
  });
}

/** One object for the whole app, so a screen's callbacks can list it without being re-made. */
const HAPTICS = { play } as const;

export function useHaptics(): { readonly play: (event: HapticEvent) => void } {
  return HAPTICS;
}
