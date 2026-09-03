import { describe, expect, it } from 'vitest';

import { looksLikeSameAccount, similarity, tokens, wordMatch } from './name-similarity';

describe('how alike two назви are', () => {
  it('cuts a name into words on everything that is not a letter or a digit', () => {
    expect(tokens('Monobank UAH, Black')).toEqual(['monobank', 'uah', 'black']);
    expect(tokens('  Приват 5168  ')).toEqual(['приват', '5168']);
    expect(tokens('—')).toEqual([]);
  });

  it('calls two words the same when they are equal, or a prefix of four non-numeric characters', () => {
    expect(wordMatch('black', 'black')).toBe(true);
    expect(wordMatch('mono', 'monobank')).toBe(true);
    // Three characters is not enough — that is what told "Binance USD" from "binance usdt".
    expect(wordMatch('usd', 'usdt')).toBe(false);
    // And among numbers a shared prefix means two cards of one bank, not one card.
    expect(wordMatch('5168', '51689')).toBe(false);
    expect(wordMatch('mono', 'white')).toBe(false);
  });

  it('scores the case the vision names', () => {
    // Vision §16: Saldo holds a hand-kept "mono black" beside an auto-imported "Monobank UAH,
    // Black", and they are one card. `black` is exact, `mono` is a prefix of `monobank`.
    expect(similarity('mono black', 'Monobank UAH, Black')).toBe(2);
  });

  it('scores the same name 3 whatever its letter case and surrounding spaces', () => {
    expect(similarity('гаманець', 'Гаманець')).toBe(3);
    expect(similarity(' Гаманець ', 'гаманець')).toBe(3);
  });

  it('scores one word in common 1 and nothing in common 0', () => {
    expect(similarity('mono black', 'mono white')).toBe(1);
    expect(similarity('mono black', 'OTP')).toBe(0);
  });

  it('gives the same answer whichever order the words are in', () => {
    // Two passes, exact first: single-pass greedy lets `mono` eat `monopoly` on a prefix before
    // `monopoly` has asked for it, and then the answer depends on the order of the words.
    expect(similarity('mono monopoly', 'monopoly monobank')).toBe(2);
    expect(similarity('monopoly mono', 'monobank monopoly')).toBe(2);
    expect(similarity('monopoly mono', 'monopoly monobank')).toBe(2);
  });

  it('never lets one word of the longer name answer for two of the shorter', () => {
    // `mono` and `monobank` are both prefixes of `monobankomat`, but there is only one of it, so
    // the second word is left without a match of its own and the pair stops at one word in common.
    expect(similarity('mono monobank', 'monobankomat otp')).toBe(1);
  });
});

describe('Scenario: A підказка про дубль points out a pair that can only be one рахунок', () => {
  it('accepts the same name and every word of the shorter found in the longer', () => {
    expect(looksLikeSameAccount('mono black', 'Monobank UAH, Black')).toBe(true);
    expect(looksLikeSameAccount('гаманець', 'Гаманець')).toBe(true);
  });

  it('Scenario: A mere family likeness is not a підказка', () => {
    expect(looksLikeSameAccount('Monobank UAH, Black', 'Monobank UAH, White')).toBe(false);
  });

  it('refuses a single word in common — one word is a coincidence, two are a name', () => {
    expect(looksLikeSameAccount('Готівка', 'Готівка вдома')).toBe(false);
    expect(looksLikeSameAccount('конверт приват', 'приват степендія')).toBe(false);
  });

  it('refuses the two cases the four-character non-numeric prefix rule exists for', () => {
    expect(looksLikeSameAccount('Binance USD', 'binance usdt')).toBe(false);
    expect(looksLikeSameAccount('Приват 516', 'Приват 5168')).toBe(false);
    expect(looksLikeSameAccount('Приват 5168', 'Приват 51689')).toBe(false);
  });
});

/**
 * The pairs of the owner's own export that the rule must stay silent on. Four pairs rather than the
 * whole 23-name list: the list is the owner's data and does not belong in a tracked test, but these
 * four are what the rule was written against, and this is the test that fails the day it is
 * loosened into guessing.
 */
describe('the owner’s real export: the rule says nothing', () => {
  const SILENT: readonly (readonly [string, string])[] = [
    ['mono black', 'mono white'],
    ['binance crypto', 'binance usdt'],
    ['конверт приват', 'приват степендія'],
    ['IBKR', 'інжур'],
  ];

  it.each(SILENT)('says nothing about «%s» and «%s»', (a, b) => {
    expect(looksLikeSameAccount(a, b)).toBe(false);
    expect(looksLikeSameAccount(b, a)).toBe(false);
  });
});
