import { isReservedSource, type Source } from '../domain/category';
import { namedListRepo } from './named-list-repo';
import { sources } from './schema';
import type { Storage } from './storage';

/**
 * Джерела доходу in storage. Speaks domain `Source`s only — rows never leave this module.
 *
 * The same list rules as the категорії, and literally the same code (`namedListRepo`): the
 * categories capability writes them once for both lists. One джерело is reserved — «Відсотки»,
 * which the відсотки proposal picks by id when a repayment exceeds the principal — so it refuses
 * a rename and an archive exactly as «Комісія» does on the other list.
 */
export function sourcesRepo(db: Storage) {
  return namedListRepo<Source>(db, sources, {
    nominative: 'джерело',
    genitive: 'джерела',
    refusal: (name, verb) => `«${name}» — службове джерело, його не можна ${verb}`,
  }, isReservedSource);
}

export type SourcesRepo = ReturnType<typeof sourcesRepo>;
