import { describe, expect, it } from 'vitest';

import { canonicalJson, crc32 } from './canonical';

describe('the checksum a бекап carries', () => {
  it('is the standard CRC-32', () => {
    // The known vector every CRC-32 implementation is checked against. If this ever changes, a
    // бекап written by an older build stops verifying — which is exactly what it should catch.
    expect(crc32('123456789')).toBe('cbf43926');
  });

  it('is eight hex digits even when the value starts with a zero', () => {
    // Fixed width, because two checksums are compared as strings: a lost leading zero would make
    // an intact бекап read as damaged.
    for (const text of ['', 'a', 'бекап', '{"accounts":[]}']) {
      expect(crc32(text)).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('changes when a single character of the body changes', () => {
    expect(crc32('{"amount":1000}')).not.toBe(crc32('{"amount":1001}'));
  });
});

describe('the canonical serialisation the checksum covers', () => {
  it('does not depend on the order the keys were built in', () => {
    const built = { currency: 'UAH', amount: 12_000 };
    const other: Record<string, unknown> = {};
    other.amount = 12_000;
    other.currency = 'UAH';

    expect(canonicalJson(built)).toBe(canonicalJson(other));
    expect(canonicalJson(built)).toBe('{"amount":12000,"currency":"UAH"}');
  });

  it('keeps arrays in their own order — that order is data', () => {
    expect(canonicalJson(['b', 'a'])).toBe('["b","a"]');
    expect(canonicalJson(['b', 'a'])).not.toBe(canonicalJson(['a', 'b']));
  });

  it('sorts keys at every depth, not only the top one', () => {
    expect(canonicalJson({ b: { d: 1, c: 2 }, a: [{ f: 3, e: 4 }] })).toBe(
      '{"a":[{"e":4,"f":3}],"b":{"c":2,"d":1}}',
    );
  });

  it('drops an absent optional field rather than writing it as null', () => {
    // A правило with no MCC and a правило whose MCC was cleared are the same правило; storing
    // `null` would make the бекап say otherwise.
    expect(canonicalJson({ merchant: 'сільпо', mcc: undefined })).toBe('{"merchant":"сільпо"}');
  });

  it('survives a бекап being re-indented, because it is recomputed from the parsed value', () => {
    const body = { accounts: [{ id: 'a1', name: 'Картка' }], transactions: [] };
    const checksum = crc32(canonicalJson(body));

    // The owner passed the file through something that pretty-printed it — different bytes, and
    // even a different key order, but the same contents.
    const reindented = JSON.stringify(
      { transactions: [], accounts: [{ name: 'Картка', id: 'a1' }] },
      null,
      2,
    );

    expect(crc32(canonicalJson(JSON.parse(reindented)))).toBe(checksum);
    // And a checksum over the raw text would not have survived it — which is why it is not.
    expect(crc32(reindented)).not.toBe(checksum);
  });
});
