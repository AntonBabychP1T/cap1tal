import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { mergeConfirmation, mergeTargets } from './account-merge';

const jar = account({ id: 'jar', name: 'На облігацію', kind: 'savings', currency: 'USD' });
const bond = account({ id: 'bond', name: 'облігація $', kind: 'investment', currency: 'USD' });
const binance = account({ id: 'binance', name: 'binance usdt', kind: 'investment', currency: 'USD' });
const old = account({ id: 'old', name: 'валюта моно', kind: 'spending', currency: 'USD', archived: true });
const white = account({ id: 'white', name: 'mono white', kind: 'spending', currency: 'UAH' });

describe('mergeTargets', () => {
  it('offers every unarchived рахунок of the same currency but itself, in picker order', () => {
    // Ukrainian order, as every рахунок picker: «облігація $» before «binance usdt».
    expect(mergeTargets(jar, [jar, bond, binance, old, white]).map((a) => a.id)).toEqual([
      'bond',
      'binance',
    ]);
  });
});

describe('mergeConfirmation', () => {
  it('says what disappears, what moves, where monobank syncs next, and the balance after', () => {
    const text = mergeConfirmation({
      from: jar,
      into: bond,
      preview: {
        moved: 1,
        dropped: 0,
        balance: money(2051_00, 'USD'),
        corrections: 0,
        balanceWithoutCorrections: money(2051_00, 'USD'),
      },
      linkMoves: true,
    });
    expect(text).toContain('«На облігацію» зникне, а все з нього перейде в «облігація $».');
    expect(text).toContain('Транзакцій перейде: 1.');
    expect(text).not.toContain('Переказів між ними');
    expect(text).toContain('Рахунок monobank надалі синхронізуватиметься в «облігація $».');
    expect(text).toContain('Баланс «облігація $» після обʼєднання: 2');
    expect(text).not.toContain('коригування');
  });

  it('offers to leave the folded рахунок\'s коригування behind, naming the balance without them', () => {
    const text = mergeConfirmation({
      from: jar,
      into: bond,
      preview: {
        moved: 1,
        dropped: 0,
        balance: money(4137_99, 'USD'),
        corrections: 1,
        balanceWithoutCorrections: money(2051_00, 'USD'),
      },
      linkMoves: true,
    });
    expect(text).toContain('Серед транзакцій «На облігацію» є коригування (1).');
    expect(text).toContain('обʼєднайте без коригувань');
    expect(text).toMatch(/тоді баланс буде 2\s051,00 USD\.$/);
  });

  it('names the перекази between them that go, and says nothing of monobank without a link', () => {
    const text = mergeConfirmation({
      from: jar,
      into: bond,
      preview: {
        moved: 0,
        dropped: 2,
        balance: money(0, 'USD'),
        corrections: 0,
        balanceWithoutCorrections: money(0, 'USD'),
      },
      linkMoves: false,
    });
    expect(text).toContain('Переказів між ними буде видалено: 2.');
    expect(text).not.toContain('monobank');
  });
});

/**
 * The screen's wiring, which `verify` never runs — read by path like every other screen check.
 */
describe('«Обʼєднати з іншим рахунком» on the рахунок screen', () => {
  const screen = readFileSync(new URL('../app/account/[id].tsx', import.meta.url), 'utf8');

  it('writes only from the confirmation, then shows the рахунок it was folded into', () => {
    const confirm = screen.slice(screen.indexOf('const confirmMerge = useCallback'));
    const body = confirm.slice(0, confirm.indexOf('// A рахунок that has been deleted'));
    // Refused and previewed before any alert offers to write.
    expect(body.indexOf('mergeRefusal(')).toBeLessThan(body.indexOf('Alert.alert(\'Обʼєднати рахунки?\''));
    expect(body.indexOf('mergePreview(')).toBeLessThan(body.indexOf('Alert.alert(\'Обʼєднати рахунки?\''));
    const write = body.indexOf('mergeAccounts({ fromId: from.id, intoId: into.id, dropCorrections })');
    expect(write).toBeGreaterThan(-1);
    expect(body.indexOf('router.replace(`/account/${into.id}`)')).toBeGreaterThan(write);
    // «Без коригувань» only when there is a коригування to leave behind.
    expect(body).toContain("preview.corrections > 0");
    expect(body).toContain("{ text: 'Без коригувань', onPress: merge(true) }");
  });

  it('offers only the рахунки `mergeTargets` names', () => {
    expect(screen).toContain('mergeTargets(a, stored.accounts)');
    expect(screen).toContain('onSelect={confirmMerge}');
  });
});
