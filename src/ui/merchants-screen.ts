import type { Href } from 'expo-router';

import { foldCase } from '../domain/fold';
import {
  foldSpelling,
  merchantNameKey,
  proposeMerchant,
  type Merchant,
  type MerchantIndex,
} from '../domain/merchants';
import { isRefusal } from '../domain/refusal';
import type { Transaction } from '../domain/transaction';
import type { SweepCounts } from '../db/rules-repo';
import { byName, plural, transactionCount } from './labels';
import { sweepSaid, sweepStep } from './list-management';

/**
 * What the «Продавці» section of Налаштування shows and decides (merchants-screen capability,
 * design M10): «Без продавця», the list of продавці, the one naming form every way in opens, and a
 * продавець's own screen. Pure, so `verify` proves every decision; the screens are the wiring.
 */

/** How many «Без продавця» rows are listed before the rest is only counted. */
export const NAMELESS_LIMIT = 20;

/** One row of «Без продавця»: the описи the proposal gives one написання, as one group. */
export interface NamelessGroup {
  /** The написання the proposal gives every опис of the group — what keys it. */
  readonly spelling: string;
  /** The опис of the group's latest транзакція, as stored — what the row shows and names from. */
  readonly description: string;
  readonly count: number;
}

/**
 * The витрати and повернення whose опис no продавець recognises, grouped by the написання the
 * proposal gives that опис: «АТБ-Маркет 1234» and «АТБ-Маркет 5678» are one row for «атб». Most
 * транзакції first; a tie goes to the group whose latest транзакція is the most recent. A дохід, a
 * переказ and a коригування are not listed: the list is about who the owner paid.
 *
 * `transactions` come newest first — `storedHistory`'s order, the latest listing's (date, then
 * recording moment, then id) — so the first транзакція of a group seen is its latest, and its
 * position is that транзакція's place in the order.
 */
export function namelessGroups(
  transactions: readonly Transaction[],
  index: MerchantIndex,
): { readonly groups: readonly NamelessGroup[]; readonly more: number } {
  const groups = new Map<string, { description: string; count: number; latest: number }>();
  transactions.forEach((t, position) => {
    if (t.type !== 'expense' && t.type !== 'refund') return;
    if (!t.description || index.recognise(t.description) !== undefined) return;
    const spelling = proposeMerchant(t.description)?.spelling;
    if (spelling === undefined) return;
    const group = groups.get(spelling);
    if (group) {
      group.count += 1;
    } else {
      groups.set(spelling, { description: t.description, count: 1, latest: position });
    }
  });
  const ordered = [...groups]
    .sort(([, a], [, b]) => b.count - a.count || a.latest - b.latest)
    .map(([spelling, g]) => ({ spelling, description: g.description, count: g.count }));
  return { groups: ordered.slice(0, NAMELESS_LIMIT), more: Math.max(0, ordered.length - NAMELESS_LIMIT) };
}

/** What «Без продавця» says instead of a list when nothing is nameless. */
export const EVERYTHING_RECOGNISED = 'Кожен опис уже має продавця.';

/** «…і ще 3» under the twenty rows, or nothing when there are no more. */
export function namelessMore(more: number): string | undefined {
  return more > 0 ? `І ще ${more} ${plural(more, 'опис', 'описи', 'описів')} без продавця.` : undefined;
}

/** One row of the продавці list: its назва and how many stored транзакції are recognised as it. */
export interface MerchantRow {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  /** «12 транзакцій», ready to draw. */
  readonly countLabel: string;
}

/**
 * Every продавець with how many stored транзакції — of any type — its написання recognise, by назва
 * with letter case folded. The count is what makes a написання written too broadly visible where
 * it is managed (design, "A broad написання recognises too much").
 */
export function merchantRows(
  merchants: readonly Merchant[],
  transactions: readonly Transaction[],
  index: MerchantIndex,
): MerchantRow[] {
  const counts = new Map<string, number>();
  for (const t of transactions) {
    const recognised = index.recognise(t.description)?.merchantId;
    if (recognised !== undefined) counts.set(recognised, (counts.get(recognised) ?? 0) + 1);
  }
  // `byName`: the way every list of the owner's own names is ordered — as Ukrainian orders names,
  // which folds letter case and puts «АТБ» before «Uklon».
  return [...merchants]
    .sort(byName)
    .map((m) => {
      const count = counts.get(m.id) ?? 0;
      return { id: m.id, name: m.name, count, countLabel: transactionCount(count) };
    });
}

/** What the list says with no продавець stored, pointing at where they are named. */
export const NO_MERCHANTS_YET = 'Ще жодного продавця. Назвіть першого з «Без продавця» вище.';

/** The naming form: the опис it names from, and the назва and написання as the owner edits them. */
export interface NamingForm {
  readonly description: string;
  readonly name: string;
  readonly spelling: string;
}

/**
 * The form opened on an опис: the proposal the merchants capability makes from it, unless the form
 * is opened holding another proposal (the follow-up local model's) — validated the same either way.
 */
export function namingFormFor(
  description: string,
  proposal?: { readonly name: string; readonly spelling: string },
): NamingForm {
  const proposed = proposal ?? proposeMerchant(description) ?? { name: '', spelling: '' };
  return { description, name: proposed.name, spelling: proposed.spelling };
}

/** The refusals the form shows, each beside the field it concerns. */
export interface NamingErrors {
  readonly name?: string;
  readonly spelling?: string;
  /** A назва another продавець has: the form offers adding the написання to that one instead. */
  readonly takenBy?: { readonly id: string; readonly name: string };
}

/**
 * What stands in the way of storing the form, said in Ukrainian beside its field — or nothing. For
 * «Зберегти» (`into` new) the назва is checked too; for «Додати до наявного» only the написання is,
 * since the назва that stands is the existing продавець's.
 */
export function namingErrors(
  form: NamingForm,
  merchants: readonly Merchant[],
  into: 'new' | 'existing',
): NamingErrors {
  const errors: { name?: string; spelling?: string; takenBy?: { id: string; name: string } } = {};
  if (into === 'new') {
    if (form.name.trim() === '') {
      errors.name = 'Назва не може бути порожньою';
    } else {
      const key = merchantNameKey(form.name);
      const holder = merchants.find((m) => merchantNameKey(m.name) === key);
      if (holder) {
        errors.name = `«${holder.name}» уже є — можна додати написання до нього`;
        errors.takenBy = { id: holder.id, name: holder.name };
      }
    }
  }
  const spelling = foldSpelling(form.spelling);
  if (spelling === '') {
    errors.spelling = 'Написання не може бути порожнім';
  } else {
    const holder = merchants.find((m) => m.spellings.some((s) => s.spelling === spelling));
    if (holder) {
      errors.spelling = `Це написання вже має «${holder.name}»`;
    } else if (!foldCase(form.description).includes(spelling)) {
      errors.spelling = 'Написання має бути частиною опису';
    }
  }
  return errors;
}

/** Where the stored продавець lands: a new one, or the one the picker chose. */
export type NamingTarget =
  | { readonly kind: 'new' }
  | { readonly kind: 'existing'; readonly merchantId: string };

/** What storing needs: the repository's `name`, ids and the moment. Ports, so this stays pure. */
export interface NamingPorts {
  readonly name: (input: {
    readonly description: string;
    readonly spelling: string;
    readonly spellingId: string;
    readonly into:
      | { readonly kind: 'new'; readonly id: string; readonly name: string }
      | { readonly kind: 'existing'; readonly merchantId: string };
    readonly now: Date;
  }) => SweepCounts;
  readonly newId: () => string;
  readonly now: () => Date;
}

/** The answer to «Зберегти» or «Додати до наявного»: stored, with what the розбір moved, or refused. */
export type NamingOutcome =
  | { readonly kind: 'stored'; readonly said?: string }
  | { readonly kind: 'refused'; readonly errors: NamingErrors };

/**
 * Stores the form, or says why not (merchants-screen, "One naming form names a продавець from an
 * опис"). Refused in words beside the field before anything is written; a refusal the repository
 * still makes — a write raced from elsewhere — comes back beside the field it concerns too. The
 * розбір that follows is one журнал operation of counts, and what it moved is said as storing a
 * правило says it; a pass that moved nothing says nothing.
 */
export async function submitNaming(
  form: NamingForm,
  target: NamingTarget,
  merchants: readonly Merchant[],
  ports: NamingPorts,
): Promise<NamingOutcome> {
  const errors = namingErrors(form, merchants, target.kind);
  if (errors.name !== undefined || errors.spelling !== undefined) {
    return { kind: 'refused', errors };
  }
  try {
    const counts = await sweepStep('merchants/name', () =>
      ports.name({
        description: form.description,
        spelling: form.spelling,
        spellingId: ports.newId(),
        into:
          target.kind === 'new'
            ? { kind: 'new', id: ports.newId(), name: form.name }
            : { kind: 'existing', merchantId: target.merchantId },
        now: ports.now(),
      }),
    );
    const said = sweepSaid(counts);
    return said === undefined ? { kind: 'stored' } : { kind: 'stored', said };
  } catch (error) {
    if (isRefusal(error)) {
      // The repository's sentences about the написання and the опис belong beside the написання;
      // the rest — a назва taken meanwhile, a продавець gone — beside the назва.
      const aboutSpelling = /^Написання|опис/i.test(error.message);
      return { kind: 'refused', errors: aboutSpelling ? { spelling: error.message } : { name: error.message } };
    }
    throw error;
  }
}

/** One написання on a продавець's screen, and whether removing it is offered. */
export interface SpellingRow {
  readonly id: string;
  readonly spelling: string;
  readonly removable: boolean;
}

/**
 * A продавець's написання as its screen lists them: removing one is offered only while more than
 * one is held — the last one goes with the продавець, deleted instead.
 */
export function spellingRows(merchant: Merchant): SpellingRow[] {
  const removable = merchant.spellings.length > 1;
  return merchant.spellings.map((s) => ({ id: s.id, spelling: s.spelling, removable }));
}

/** A new назва's refusal, in words — the naming form's rules, the продавець's own назва excepted. */
export function renameError(name: string, merchant: Merchant, merchants: readonly Merchant[]): string | undefined {
  if (name.trim() === '') return 'Назва не може бути порожньою';
  const key = merchantNameKey(name);
  const holder = merchants.find((m) => m.id !== merchant.id && merchantNameKey(m.name) === key);
  return holder ? `«${holder.name}» уже є` : undefined;
}

/** The написання to add from the продавець's screen: any, as long as no продавець holds it. */
export function addedSpellingError(text: string, merchants: readonly Merchant[]): string | undefined {
  const spelling = foldSpelling(text);
  if (spelling === '') return 'Написання не може бути порожнім';
  const holder = merchants.find((m) => m.spellings.some((s) => s.spelling === spelling));
  return holder ? `Це написання вже має «${holder.name}»` : undefined;
}

/**
 * What «Обʼєднати з…» asks before it happens: both продавці by назва, and what moves — every
 * написання and every правило of the first — and which назва stands.
 */
export function mergeConfirmation(from: Merchant, into: Merchant, rulesMoving: number): string {
  const spellings = from.spellings.map((s) => `«${s.spelling}»`).join(', ');
  const rules =
    rulesMoving > 0
      ? ` і ${rulesMoving} ${plural(rulesMoving, 'правило', 'правила', 'правил')}, що його називають,`
      : '';
  return (
    `«${from.name}» стане частиною «${into.name}»: до «${into.name}» перейдуть написання ${spellings}${rules} ` +
    `а «${from.name}» зникне. Назва лишиться «${into.name}».`
  );
}

/**
 * What «Видалити» does: refused while правила name the продавець — saying how many, and leading to
 * «Правила» — or a confirmation that says what deleting changes and what it does not.
 */
export function deleteOutcome(
  merchant: Merchant,
  rulesNaming: number,
): { readonly kind: 'refused'; readonly message: string; readonly leadsTo: Href } | { readonly kind: 'confirm'; readonly message: string } {
  if (rulesNaming > 0) {
    return {
      kind: 'refused',
      message: `«${merchant.name}» називають ${rulesNaming} ${plural(rulesNaming, 'правило', 'правила', 'правил')}. Спершу змініть або видаліть їх у «Правилах».`,
      leadsTo: '/manage/rules',
    };
  }
  return {
    kind: 'confirm',
    message: `Написання «${merchant.name}» зникнуть разом із ним. Транзакції лишаться як є, з категоріями, які вже мають.`,
  };
}

/** «Транзакції» of one продавець: the list narrowed to it, an initial value the owner can take off. */
export function merchantTransactionsHref(merchantId: string): Href {
  return { pathname: '/transactions', params: { merchant: merchantId } };
}

/**
 * The «Продавець» row of transaction editing (main-screen, "Editing names the транзакція's
 * продавець"): the продавець the stored опис is recognised as, which opens its screen; «Назвати
 * продавця» when it is recognised as none; and no row at all without an опис.
 */
export type MerchantRowOfTransaction =
  | { readonly kind: 'recognised'; readonly merchantId: string; readonly name: string }
  | { readonly kind: 'nameless'; readonly form: NamingForm };

export function transactionMerchantRow(
  description: string | undefined,
  index: MerchantIndex,
): MerchantRowOfTransaction | undefined {
  if (!description) return undefined;
  const recognised = index.recognise(description);
  if (recognised) return { kind: 'recognised', merchantId: recognised.merchantId, name: recognised.name };
  return { kind: 'nameless', form: namingFormFor(description) };
}

/** A rename, an added написання and the like said once they are stored: what the розбір moved. */
export async function changeAndSay(name: string, change: () => SweepCounts): Promise<string | undefined> {
  return sweepSaid(await sweepStep(`merchants/${name}`, change));
}
