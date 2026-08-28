import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import type { MonobankLink } from '../monobank/link';
import {
  boundaryConfirmation,
  CLIPBOARD_NO_TOKEN,
  linkChoices,
  linkSetConfirmation,
  MONOBANK_TOKEN_PAGE_URL,
  monobankAccountRows,
  newAccountDraft,
  progressLabel,
  proposalRows,
  removeTokenConfirmation,
  accountCount,
  syncSummary,
  tokenCandidate,
  tokenStateLabel,
  transactionCount,
  unlinkConfirmation,
  type MonobankAccountView,
} from './monobank-screen';

/**
 * The «monobank» screen's decisions, without its JSX. Every bank answer here is a plain value —
 * nothing in this file reaches the network, and no token exists anywhere near it.
 */

const blackCard: MonobankAccountView = {
  id: 'mono-black',
  kind: 'card',
  name: 'black ··1234',
  currency: 'UAH',
  bankBalance: money(3_000_00, 'UAH'),
};
const whiteCard: MonobankAccountView = {
  id: 'mono-white',
  kind: 'card',
  name: 'white ··9999',
  currency: 'UAH',
  bankBalance: money(150_00, 'UAH'),
};
const holidayJar: MonobankAccountView = {
  id: 'mono-jar',
  kind: 'jar',
  name: 'На відпустку',
  currency: 'USD',
  bankBalance: money(1_234_50, 'USD'),
};

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const cash = account({ id: 'cash', name: 'гаманець', kind: 'cash', currency: 'UAH' });
const dollars = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });
const euros = account({ id: 'eur', name: 'євро', kind: 'savings', currency: 'EUR' });
const retired = account({
  id: 'old',
  name: 'стара картка',
  kind: 'spending',
  currency: 'UAH',
  archived: true,
});

const linkedBlack: MonobankLink & { syncStartDate: string } = {
  monobankAccountId: 'mono-black',
  accountId: 'card',
  syncStartDate: '2026-08-01',
};

describe('monobankAccountRows', () => {
  it('Scenario: Linked and unlinked accounts are both present', () => {
    const rows = monobankAccountRows({
      monobankAccounts: [blackCard, whiteCard, holidayJar],
      links: [linkedBlack],
      accounts: [card, cash, dollars],
    });

    // All three are shown, in Ukrainian name order — Cyrillic titles ahead of Latin ones.
    expect(rows.map((row) => row.monobankAccountId)).toEqual([
      'mono-jar',
      'mono-black',
      'mono-white',
    ]);
    // …the linked card names its рахунок and the day its sync starts from…
    expect(rows.find((row) => row.monobankAccountId === 'mono-black')).toMatchObject({
      linked: true,
      accountName: 'mono black',
      syncStartDate: '2026-08-01',
    });
    // …and the other card and the банка are visibly unlinked, with no рахунок named.
    for (const id of ['mono-white', 'mono-jar']) {
      const row = rows.find((r) => r.monobankAccountId === id);
      expect(row?.linked).toBe(false);
      expect(row).not.toHaveProperty('accountName');
    }
  });

  it('Scenario: Each balance keeps its own currency', () => {
    const rows = monobankAccountRows({
      monobankAccounts: [blackCard, holidayJar],
      links: [],
      accounts: [],
    });

    expect(rows.map((row) => row.bankBalance)).toEqual(['1234,50 USD', '3000,00 UAH']);
    // No combined or converted figure exists to replace either one.
    expect(rows.map((row) => row.currency).sort()).toEqual(['UAH', 'USD']);
  });

  it('A linked рахунок that cannot be resolved shows its id rather than an empty gap', () => {
    const rows = monobankAccountRows({
      monobankAccounts: [blackCard],
      links: [linkedBlack],
      accounts: [],
    });

    expect(rows[0]).toMatchObject({ linked: true, accountName: 'card' });
  });

  it('A негативний баланс банку keeps its sign', () => {
    const rows = monobankAccountRows({
      monobankAccounts: [{ ...blackCard, bankBalance: money(-45_00, 'UAH') }],
      links: [],
      accounts: [],
    });

    expect(rows[0]?.bankBalance).toBe('−45,00 UAH');
  });
});

describe('linkChoices', () => {
  it('Scenario: An existing same-currency рахунок is linked', () => {
    const offered = linkChoices({
      monobankAccount: blackCard,
      accounts: [card, cash, dollars],
      links: [],
    });

    expect(offered.map((a) => a.id)).toEqual(['cash', 'card']);
  });

  it('Scenario: A different-currency рахунок is not a link choice', () => {
    const offered = linkChoices({
      monobankAccount: holidayJar,
      accounts: [card, cash, dollars, euros],
      links: [],
    });

    // A USD monobank account is offered the USD рахунок and nothing else.
    expect(offered.map((a) => a.id)).toEqual(['usd']);
  });

  it('A рахунок another monobank account already feeds is not offered again', () => {
    const offered = linkChoices({
      monobankAccount: whiteCard,
      accounts: [card, cash],
      links: [linkedBlack],
    });

    expect(offered.map((a) => a.id)).toEqual(['cash']);
  });

  it('An archived рахунок is offered for no new link', () => {
    const offered = linkChoices({
      monobankAccount: blackCard,
      accounts: [retired, cash],
      links: [],
    });

    expect(offered.map((a) => a.id)).toEqual(['cash']);
  });
});

describe('newAccountDraft', () => {
  it('Scenario: Creating for a банка starts from a suggestion', () => {
    expect(newAccountDraft(holidayJar)).toEqual({
      name: 'На відпустку',
      kind: 'savings',
      currency: 'USD',
    });
  });

  it('A card suggests a рахунок to spend from', () => {
    expect(newAccountDraft(blackCard)).toEqual({
      name: 'black ··1234',
      kind: 'spending',
      currency: 'UAH',
    });
  });
});

describe('boundaryConfirmation', () => {
  it('Scenario: An existing same-currency рахунок is linked', () => {
    const sentence = boundaryConfirmation('2026-08-28', 'mono black');

    // The date is named, and named as inclusive…
    expect(sentence).toContain('2026-08-28');
    expect(sentence).toContain('включно');
    // …and so is the thing the app deliberately does not do, before anything is imported.
    expect(sentence).toContain('Saldo');
  });
});

describe('syncSummary', () => {
  const names = new Map([
    ['mono-black', 'black ··1234'],
    ['mono-white', 'white ··9999'],
  ]);

  it('Scenario: A complete run reports imported transactions', () => {
    const summary = syncSummary(
      {
        kind: 'ran',
        imported: 7,
        accounts: [
          { monobankAccountId: 'mono-black', accountId: 'card', outcome: 'complete', imported: 4 },
          { monobankAccountId: 'mono-white', accountId: 'jar', outcome: 'complete', imported: 3 },
        ],
      },
      names,
    );

    // Both accounts identified as complete, and seven транзакції reported.
    expect(summary.headline).toBe('Імпортовано 7 транзакцій');
    expect(summary.accounts.map((a) => a.text)).toEqual([
      'black ··1234: готово, 4 транзакції',
      'white ··9999: готово, 3 транзакції',
    ]);
    // Nothing is unfinished, so nothing is offered to retry.
    expect(summary.retryOffered).toBe(false);
    expect(summary.replaceTokenOffered).toBe(false);
  });

  it('Scenario: A partial run keeps its truth', () => {
    const summary = syncSummary(
      {
        kind: 'ran',
        imported: 2,
        accounts: [
          { monobankAccountId: 'mono-black', accountId: 'card', outcome: 'complete', imported: 2 },
          {
            monobankAccountId: 'mono-white',
            accountId: 'jar',
            outcome: 'rate-limited',
            imported: 0,
          },
        ],
      },
      names,
    );

    // The first card stays complete with its two транзакції; the second is named as rate-limited…
    expect(summary.accounts[0]?.text).toBe('black ··1234: готово, 2 транзакції');
    expect(summary.accounts[1]?.text).toBe('white ··9999: банк просить зачекати');
    expect(summary.headline).toBe('Імпортовано 2 транзакції');
    // …and a retry is offered for the unfinished work, not for the finished account.
    expect(summary.retryOffered).toBe(true);
    expect(summary.replaceTokenOffered).toBe(false);
  });

  it('Scenario: An invalid stored token asks for replacement', () => {
    const summary = syncSummary(
      {
        kind: 'ran',
        imported: 0,
        accounts: [
          {
            monobankAccountId: 'mono-black',
            accountId: 'card',
            outcome: 'invalid-token',
            imported: 0,
          },
        ],
      },
      names,
    );

    // Named as an invalid token rather than as an offline error, and replacing it is the offer.
    expect(summary.accounts[0]?.text).toBe('black ··1234: токен більше не дійсний');
    expect(summary.replaceTokenOffered).toBe(true);
    expect(summary.headline).toBe('Імпортовано 0 транзакцій');
  });

  it('A run that never started says why, and offers no per-account lines', () => {
    expect(syncSummary({ kind: 'not-configured' }, names)).toMatchObject({
      headline: 'Спершу введіть токен monobank',
      accounts: [],
    });
    expect(syncSummary({ kind: 'no-links' }, names).retryOffered).toBe(false);
    expect(syncSummary({ kind: 'storage-unavailable' }, names).retryOffered).toBe(true);
  });

  it('The транзакція plural follows Ukrainian, teens included', () => {
    expect(transactionCount(1)).toBe('1 транзакція');
    expect(transactionCount(3)).toBe('3 транзакції');
    expect(transactionCount(5)).toBe('5 транзакцій');
    expect(transactionCount(11)).toBe('11 транзакцій');
    expect(transactionCount(21)).toBe('21 транзакція');
    expect(transactionCount(0)).toBe('0 транзакцій');
  });
});

describe('progressLabel', () => {
  const names = new Map([['mono-black', 'black ··1234']]);

  it('A long first sync is never silent about why it is waiting', () => {
    expect(progressLabel({ kind: 'waiting', ms: 45_000 }, names)).toBe(
      'Чекаємо 45 с — банк дозволяє один запит на хвилину',
    );
    expect(progressLabel({ kind: 'started', accounts: 1 }, names)).toBe('Синхронізація: 1 рахунок');
    expect(progressLabel({ kind: 'started', accounts: 2 }, names)).toBe('Синхронізація: 2 рахунки');
    expect(progressLabel({ kind: 'started', accounts: 5 }, names)).toBe(
      'Синхронізація: 5 рахунків',
    );
    expect(
      progressLabel({ kind: 'account', monobankAccountId: 'mono-black', index: 2, of: 3 }, names),
    ).toBe('black ··1234 — 2 з 3');
    expect(
      progressLabel(
        {
          kind: 'finished-account',
          result: {
            monobankAccountId: 'mono-black',
            accountId: 'card',
            outcome: 'complete',
            imported: 2,
          },
        },
        names,
      ),
    ).toBe('black ··1234: готово');
  });
});

describe('the disconnecting confirmations', () => {
  it('Scenario: Relinking does not resurrect a deleted transaction', () => {
    const sentence = unlinkConfirmation('black ··1234');

    // The promise the owner needs before they unlink: nothing of their money goes, and the memory
    // of what was already imported goes least of all.
    expect(sentence).toContain('black ··1234');
    expect(sentence).toContain('не задублює');
    expect(sentence).toContain('лишаються');
  });

  it('Scenario: Removing the token keeps imported history', () => {
    const sentence = removeTokenConfirmation();

    expect(sentence).toContain('Синхронізація припиниться');
    expect(sentence).toContain('без змін');
  });
});

describe('tokenStateLabel', () => {
  it('Scenario: A valid token becomes configured without being revealed', () => {
    const token = 'uT3st_TOKENnnnnnnnnnnnnnnnnnnnnnnnnnnnnn';

    // Configured or not configured: the two things the screen may say, and the only two. There is
    // no branch that could put the value into what is rendered, whatever the screen holds.
    expect(tokenStateLabel(true)).toBe('Токен збережено на пристрої');
    expect(tokenStateLabel(false)).toBe('Токен ще не введено');
    expect(tokenStateLabel(undefined)).toBe('Стан підключення невідомий');
    for (const configured of [true, false, undefined]) {
      expect(tokenStateLabel(configured)).not.toContain(token);
    }
  });
});

describe('the рахунок plural', () => {
  it('Follows Ukrainian, teens included', () => {
    expect(accountCount(1)).toBe('1 рахунок');
    expect(accountCount(2)).toBe('2 рахунки');
    expect(accountCount(5)).toBe('5 рахунків');
    expect(accountCount(11)).toBe('11 рахунків');
    expect(accountCount(21)).toBe('21 рахунок');
    expect(accountCount(0)).toBe('0 рахунків');
  });
});

describe('getting a token', () => {
  it('Points at monobank own token page and nowhere else', () => {
    // The one address in this flow. A test holds it so a typo cannot quietly send the owner to
    // somebody else's page to type a banking token into.
    expect(MONOBANK_TOKEN_PAGE_URL).toBe('https://api.monobank.ua/');
    expect(new URL(MONOBANK_TOKEN_PAGE_URL).hostname).toBe('api.monobank.ua');
    expect(new URL(MONOBANK_TOKEN_PAGE_URL).protocol).toBe('https:');
  });

  it('A copied token is offered, ends trimmed', () => {
    const copied = 'uZBnFPHc7yTqW3mKdRxLvNs9ThgQ2eJbA5CwYX4pMz';
    expect(tokenCandidate(copied)).toBe(copied);
    // Copying from a web page brings the newline with it far more often than not.
    expect(tokenCandidate(` ${copied}\n`)).toBe(copied);
    expect(tokenCandidate('a'.repeat(30))).toBe('a'.repeat(30));
    expect(tokenCandidate('a'.repeat(64))).toBe('a'.repeat(64));
    expect(tokenCandidate('u_Z-nFPHc7yTqW3mKdRxLvNs9ThgQ2eJbA5Cw')).toBe(
      'u_Z-nFPHc7yTqW3mKdRxLvNs9ThgQ2eJbA5Cw',
    );
  });

  it('An unrelated clipboard is not a candidate', () => {
    // Nothing here reaches the bank: the filter is what stops the owner's password, address or
    // last message being posted to monobank on the chance that it might be a token.
    expect(tokenCandidate('')).toBeUndefined();
    expect(tokenCandidate('   ')).toBeUndefined();
    expect(tokenCandidate(undefined)).toBeUndefined();
    expect(tokenCandidate(null)).toBeUndefined();
    expect(tokenCandidate('Привіт, як справи? Я вже вдома.')).toBeUndefined();
    expect(tokenCandidate('https://api.monobank.ua/index.html')).toBeUndefined();
    expect(tokenCandidate('uZBnFPHc7yTqW3mKdRx LvNs9ThgQ2eJbA5Cw')).toBeUndefined();
    expect(tokenCandidate('a'.repeat(29))).toBeUndefined();
    expect(tokenCandidate('a'.repeat(65))).toBeUndefined();
  });

  it('Says out loud when the clipboard held no token', () => {
    // Silence after coming back from the token page reads as a broken app, not as a missed copy.
    expect(CLIPBOARD_NO_TOKEN).toContain('буфер');
  });
});

describe('the review list of proposals', () => {
  const monoBlack = account({
    id: 'a-black',
    name: 'Monobank Black',
    kind: 'spending',
    currency: 'UAH',
  });
  const older = account({
    id: 'a-old',
    name: 'Monobank Black стара',
    kind: 'spending',
    currency: 'UAH',
  });

  it('Names what each proposal would do and on what evidence', () => {
    const rows = proposalRows({
      proposals: [
        {
          kind: 'existing',
          monobankAccountId: 'mono-black',
          accountId: 'a-black',
          evidence: 'digits',
        },
        { kind: 'new', monobankAccountId: 'mono-jar' },
      ],
      monobankAccounts: [blackCard, holidayJar],
      accounts: [monoBlack],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.becomes).toContain('Monobank Black');
    expect(rows[0]?.reason).toBe('збігаються останні цифри');
    expect(rows[0]?.acceptable).toBe(true);
    expect(rows[0]?.accountId).toBe('a-black');
    // A банка proposes a рахунок of вид «відкладення», which is what makes a переказ into it
    // count as відкладено — so the row says the вид out loud before it is accepted.
    expect(rows[1]?.becomes).toContain(holidayJar.name);
    expect(rows[1]?.draft?.kind).toBe('savings');
    expect(rows[1]?.acceptable).toBe(true);
  });

  it('Scenario: Two equally matching рахунки propose nothing — and the row says so', () => {
    const rows = proposalRows({
      proposals: [
        { kind: 'ambiguous', monobankAccountId: 'mono-black', candidateIds: ['a-black', 'a-old'] },
      ],
      monobankAccounts: [blackCard],
      accounts: [monoBlack, older],
    });

    // Nothing to accept, both candidates named: the owner decides in the picker that is already
    // on the row, and «Приєднати все» leaves this one alone.
    expect(rows[0]?.acceptable).toBe(false);
    expect(rows[0]?.accountId).toBeUndefined();
    expect(rows[0]?.reason).toContain('Monobank Black');
    expect(rows[0]?.reason).toContain('Monobank Black стара');
  });

  it('Drops a proposal whose рахунок or monobank account is gone', () => {
    expect(
      proposalRows({
        proposals: [
          {
            kind: 'existing',
            monobankAccountId: 'mono-black',
            accountId: 'gone',
            evidence: 'word',
          },
          { kind: 'new', monobankAccountId: 'unknown-bank-account' },
        ],
        monobankAccounts: [blackCard],
        accounts: [monoBlack],
      }),
    ).toEqual([]);
  });

  it('Confirms a whole set with the same promise one link is confirmed with', () => {
    const sentence = linkSetConfirmation(3, '2026-08-01');
    expect(sentence).toContain('3 рахунки');
    expect(sentence).toContain('2026-08-01');
    // The two things the owner must know before five links are made at once.
    expect(sentence).toContain('включно');
    expect(sentence).toContain('Saldo');
  });
});
