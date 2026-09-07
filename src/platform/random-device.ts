import * as Crypto from 'expo-crypto';

import type { RandomPort } from './random';

/**
 * The device's own CSPRNG, through `expo-crypto` — the source of the sealing key and of every
 * envelope's nonce, and therefore of the whole security of what sits in the owner's Drive.
 *
 * `getRandomBytes` is the synchronous form; on Android it is backed by the platform's secure
 * random. There is no fallback and there deliberately is none: a `Math.random` here would be this
 * change's worst defect and the hardest to see, so the only other implementation of this port is
 * `fixedRandom`, which lives in `random.ts` and is a counter that no device code can reach.
 *
 * This file is never imported by a test — that is what `src/platform/backup-key.test.ts`'s
 * source-hygiene check asserts, and what keeps `verify` free of a native module.
 */
export const deviceRandom: RandomPort = {
  bytes(count: number): Uint8Array {
    return Crypto.getRandomBytes(count);
  },
};
