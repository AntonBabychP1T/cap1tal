import type { Source } from '../domain/category';
import { namedListRepo } from './named-list-repo';
import { sources } from './schema';
import type { Storage } from './storage';

/**
 * Джерела доходу in storage. Speaks domain `Source`s only — rows never leave this module.
 *
 * The same list rules as the категорії, and literally the same code (`namedListRepo`): the
 * categories capability writes them once for both lists. The one difference is that no джерело is
 * reserved — nothing in the domain refers to one by id — so nothing here refuses a rename or an
 * archive.
 */
export function sourcesRepo(db: Storage) {
  return namedListRepo<Source>(db, sources, {
    nominative: 'джерело',
    genitive: 'джерела',
    // No джерело is reserved, so nothing ever reads this; it is here because the type asks for a
    // whole sentence rather than a fragment, and a fragment is what would be wrong later.
    refusal: (name, verb) => `«${name}» — службове джерело, його не можна ${verb}`,
  });
}

export type SourcesRepo = ReturnType<typeof sourcesRepo>;
