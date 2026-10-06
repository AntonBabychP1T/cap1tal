import { asc } from 'drizzle-orm';

import { merchantIndex } from '../domain/merchants';
import { TEMPLATE_GROUPS, templateTargetOf } from '../domain/rule-template';
import {
  countUncategorisedExpenses,
  countUnsourcedIncomes,
  sweepUncategorised,
  sweepUnsourced,
  templateRules,
  type Rule,
  type RuleTiers,
} from '../domain/rules';
import { storeTransferPairing } from './counterpart-income-repo';
import { toRule } from './mappers';
import { accounts, categories, ruleTemplateChoices, rules } from './schema';
import { storedMerchants } from './stored-merchants';
import type { Storage } from './storage';
import { transactionsRepo } from './transactions-repo';

/**
 * What decides a категорія, read from storage in one place (rule-template design T4): the owner's
 * правила, and the шаблон as rules on the targets this device resolves for it. Every caller that
 * decides a категорія — the monobank sync, the notification drain, the entry form, every розбір —
 * reads this, because one that read the правила alone would silently lose the шаблон.
 *
 * And the розбір itself, which storing a правило, changing the mapping and the first open under a
 * new шаблон version all run (design T5) — one body, so none of the three can drift.
 */

/**
 * What a розбір did: the «Без категорії» витрати it looked at, how many it moved onto a
 * категорія, how many it turned into перекази, how many зустрічні доходи those absorbed, the
 * доходи «Без джерела» it looked at and how many of them it gave a джерело.
 */
export interface SweepCounts {
  readonly examined: number;
  readonly moved: number;
  readonly transferred: number;
  readonly absorbed: number;
  readonly incomesExamined: number;
  readonly incomesSourced: number;
}

/** The two tiers as storage holds them right now — `templateRules` always present. */
export interface CategorisationContext extends RuleTiers {
  readonly templateRules: readonly Rule[];
}

/**
 * Базова категорія → the категорія id it lands in on this device (design T3): the owner's choice
 * when one is stored, the типова категорія otherwise. Left out entirely when switched off, and when
 * the target names no stored категорія — a target that does not exist matches nothing, silently,
 * rather than refusing an import or landing a витрата on an id no row carries. An archived target
 * keeps matching, exactly as a правило's archived target does.
 *
 * A stored choice for a group id the шаблон no longer carries is simply never looked up.
 */
export function templateTargets(db: Storage): Map<string, string> {
  const choices = new Map(
    db.select().from(ruleTemplateChoices).all().map((row) => [row.groupId, row.categoryId]),
  );
  const existing = new Set(db.select().from(categories).all().map((row) => row.id));
  const targets = new Map<string, string>();
  for (const group of TEMPLATE_GROUPS) {
    const target = templateTargetOf(group, choices.get(group.id));
    if (target !== undefined && existing.has(target)) {
      targets.set(group.id, target);
    }
  }
  return targets;
}

/**
 * The правила, the шаблон and the продавці, as one value every deciding caller takes — so a
 * правило naming a продавець decides wherever a категорія is decided, and no caller can match the
 * правила without recognising the опис (design M3).
 */
export function categorisationContext(db: Storage): CategorisationContext {
  return {
    rules: db.select().from(rules).orderBy(asc(rules.createdAt), asc(rules.id)).all().map(toRule),
    templateRules: templateRules(templateTargets(db)),
    merchants: merchantIndex(storedMerchants(db)),
  };
}

/**
 * The розбір, written: every stored витрата in «Без категорії» that the two tiers now recognise
 * moves onto what they give it — a категорія, or a переказ when the best правило is a
 * правило-переказ (`sweepUncategorised` decides; this writes). Call it inside the transaction of
 * the write that triggered it, so a trigger stored while its розбір failed cannot exist.
 *
 * `now` is when the trigger happened — what a переказ this pass creates is stored at.
 */
export function sweepStored(tx: Storage, now: Date): SweepCounts {
  const stored = transactionsRepo(tx).listAll();
  const knownAccounts = tx.select().from(accounts).all();
  const context = categorisationContext(tx);
  const moves = sweepUncategorised(context, stored, knownAccounts);
  // By id once, rather than a scan of the whole history per move (app-speed-pass design D9).
  const storedById = new Map(stored.map((t) => [t.id, t]));
  const write = transactionsRepo(tx);
  let transferred = 0;
  let absorbed = 0;
  for (const move of moves) {
    if (move.kind === 'category') {
      write.setCategory(move.id, move.categoryId);
      continue;
    }
    const original = storedById.get(move.id);
    if (original === undefined || original.type !== 'expense') {
      continue;
    }
    const result = storeTransferPairing(
      tx,
      {
        type: 'transfer',
        id: original.id,
        date: original.date,
        fromAccountId: original.accountId,
        toAccountId: move.toAccountId,
        left: original.amount,
        arrived: original.amount,
        ...(original.description ? { description: original.description } : {}),
        ...(original.mcc !== undefined ? { mcc: original.mcc } : {}),
      },
      now,
    );
    transferred += 1;
    if (result.absorbed) absorbed += 1;
  }
  // The доходи after the витрати: re-read, so a зустрічний дохід a new переказ absorbed above is
  // gone and can never be given a джерело (categorisation-rules, "Absorption comes before sourcing").
  const afterMoves = moves.some((m) => m.kind === 'transfer') ? transactionsRepo(tx).listAll() : stored;
  const sourced = sweepUnsourced(context, afterMoves);
  for (const move of sourced) {
    write.setSource(move.id, move.sourceId);
  }
  return {
    examined: countUncategorisedExpenses(stored),
    moved: moves.filter((m) => m.kind === 'category').length,
    transferred,
    absorbed,
    incomesExamined: countUnsourcedIncomes(afterMoves),
    incomesSourced: sourced.length,
  };
}
