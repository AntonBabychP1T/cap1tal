import { and, asc, eq } from 'drizzle-orm';

import { categories, sources } from './schema';
import type { Storage } from './storage';

/**
 * The one implementation of a категорії/джерела list in storage. The categories capability states
 * its rules once — "a name empty after trimming is rejected", "a name equal to another unarchived
 * row of the same list is rejected", "unarchiving obeys the same rule a rename does" — and this is
 * where they live, so the next change to them lands in one place rather than in two files that
 * happen to agree today.
 *
 * Two rules the database cannot hold are here because this repository is the only writer
 * (design decisions 5 and 6): uniqueness among the *unarchived* rows, which no portable partial
 * unique index expresses; and reserved rows refusing a rename or an archive, since reservedness is
 * a set of ids in the domain and deliberately not a column.
 *
 * No colocated test, on purpose: it has no behaviour of its own to prove, and `categories-repo`
 * and `sources-repo` each exercise it in full against their own half of the capability's
 * requirements — twice over, in the two shapes it is used in.
 */

/** The shape both lists share — the domain's `Category` and `Source` are this, named apart. */
export interface NamedRow {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
}

/** The two tables of this shape. Naming them keeps the factory closed rather than generic. */
type NamedListTable = typeof categories | typeof sources;

/**
 * How this list is named in what the owner reads. `failureMessage` puts these sentences into an
 * Alert verbatim, so they are Ukrainian and they name the list they are about.
 */
export interface ListWords {
  /** «категорія» / «джерело» — the subject of "… already exists". */
  readonly nominative: string;
  /** «категорії» / «джерела» — the subject of "there is no …". */
  readonly genitive: string;
  /**
   * How a reserved row is refused, whole: "«Комісія» — службова категорія, її не можна
   * перейменувати". The clause carries its own pronoun because the two lists do not share a
   * gender — a категорія is «її», a джерело «його» — and a sentence the owner reads has to be a
   * sentence. Only a list with reserved rows ever shows it.
   */
  readonly refusal: (name: string, verb: string) => string;
}

/**
 * `Row` is the domain name of what this list holds — `Category` or `Source`. The two are
 * `NamedRow` under different names, which is what lets one implementation serve both while each
 * repository still speaks its own domain type outward.
 */
export function namedListRepo<Row extends NamedRow>(
  db: Storage,
  table: NamedListTable,
  words: ListWords,
  /** Which ids the domain refuses to let the owner rename or archive; no list is forced to have any. */
  isReserved: (id: string) => boolean = () => false,
) {
  const toRow = (row: { id: string; name: string; archived: boolean }): Row =>
    ({ id: row.id, name: row.name, archived: row.archived }) as Row;

  function load(id: string): Row {
    const row = db.select().from(table).where(eq(table.id, id)).get();
    if (!row) {
      throw new Error(`${words.genitive} «${id}» не існує`);
    }
    return toRow(row);
  }

  /** Names are stored trimmed, so the uniqueness rule and every display read the same string. */
  function cleanName(name: string): string {
    const trimmed = name.trim();
    if (trimmed === '') {
      throw new Error('назва не може бути порожньою');
    }
    return trimmed;
  }

  /**
   * The name is free unless an unarchived row already carries it, exactly — the owner curates
   * their own list, so case is theirs to differ in. `exceptId` is the row being written: without
   * it a rename that only changes the case or the spacing of its own name would collide with
   * itself.
   */
  function rejectDuplicate(name: string, exceptId?: string): void {
    const taken = db
      .select()
      .from(table)
      .where(and(eq(table.archived, false), eq(table.name, name)))
      .all()
      .some((row) => row.id !== exceptId);
    if (taken) {
      throw new Error(`${words.nominative} «${name}» вже існує`);
    }
  }

  function refuseReserved(row: Row, verb: string): void {
    if (isReserved(row.id)) {
      throw new Error(words.refusal(row.name, verb));
    }
  }

  return {
    /**
     * Every row, archived ones included — the management list shows them set apart. Ordered by
     * name and then by id: two rows may legally share a name, since uniqueness is only among
     * unarchived rows, and without the id the order would be whatever SQLite's sorter produced.
     */
    list(): Row[] {
      return db.select().from(table).orderBy(asc(table.name), asc(table.id)).all().map(toRow);
    },

    get(id: string): Row | undefined {
      const row = db.select().from(table).where(eq(table.id, id)).get();
      return row ? toRow(row) : undefined;
    },

    /** The id is the caller's, as everywhere else here, so an import can address the row later. */
    create(input: { id: string; name: string }): Row {
      const name = cleanName(input.name);
      rejectDuplicate(name);
      db.insert(table).values({ id: input.id, name }).run();
      return { id: input.id, name, archived: false } as Row;
    },

    /**
     * An update in place, never a delete-and-insert: the row keeps its id, so the transactions
     * that reference it keep referencing it and simply display the new name.
     */
    rename(id: string, name: string): void {
      const row = load(id);
      refuseReserved(row, 'перейменувати');
      const clean = cleanName(name);
      rejectDuplicate(clean, row.id);
      db.update(table).set({ name: clean }).where(eq(table.id, row.id)).run();
    },

    archive(id: string): void {
      const row = load(id);
      refuseReserved(row, 'архівувати');
      db.update(table).set({ archived: true }).where(eq(table.id, row.id)).run();
    },

    /**
     * Coming back into the pickers means facing the uniqueness rule again: while the row was
     * archived the owner may have created another one under its name. There is no reserved case
     * to guard — a reserved row can never be archived, so it can never need unarchiving.
     */
    unarchive(id: string): void {
      const row = load(id);
      rejectDuplicate(row.name, row.id);
      db.update(table).set({ archived: false }).where(eq(table.id, row.id)).run();
    },
  };
}
