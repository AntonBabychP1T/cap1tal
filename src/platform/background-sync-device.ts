import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { BackgroundRestriction, BackgroundSyncPort } from './background-sync';

/**
 * `BackgroundSyncPort` over the local module's `BackgroundSync` (modules/notification-capture,
 * monobank-sync-freshness design D5–D7). Never imported by a test.
 *
 * Android only, and optional even there: a build without the module — an older dev client, or iOS —
 * answers every call with nothing, which is a phone that syncs on the periodic chances and on
 * opening, exactly as before. Nothing here throws: the ports' own rule.
 */
interface NativeBackgroundSync {
  /** An `AsyncFunction` natively: asking WorkManager what is pending blocks. */
  continueLater(delayMs: number): Promise<boolean>;
  nudgedAtMs(): number | null;
  setNudgesWanted(wanted: boolean): void;
  restriction(): string;
  openRestrictionFix(restriction: string): Promise<void>;
}

function native(): NativeBackgroundSync | undefined {
  if (Platform.OS !== 'android') {
    return undefined;
  }
  try {
    return requireOptionalNativeModule<NativeBackgroundSync>('BackgroundSync') ?? undefined;
  } catch {
    return undefined;
  }
}

const READINGS: readonly BackgroundRestriction[] = ['allowed', 'optimised', 'restricted'];

export const backgroundSync: BackgroundSyncPort = {
  continueLater(delayMs) {
    try {
      // Fire-and-forget, and never an unhandled rejection: a phone that will not schedule one
      // continues on its next chance.
      native()
        ?.continueLater(Math.max(0, Math.round(delayMs)))
        .catch(() => undefined);
    } catch {
      // The same, for a module that throws before it answers.
    }
  },
  nudgedAtMs() {
    try {
      const at = native()?.nudgedAtMs();
      return typeof at === 'number' && Number.isFinite(at) ? at : undefined;
    } catch {
      return undefined;
    }
  },
  setNudgesWanted(wanted) {
    try {
      native()?.setNudgesWanted(wanted);
    } catch {
      // Re-asserted on every foreground; the next one tries again.
    }
  },
  restriction() {
    try {
      const reading = native()?.restriction();
      return READINGS.find((known) => known === reading) ?? 'unknown';
    } catch {
      return 'unknown';
    }
  },
  async openRestrictionFix(restriction) {
    try {
      await native()?.openRestrictionFix(restriction);
    } catch {
      // The screen re-reads the phone on return; nothing opened is nothing changed.
    }
  },
};
