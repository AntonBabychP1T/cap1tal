import { activeAccounts, type Account, type AccountKind } from '../domain/account';
import { EVIDENCE_STRENGTH, nameEvidence, type NameEvidence } from '../domain/name-match';
import type { MonobankAccount } from './api';

/**
 * What it means for a monobank account to *be* one of the owner's рахунки.
 *
 * A link is one-to-one in both directions: a monobank account feeds exactly one рахунок, and a
 * рахунок is fed by exactly one monobank account. Anything looser and the розрахунковий баланс
 * stops meaning anything — two statements into one рахунок would double every витрата, and one
 * statement into two would put the same money in two places.
 *
 * The owner makes the links; this module only says which ones are valid, and what вид to suggest
 * for a рахунок created to hold one. An unlinked monobank account takes no part in sync at all —
 * it is not skipped quietly, it is simply not linked, and the screen change shows it as such so
 * the decision stays visible.
 */

export interface MonobankLink {
  readonly monobankAccountId: string;
  /** The рахунок this monobank account is. */
  readonly accountId: string;
}

/**
 * The вид a рахунок made for this monobank account starts on: a card is money to spend, a банка is
 * money put aside. A suggestion only — the owner may pick any вид, and `validateLink` does not
 * consult it.
 */
export function suggestKind(monobankAccount: Pick<MonobankAccount, 'kind'>): AccountKind {
  return monobankAccount.kind === 'jar' ? 'savings' : 'spending';
}

/**
 * Refuses a link that would break the one-to-one rule or join two currencies, in the words the
 * screen shows the owner (like `entry-form.ts`'s refusals). A valid link returns nothing.
 *
 * Currencies must be equal, not merely convertible: a link makes the bank's numbers this рахунок's
 * numbers, and there is no rate in this app that could make a USD statement into UAH truth.
 */
export function validateLink(input: {
  readonly monobankAccount: Pick<MonobankAccount, 'id' | 'currency'>;
  readonly account: Pick<Account, 'id' | 'currency'>;
  /** Every link that already exists. A link being *re-*validated is not among them. */
  readonly links: readonly MonobankLink[];
}): void {
  const { monobankAccount, account, links } = input;
  if (monobankAccount.currency !== account.currency) {
    throw new Error(
      `валюти різні: ${monobankAccount.currency} у monobank і ${account.currency} на рахунку`,
    );
  }
  if (links.some((link) => link.monobankAccountId === monobankAccount.id)) {
    throw new Error('цей рахунок monobank уже приєднано');
  }
  if (links.some((link) => link.accountId === account.id)) {
    throw new Error('до цього рахунку вже приєднано рахунок monobank');
  }
}

/**
 * The monobank accounts of the token that no рахунок stands for. What the screen must show, whole:
 * an account left unlinked is the owner's decision, and a decision they were never offered would
 * be a silent gap in «по всіх картках і банках».
 */
export function unlinkedAccounts(
  monobankAccounts: readonly MonobankAccount[],
  links: readonly MonobankLink[],
): MonobankAccount[] {
  const linked = new Set(links.map((link) => link.monobankAccountId));
  return monobankAccounts.filter((a) => !linked.has(a.id));
}

/** What the app proposes for one unlinked monobank account. Never a link — always a proposal. */
export type LinkProposal =
  | {
      readonly kind: 'existing';
      readonly monobankAccountId: string;
      readonly accountId: string;
      /** Why this рахунок — the review list shows it, so a proposal can be judged, not just taken. */
      readonly evidence: NameEvidence;
    }
  /** Nothing on the device matches; the рахунок the bank's own name describes should be made. */
  | { readonly kind: 'new'; readonly monobankAccountId: string }
  /** More than one рахунок matches exactly as well. Naming one of them would be a coin flip. */
  | {
      readonly kind: 'ambiguous';
      readonly monobankAccountId: string;
      readonly candidateIds: readonly string[];
    };

/** The part of a monobank account a proposal reads. No balance, on purpose (see `nameEvidence`). */
export type ProposableMonobankAccount = Pick<MonobankAccount, 'id' | 'name' | 'currency'>;

/**
 * One proposal per unlinked monobank account: an existing рахунок the evidence points at, a new
 * рахунок to be made from the bank's own name, or nothing at all when two рахунки match equally.
 *
 * The rules a link must obey are not softened here — a candidate is an unarchived рахунок of
 * exactly the same currency that no link already feeds, which is what `validateLink` would
 * accept. A рахунок is proposed to at most one monobank account: accounts are decided in the
 * order the screen lists them, and a рахунок an earlier proposal spoke for is not offered to a
 * later one. Without that, two cards would both be proposed onto one рахунок and the second link
 * would be refused after the owner had accepted it.
 *
 * Pure and total: the same input decides the same proposals, and nothing here writes anything.
 */
export function suggestLinks(input: {
  readonly monobankAccounts: readonly ProposableMonobankAccount[];
  readonly accounts: readonly Account[];
  readonly links: readonly MonobankLink[];
}): LinkProposal[] {
  const linkedMonobank = new Set(input.links.map((link) => link.monobankAccountId));
  const taken = new Set(input.links.map((link) => link.accountId));
  const free = activeAccounts(input.accounts).filter((a) => !taken.has(a.id));

  const ordered = [...input.monobankAccounts]
    .filter((a) => !linkedMonobank.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'uk') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const spokenFor = new Set<string>();
  return ordered.map((monobankAccount) => {
    const scored = free
      .filter((a) => a.currency === monobankAccount.currency && !spokenFor.has(a.id))
      .map((a) => ({ account: a, evidence: nameEvidence(monobankAccount.name, a.name) }))
      .filter((c): c is { account: Account; evidence: NameEvidence } => c.evidence !== undefined)
      .sort(
        (a, b) =>
          EVIDENCE_STRENGTH[b.evidence] - EVIDENCE_STRENGTH[a.evidence] ||
          a.account.name.localeCompare(b.account.name, 'uk') ||
          (a.account.id < b.account.id ? -1 : a.account.id > b.account.id ? 1 : 0),
      );

    const [best] = scored;
    if (!best) {
      return { kind: 'new', monobankAccountId: monobankAccount.id };
    }
    const top = scored.filter(
      (c) => EVIDENCE_STRENGTH[c.evidence] === EVIDENCE_STRENGTH[best.evidence],
    );
    if (top.length > 1) {
      return {
        kind: 'ambiguous',
        monobankAccountId: monobankAccount.id,
        candidateIds: top.map((c) => c.account.id),
      };
    }
    spokenFor.add(best.account.id);
    return {
      kind: 'existing',
      monobankAccountId: monobankAccount.id,
      accountId: best.account.id,
      evidence: best.evidence,
    };
  });
}
