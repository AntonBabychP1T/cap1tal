/**
 * The two pure functions a бекап's integrity value is built from: one serialisation that always
 * produces the same text for the same value, and a CRC-32 over it.
 *
 * The pairing is the point. The checksum covers a *canonical* serialisation of the бекап's body,
 * not the file's raw bytes, so it can be recomputed from the parsed бекап — which is what lets a
 * file survive being re-indented by whatever tool the owner passed it through, and what lets
 * `readBackup` verify a бекап it has already parsed rather than trusting the text twice
 * (design D4).
 *
 * CRC-32 detects damage — a truncated write, a corrupted byte, an edit — and nothing more. It is
 * not, and does not pretend to be, tamper-resistance: anyone who can edit an unencrypted бекап can
 * recompute any checksum in it. That guarantee belongs to step 12's encrypted envelope, and the
 * screen says so in the owner's words instead of implying otherwise.
 */

/**
 * One value as one string: object keys in sorted order, arrays in their own order, no
 * insignificant whitespace. Two values that differ only in the order their keys were built in
 * serialise identically, so the checksum says "these are the same contents" and not "these were
 * assembled the same way".
 *
 * `undefined` properties are dropped, exactly as `JSON.stringify` drops them — a бекап holds
 * absent optional fields as absent keys, never as `null`.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalise);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    // `localeCompare` would order by whatever locale the phone is in; keys are ASCII identifiers
    // and their order has to be the same on every device that ever reads this file.
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) {
        sorted[key] = canonicalise(entry);
      }
    }
    return sorted;
  }
  return value;
}

/** The standard CRC-32 (IEEE 802.3) table, built once on first use. */
const TABLE: readonly number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c >>> 0);
  }
  return table;
})();

/**
 * CRC-32 of the text's UTF-8 bytes, as eight lowercase hex digits — the width is fixed so two
 * checksums are compared as strings and a leading zero can never go missing.
 */
export function crc32(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ (TABLE[(crc ^ byte) & 0xff] ?? 0);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}
