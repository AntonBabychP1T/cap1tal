import { money, type CurrencyCode, type Money } from '../domain/money';
import { isoDate, type IsoDate, type Month } from '../domain/transaction';

/**
 * The three values that cross the storage boundary: an earned **досягнення** with its
 * **свідчення**, the owner's decision about a **виклик**, and a confirmed **місячна норма витрат**.
 *
 * They live here rather than in `catalogue.ts` because storage, the бекап and the screens all
 * speak them while none of them needs the catalogue — and because the свідчення's encoding is the
 * one thing about a досягнення that must survive a rewrite of every template.
 */

/**
 * The **свідчення**: the number that justified a досягнення at the moment it was earned, in one of
 * a closed set of shapes (design D3).
 *
 * It is frozen — «what was true then» — and nothing in the app reads it as money: no сума, no
 * місячна картина, no ліміт, no ціль and no звіт takes a value from it. `money` is a `Money` here
 * for one reason only: a сума without its currency code beside it is not representable anywhere in
 * this app, and a свідчення is not the place to start.
 *
 * The `kind` tag is this module's, not the spec's: D3 lists the shapes by their fields, and a tag
 * is how a hand-edited бекап is told apart from a value this app wrote, instead of being guessed
 * at by which keys happen to be present.
 */
export type Evidence =
  | { readonly kind: 'count'; readonly count: number }
  | { readonly kind: 'months'; readonly months: number; readonly from: Month; readonly to: Month }
  | { readonly kind: 'money'; readonly money: Money }
  | { readonly kind: 'month'; readonly month: Month }
  /**
   * The ціль a досягнення is about — its identifier and the назва it carried at that moment. The
   * назва is frozen with the rest of the свідчення so a досягнення about a ціль the owner has since
   * deleted or renamed still says which ціль it was.
   */
  | { readonly kind: 'goal'; readonly goalId: string; readonly name: string };

/** An earned досягнення as it is stored and read back. */
export interface EarnedAchievement {
  /** The stable key, carrying every parameter that makes the fact distinct. */
  readonly key: string;
  /** The catalogue entry the key belongs to, kept so a retired template still renders. */
  readonly template: string;
  /** The дата досягнення — the history's own date, or the day the app recorded it (design D4). */
  readonly achievedOn: IsoDate;
  readonly recordedAtMs: number;
  /** Absent while the owner has not been shown it. Never a sentinel moment. */
  readonly seenAtMs?: number;
  readonly evidence: Evidence;
}

/** The two words the owner has about a виклик, and no third state. */
export type ChallengeVerdict = 'accepted' | 'dismissed';

/**
 * What the owner decided about one виклик, and when — the only thing about a виклик that is ever
 * stored. Its progress and whether it is finished are recomputed every time it is shown.
 */
export interface ChallengeDecision {
  readonly key: string;
  readonly decision: ChallengeVerdict;
  readonly decidedAtMs: number;
}

/** One confirmed місячна норма витрат. The сума carries the currency it is a норма of. */
export interface SpendingNorm {
  readonly amount: Money;
  readonly confirmedAtMs: number;
}

/** The норми by currency — how the engine and the screens ask «does this currency have one». */
export type SpendingNorms = ReadonlyMap<CurrencyCode, SpendingNorm>;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthAt(value: unknown): Month {
  if (typeof value !== 'string' || !MONTH.test(value)) {
    throw new Error(`свідчення називає «${String(value)}», що не є календарним місяцем`);
  }
  return value;
}

function countAt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`свідчення називає «${String(value)}», що не є кількістю`);
  }
  return value;
}

/**
 * The свідчення as the text storage holds. Deterministic — the keys are written in a fixed order —
 * so re-encoding an unchanged свідчення produces the same string and a бекап of an unchanged
 * device stays byte for byte the same.
 */
export function encodeEvidence(evidence: Evidence): string {
  switch (evidence.kind) {
    case 'count':
      return JSON.stringify({ kind: 'count', count: evidence.count });
    case 'months':
      return JSON.stringify({
        kind: 'months',
        months: evidence.months,
        from: evidence.from,
        to: evidence.to,
      });
    case 'money':
      return JSON.stringify({
        kind: 'money',
        amount: evidence.money.amount,
        currency: evidence.money.currency,
      });
    case 'month':
      return JSON.stringify({ kind: 'month', month: evidence.month });
    case 'goal':
      return JSON.stringify({ kind: 'goal', goalId: evidence.goalId, name: evidence.name });
  }
}

/**
 * The stored text as a свідчення, or a throw naming what it was not.
 *
 * Total in the sense that matters: every value it returns is one this app could have written, and
 * a hand-edited бекап is refused at the boundary rather than reaching a screen. Callers that
 * merely list rows catch it and skip the row — a свідчення this build does not understand is kept
 * in storage and simply not shown, exactly as an unknown template is (design D3).
 */
export function decodeEvidence(text: string): Evidence {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('свідчення не є значенням, яке записав цей застосунок');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('свідчення не є значенням, яке записав цей застосунок');
  }
  const row = parsed as Record<string, unknown>;
  switch (row.kind) {
    case 'count':
      return { kind: 'count', count: countAt(row.count) };
    case 'months':
      return {
        kind: 'months',
        months: countAt(row.months),
        from: monthAt(row.from),
        to: monthAt(row.to),
      };
    case 'money':
      // Through the domain's own constructor: nothing may be stored as a свідчення that the
      // domain would refuse to build as money.
      return {
        kind: 'money',
        money: money(countAt(row.amount), String(row.currency)),
      };
    case 'month':
      return { kind: 'month', month: monthAt(row.month) };
    case 'goal': {
      if (typeof row.goalId !== 'string' || row.goalId.length === 0) {
        throw new Error('свідчення називає ціль без ідентифікатора');
      }
      if (typeof row.name !== 'string') {
        throw new Error('свідчення називає ціль без назви');
      }
      return { kind: 'goal', goalId: row.goalId, name: row.name };
    }
    default:
      throw new Error(`свідчення «${String(row.kind)}» не з цього застосунку`);
  }
}

/** Whether a text is a свідчення this build understands — what the бекап's parser asks. */
export function isEvidence(text: string): boolean {
  try {
    decodeEvidence(text);
    return true;
  } catch {
    return false;
  }
}

/** A досягнення the owner has not been shown yet. */
export function isUnseen(earned: EarnedAchievement): boolean {
  return earned.seenAtMs === undefined;
}

/**
 * The earned досягнення newest first by their дата досягнення, with the key breaking ties — so two
 * досягнення earned on one day are always listed in the same order, whatever order storage
 * returned them in.
 */
export function newestFirst(earned: readonly EarnedAchievement[]): EarnedAchievement[] {
  return [...earned].sort((a, b) => {
    if (a.achievedOn !== b.achievedOn) {
      return isoDate(a.achievedOn) < isoDate(b.achievedOn) ? 1 : -1;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}
