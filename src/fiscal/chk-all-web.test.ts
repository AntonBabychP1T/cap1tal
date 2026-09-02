import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { chkAllWebProvider, chkAllWebUrl, type FetchLike } from './chk-all-web';
import { parseFiscalDocument } from './parse';
import { readReceiptQr, type ReceiptLookup } from './qr';

/**
 * The adapter through a fake transport and the four answer fixtures. The real `fetch` appears
 * nowhere: every mapping the tax service can produce is a recorded answer replayed here.
 */

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function lookupOf(query: string): ReceiptLookup {
  const reading = readReceiptQr(`https://cabinet.tax.gov.ua/cashregs/check?${query}`);
  if (reading.kind !== 'lookup') throw new Error('not реквізити');
  return reading.lookup;
}

/** The classic РРО grocery чек, by the реквізити of its own QR. */
const GROCERY = lookupOf('id=696582&fn=3000909908&date=20260429&time=222006&sm=437.40');
/** The 2022 чек the research probed, whose QR gives the time only to the minute. */
const TO_THE_MINUTE = lookupOf('id=45&fn=3000898168&date=20220904&time=1130&sm=780.00');

/** A transport that records every URL it was given and replays one prepared answer. */
function transport(answer: {
  ok?: boolean;
  status?: number;
  body?: string;
  throws?: boolean;
  bodyThrows?: boolean;
}) {
  const urls: string[] = [];
  const fetchImpl: FetchLike = (url) => {
    urls.push(url);
    if (answer.throws) return Promise.reject(new Error('offline'));
    return Promise.resolve({
      ok: answer.ok ?? true,
      status: answer.status ?? 200,
      text: () =>
        answer.bodyThrows ? Promise.reject(new Error('stream died')) : Promise.resolve(answer.body ?? ''),
    });
  };
  return { fetchImpl, urls };
}

/** The success envelope with a real payload in place of its blanked one. */
function envelopeCarrying(documentFixture: string): string {
  const bytes = readFileSync(new URL(`./fixtures/${documentFixture}`, import.meta.url));
  return fixture('chkAllWeb-200-envelope.json').replace(
    '"checkXml": "<base64>"',
    `"checkXml": "${bytes.toString('base64')}"`,
  );
}

describe('the URL of one lookup', () => {
  it('carries the реквізити, the type and an empty captcha, and nothing else', () => {
    const url = new URL(chkAllWebUrl(GROCERY));

    expect(url.origin + url.pathname).toBe(
      'https://cabinet.tax.gov.ua/ws/api_public/rro/chkAllWeb',
    );
    expect([...url.searchParams.keys()].toSorted()).toEqual([
      'captcha',
      'date',
      'fn',
      'id',
      'sm',
      'type',
    ]);
    expect(url.searchParams.get('id')).toBe('696582');
    expect(url.searchParams.get('fn')).toBe('3000909908');
    expect(url.searchParams.get('sm')).toBe('437.40');
    expect(url.searchParams.get('date')).toBe('2026-04-29 22:20:06');
    expect(url.searchParams.get('type')).toBe('3');
    expect(url.searchParams.get('captcha')).toBe('');
  });

  it('sends :00 for a QR that gives the time only to the minute', () => {
    expect(new URL(chkAllWebUrl(TO_THE_MINUTE)).searchParams.get('date')).toBe(
      '2022-09-04 11:30:00',
    );
  });

  it('sends the сума exactly as the QR wrote it', () => {
    const sm = (query: string) =>
      new URL(chkAllWebUrl(lookupOf(query))).searchParams.get('sm');

    expect(sm('id=45&fn=1&date=20220904&time=1130&sm=780.00')).toBe('780.00');
    expect(sm('id=45&fn=1&date=20220904&time=1130&sm=780')).toBe('780');
    expect(sm('id=45&fn=1&date=20220904&time=1130&sm=0780.00')).toBe('0780.00');
  });

  it('One request per lookup, carrying only the реквізити', async () => {
    const { fetchImpl, urls } = transport({ ok: false, status: 400, body: fixture('chkAllWeb-400-not-found.json') });

    await chkAllWebProvider(fetchImpl).lookup(GROCERY);

    expect(urls).toHaveLength(1);
    const query = new URL(urls[0] as string).searchParams;
    // Nothing of the owner's world is in it: no транзакція id, no рахунок, no опис, no device id.
    for (const value of [...query.values()]) {
      expect(value).not.toMatch(/tx-|acc-|АТБ/);
    }
  });
});

describe('what the tax service can answer', () => {
  it('A known чек is found', async () => {
    const { fetchImpl } = transport({ body: envelopeCarrying('prro-real-1-item-test-payer.cp1251.bin') });

    const outcome = await chkAllWebProvider(fetchImpl).lookup(GROCERY);

    expect(outcome.kind).toBe('found');
    if (outcome.kind === 'found') {
      // Decoded on the way out, so what the port hands back is text a parser can read at once.
      expect(outcome.document).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(outcome.document).toContain('ТОВ "ПРОДАВЕЦЬ"');
      expect(parseFiscalDocument(outcome.document).kind).toBe('parsed');
    }
  });

  it('An unknown чек is not-found', async () => {
    const { fetchImpl } = transport({
      ok: false,
      status: 400,
      body: fixture('chkAllWeb-400-not-found.json'),
    });

    expect(await chkAllWebProvider(fetchImpl).lookup(GROCERY)).toEqual({ kind: 'not-found' });
  });

  it('reads a wrong сума as not-found too, because that is what it is', async () => {
    const { fetchImpl } = transport({
      ok: false,
      status: 400,
      body: fixture('chkAllWeb-400-wrong-sum.json'),
    });

    expect(await chkAllWebProvider(fetchImpl).lookup(GROCERY)).toEqual({ kind: 'not-found' });
  });

  it('A refused request is request-rejected', async () => {
    const { fetchImpl } = transport({
      ok: false,
      status: 400,
      body: fixture('chkAllWeb-400-bad-request.json'),
    });

    expect(await chkAllWebProvider(fetchImpl).lookup(GROCERY)).toEqual({
      kind: 'request-rejected',
    });
  });

  it('Being offline is unavailable', async () => {
    const { fetchImpl } = transport({ throws: true });

    expect(await chkAllWebProvider(fetchImpl).lookup(GROCERY)).toEqual({ kind: 'unavailable' });
  });

  it('reads a rate limit, a captcha wall and a server fault as unavailable', async () => {
    for (const status of [403, 429, 500, 502, 503]) {
      const { fetchImpl } = transport({ ok: false, status, body: 'nope' });

      expect(await chkAllWebProvider(fetchImpl).lookup(GROCERY), String(status)).toEqual({
        kind: 'unavailable',
      });
    }
  });

  it('A malformed answer from the tax service is unreadable', async () => {
    const bodies = [
      '',
      'not json',
      '{}',
      '{"checkXml": null}',
      '{"checkXml": ""}',
      '{"checkXml": "!!! not base64 !!!"}',
      // Every field but the one this app reads.
      '{"check":"aGk=","checkP7s":"aGk=","sign":true}',
    ];

    for (const body of bodies) {
      const { fetchImpl } = transport({ body });

      expect(await chkAllWebProvider(fetchImpl).lookup(GROCERY), body).toEqual({
        kind: 'unreadable',
      });
    }
  });

  it('reads the envelope as served, blanked payload and all, as unreadable', async () => {
    // The fixture as recorded carries the literal "<base64>" placeholder — which is what a version
    // of the service that stopped filling the field in would look like.
    const { fetchImpl } = transport({ body: fixture('chkAllWeb-200-envelope.json') });

    expect(await chkAllWebProvider(fetchImpl).lookup(GROCERY)).toEqual({ kind: 'unreadable' });
  });

  it('never throws, whatever the transport does', async () => {
    for (const answer of [{ throws: true }, { bodyThrows: true }, { ok: false, status: 418 }]) {
      const { fetchImpl } = transport(answer);

      await expect(chkAllWebProvider(fetchImpl).lookup(GROCERY)).resolves.toBeDefined();
    }
  });
});

describe('what leaves the phone', () => {
  it('A stored чек lives on the phone only — the provider is the one outbound seam', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const sources = readdirSync(here).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'));

    // Only this adapter may name a transport at all. A parser, the QR reader or the port taking a
    // `FetchLike` would be a second way for a чек to leave the phone.
    const withTransport = sources.filter((name) =>
      readFileSync(new URL(name, import.meta.url), 'utf8').includes('FetchLike'),
    );
    expect(withTransport).toEqual(['chk-all-web.ts']);
  });

  it('names an address in exactly one file', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const sources = readdirSync(here).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'));

    const withEndpoint = sources.filter((name) =>
      /https?:\/\/[a-z]/.test(readFileSync(new URL(name, import.meta.url), 'utf8')),
    );
    // One file writes an address the app calls, and it is the adapter.
    expect(withEndpoint).toEqual(['chk-all-web.ts']);

    const withHost = sources.filter((name) =>
      readFileSync(new URL(name, import.meta.url), 'utf8').includes('cabinet.tax.gov.ua'),
    );
    // Two files name the tax service's host at all: the adapter calls it, and `qr.ts` recognises
    // its receipt-check page in a QR's text. Nothing else knows the tax service exists.
    expect(withHost.toSorted()).toEqual(['chk-all-web.ts', 'qr.ts']);
  });

  it('carries no URL in any outcome, so nothing can log the реквізити by accident', async () => {
    const { fetchImpl } = transport({ ok: false, status: 400, body: fixture('chkAllWeb-400-not-found.json') });

    const outcome = await chkAllWebProvider(fetchImpl).lookup(GROCERY);

    expect(JSON.stringify(outcome)).not.toContain('cabinet.tax.gov.ua');
    expect(JSON.stringify(outcome)).not.toContain('696582');
  });
});
