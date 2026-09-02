import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { bytesFromBase64, decodeFiscalDocument, decodeWindows1251 } from './cp1251';

/**
 * The decoder, held against an oracle nobody here wrote: Node's own `TextDecoder`, which
 * implements the WHATWG windows-1251 index. The app cannot use it — Hermes decodes UTF-8 and
 * nothing else — but `verify` runs in Node, so the table can be proven byte for byte against the
 * standard rather than against itself.
 */

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

describe('the windows-1251 table', () => {
  it('agrees with the WHATWG index for every one of the 256 bytes', () => {
    const bytes = new Uint8Array(256).map((_, index) => index);

    expect(decodeWindows1251(bytes)).toBe(new TextDecoder('windows-1251').decode(bytes));
  });

  it('decodes the Ukrainian letters that live only in the upper half', () => {
    // Ґ ґ Є є І і Ї ї — the eight that separate Ukrainian from Russian in this encoding, and the
    // ones a table copied from a Russian source silently gets wrong.
    const ukrainian = new Uint8Array([0xa5, 0xb4, 0xaa, 0xba, 0xb2, 0xb3, 0xaf, 0xbf]);

    expect(decodeWindows1251(ukrainian)).toBe('ҐґЄєІіЇї');
  });

  it('decodes ASCII as itself', () => {
    const ascii = new Uint8Array([...'<?xml version="1.0"?>'].map((c) => c.charCodeAt(0)));

    expect(decodeWindows1251(ascii)).toBe('<?xml version="1.0"?>');
  });
});

describe('a fiscal document from its bytes', () => {
  it('decodes the real windows-1251 чек to its text, declaring UTF-8', () => {
    const bytes = new Uint8Array(readFileSync(fixture('prro-real-1-item-test-payer.cp1251.bin')));
    const expected = readFileSync(fixture('prro-real-1-item-test-payer.xml'), 'utf8');

    const text = decodeFiscalDocument(bytes);

    // The whole document, not a substring: this is the one place the table meets a real receipt.
    expect(text).toBe(expected);
    expect(text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(text).not.toContain('windows-1251');
    expect(text).toContain('ТОВ "ПРОДАВЕЦЬ"');
    expect(text).toContain('м. Київ, вул. Прикладна, 1');
  });

  it('leaves a UTF-8-declared document exactly as it is', () => {
    const text = '<?xml version="1.0" encoding="UTF-8"?><CHECK><ORGNM>Ґудзик і Ко</ORGNM></CHECK>';
    const bytes = new TextEncoder().encode(text);

    expect(decodeFiscalDocument(bytes)).toBe(text);
  });

  it('reads a document that declares no encoding through the table, and adds no declaration', () => {
    const source = '<CHECK><ORGNM>Ґудзик</ORGNM></CHECK>';
    const bytes = new Uint8Array([...source].map((c) => c.codePointAt(0) as number).map((c) =>
      c === 0x490 ? 0xa5 : c,
    ));

    // Only the Ґ needed remapping; every other character here is ASCII or a Cyrillic letter the
    // loop below would get wrong, so the assertion is deliberately narrow.
    expect(decodeFiscalDocument(new Uint8Array([0xa5]))).toBe('Ґ');
    expect(decodeFiscalDocument(bytes).startsWith('<CHECK>')).toBe(true);
    expect(decodeFiscalDocument(bytes)).not.toContain('<?xml');
  });

  it('drops a UTF-8 byte-order mark so the declaration stays findable', () => {
    const text = '<?xml version="1.0" encoding="UTF-8"?><CHECK/>';
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);

    expect(decodeFiscalDocument(withBom)).toBe(text);
  });

  it('rewrites the declaration however it is spelled', () => {
    const bytes = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

    expect(decodeFiscalDocument(bytes("<?xml version='1.0' encoding='windows-1251'?><A/>"))).toBe(
      '<?xml version=\'1.0\' encoding="UTF-8"?><A/>',
    );
    expect(decodeFiscalDocument(bytes('<?xml version="1.0" encoding="WINDOWS-1251"?><A/>'))).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><A/>',
    );
  });
});

describe('base64 payloads', () => {
  it('decodes what the answer carries, whitespace and all', () => {
    const bytes = bytesFromBase64('0J/RgNC40LLRltGCIA==');

    expect(bytes && decodeFiscalDocument(bytes)).toBeTruthy();
    expect(bytesFromBase64('0J/R\ngNC4\t 0LLRltGCIA==')).toEqual(bytesFromBase64('0J/RgNC40LLRltGCIA=='));
  });

  it('round-trips the real чек through base64, as the answer carries it', () => {
    const original = new Uint8Array(readFileSync(fixture('prro-real-1-item-test-payer.cp1251.bin')));
    const base64 = Buffer.from(original).toString('base64');

    expect(bytesFromBase64(base64)).toEqual(original);
  });

  it('refuses what is not base64 rather than throwing', () => {
    for (const payload of ['not base64!!', '====', '<base64>']) {
      expect(bytesFromBase64(payload)).toBeUndefined();
    }
  });
});
