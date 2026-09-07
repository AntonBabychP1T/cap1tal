/**
 * The seam between the app and the device's source of randomness. The port and its test double
 * only — the adapter is `random-device.ts` (native, backed by `expo-crypto`), and it is not
 * imported from here.
 *
 * Two things in this change must be unguessable and are made here: the sealing key of the версії
 * бекапу (32 bytes, once, at connect) and the nonce of every envelope (24 bytes, every upload).
 * Both are the whole security of the бекап in Drive, so this port exists for exactly one reason
 * beyond the usual: **so that a test can inject fixed bytes and the sealing be proven, while the
 * app can never accidentally seal anything under a value a test invented.** A `Math.random` in this
 * position would be the change's worst possible defect and the hardest to notice; keeping the real
 * CSPRNG behind a port that `verify` never loads is what makes its absence from the test tree an
 * assertion rather than a hope.
 *
 * Unlike the two secret stores, this port cannot answer `unavailable`. A device with no CSPRNG is
 * not a state to show the owner — it is a platform the app cannot run on at all — and every adapter
 * `expo-crypto` supports has one.
 */

export interface RandomPort {
  /** `count` unguessable bytes. */
  bytes(count: number): Uint8Array;
}

/**
 * The randomness the tests use, and the only implementation `verify` ever loads.
 *
 * It is a counter, not a generator, and that is the point: it is trivially predictable, so a test
 * says exactly which key and which nonce it is working with, and nothing that reaches the device
 * can be tempted to use it. `from` sets where the counter starts, so two doubles in one test
 * produce different bytes.
 */
export function fixedRandom(options: { readonly from?: number } = {}): RandomPort {
  let next = options.from ?? 0;
  return {
    bytes(count: number): Uint8Array {
      return Uint8Array.from({ length: count }, () => {
        const byte = next & 0xff;
        next += 1;
        return byte;
      });
    },
  };
}

/** The same bytes every time, for a test that wants a key it can name in an assertion. */
export function constantRandom(fill: number): RandomPort {
  return { bytes: (count: number) => new Uint8Array(count).fill(fill) };
}
