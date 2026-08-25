import { describe, expect, it, vi } from 'vitest';

import {
  fetchMonobankRates,
  MONOBANK_CURRENCY_URL,
  parseMonobankRates,
  type FetchLike,
} from './currency';

/**
 * The shape monobank actually answers with, trimmed: the USD and EUR pairs against UAH carry
 * `rateBuy`/`rateSell`, the thinner currencies carry `rateCross` only, and pairs that do not
 * quote against UAH (978/840) are in the same list. Captured from the live endpoint.
 */
const REAL_SHAPED = [
  { currencyCodeA: 840, currencyCodeB: 980, date: 1787518873, rateBuy: 44.43, rateSell: 44.831 },
  { currencyCodeA: 978, currencyCodeB: 980, date: 1787558173, rateBuy: 51.88, rateSell: 52.579 },
  { currencyCodeA: 978, currencyCodeB: 840, date: 1787558173, rateBuy: 1.163, rateSell: 1.173 },
  { currencyCodeA: 826, currencyCodeB: 980, date: 1787587738, rateCross: 61.3181 },
  { currencyCodeA: 392, currencyCodeB: 980, date: 1787587738, rateCross: 0.2853 },
];

/** A response object shaped like the part of `Response` that `fetchMonobankRates` touches. */
const response = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

describe('parseMonobankRates', () => {
  it('The offered currencies are read from a real-shaped response, as integer millionths', () => {
    expect(parseMonobankRates(REAL_SHAPED)).toEqual([
      { currency: 'USD', rateMillionths: 44_430_000 },
      { currency: 'EUR', rateMillionths: 51_880_000 },
    ]);
  });

  it('A pair that does not quote against UAH is not a UAH rate', () => {
    // 978/840 is EUR per USD. It is in the same list and must not be mistaken for EUR/UAH.
    expect(parseMonobankRates([REAL_SHAPED[2]])).toEqual([]);
  });

  it('A currency the app does not offer is left alone', () => {
    // GBP and JPY quote against UAH and are perfectly valid — they are simply not ours, and JPY
    // has no minor units, which the converter is not built for.
    expect(parseMonobankRates([REAL_SHAPED[3], REAL_SHAPED[4]])).toEqual([]);
  });

  it('rateCross serves when rateBuy is absent', () => {
    expect(
      parseMonobankRates([{ currencyCodeA: 840, currencyCodeB: 980, rateCross: 41.25345 }]),
    ).toEqual([{ currency: 'USD', rateMillionths: 41_253_450 }]);
  });

  it('rateBuy wins when both are there, and rateSell is never used', () => {
    expect(
      parseMonobankRates([
        { currencyCodeA: 840, currencyCodeB: 980, rateBuy: 44.43, rateSell: 44.831, rateCross: 44.6 },
      ]),
    ).toEqual([{ currency: 'USD', rateMillionths: 44_430_000 }]);
  });

  it('The float is rounded to whole millionths, once', () => {
    expect(
      parseMonobankRates([{ currencyCodeA: 840, currencyCodeB: 980, rateBuy: 41.2534567 }]),
    ).toEqual([{ currency: 'USD', rateMillionths: 41_253_457 }]);
  });

  it('A currency listed twice keeps its first row', () => {
    expect(
      parseMonobankRates([
        { currencyCodeA: 840, currencyCodeB: 980, rateBuy: 44.43 },
        { currencyCodeA: 840, currencyCodeB: 980, rateBuy: 99.99 },
      ]),
    ).toEqual([{ currency: 'USD', rateMillionths: 44_430_000 }]);
  });

  it('Garbage parses to no rows and never throws', () => {
    for (const payload of [
      undefined,
      null,
      42,
      'not json',
      {},
      { error: 'too many requests' },
      [],
      [null],
      [42],
      ['nope'],
      [{}],
      [{ currencyCodeA: 840 }],
      [{ currencyCodeA: 840, currencyCodeB: 980 }],
      [{ currencyCodeA: '840', currencyCodeB: 980, rateBuy: 44.43 }],
      [{ currencyCodeA: 840, currencyCodeB: '980', rateBuy: 44.43 }],
      [{ currencyCodeA: 840, currencyCodeB: 980, rateBuy: '44.43' }],
      [{ currencyCodeA: 840, currencyCodeB: 980, rateBuy: 0 }],
      [{ currencyCodeA: 840, currencyCodeB: 980, rateBuy: -44.43 }],
      [{ currencyCodeA: 840, currencyCodeB: 980, rateBuy: Number.NaN }],
      [{ currencyCodeA: 840, currencyCodeB: 980, rateBuy: Number.POSITIVE_INFINITY }],
      [{ currencyCodeA: 840, currencyCodeB: 980, rateBuy: Number.MAX_VALUE }],
    ]) {
      expect(() => parseMonobankRates(payload)).not.toThrow();
      expect(parseMonobankRates(payload)).toEqual([]);
    }
  });

  it('One malformed row does not cost the rows beside it', () => {
    expect(
      parseMonobankRates([
        { currencyCodeA: 840, currencyCodeB: 980, rateBuy: 'nonsense' },
        { currencyCodeA: 978, currencyCodeB: 980, rateBuy: 51.88 },
      ]),
    ).toEqual([{ currency: 'EUR', rateMillionths: 51_880_000 }]);
  });
});

describe('fetchMonobankRates', () => {
  it('A 200 answers with the parsed rates, from the public endpoint', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(response(200, REAL_SHAPED)));

    await expect(fetchMonobankRates(fetchImpl)).resolves.toEqual([
      { currency: 'USD', rateMillionths: 44_430_000 },
      { currency: 'EUR', rateMillionths: 51_880_000 },
    ]);
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(MONOBANK_CURRENCY_URL);
    expect(MONOBANK_CURRENCY_URL).toBe('https://api.monobank.ua/bank/currency');
  });

  it('A 429 yields no rows — the endpoint rate-limits, and that is not an error to show', async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve(response(429, { errorDescription: 'Too many requests' })),
    );

    await expect(fetchMonobankRates(fetchImpl)).resolves.toEqual([]);
  });

  it('A 500 yields no rows', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(response(500, 'oops')));

    await expect(fetchMonobankRates(fetchImpl)).resolves.toEqual([]);
  });

  it('A rejected request — offline — yields no rows rather than throwing', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.reject(new Error('Network request failed')));

    await expect(fetchMonobankRates(fetchImpl)).resolves.toEqual([]);
  });

  it('A body that is not JSON yields no rows rather than throwing', async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      }),
    );

    await expect(fetchMonobankRates(fetchImpl)).resolves.toEqual([]);
  });
});
