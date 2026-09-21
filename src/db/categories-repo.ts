import { and, asc, eq } from 'drizzle-orm';

import { isReservedCategory, type Category } from '../domain/category';
import {
  isPickableCategoryIcon,
  RESERVED_CATEGORY_ICONS,
  startingCategoryIcon,
  type CategoryIconKey,
} from '../domain/category-icon';
import { listName } from './named-list-repo';
import { categories } from './schema';
import type { Storage } from './storage';

/** Category storage differs from sources only in its persisted app-owned icon key. */
export function categoriesRepo(db: Storage) {
  const toCategory = (row: typeof categories.$inferSelect): Category => ({
    id: row.id,
    name: row.name,
    archived: row.archived,
    ...(row.iconKey === null ? {} : { iconKey: row.iconKey }),
  });

  function load(id: string): typeof categories.$inferSelect {
    const row = db.select().from(categories).where(eq(categories.id, id)).get();
    if (!row) throw new Error(`категорії «${id}» не існує`);
    return row;
  }

  function rejectDuplicate(name: string, exceptId?: string): void {
    const duplicate = db.select().from(categories).where(and(eq(categories.archived, false), eq(categories.name, name))).all()
      .some((row) => row.id !== exceptId);
    if (duplicate) throw new Error(`категорія «${name}» вже існує`);
  }

  function checkedIcon(id: string, name: string, value?: string): CategoryIconKey {
    const fixed = RESERVED_CATEGORY_ICONS[id];
    if (fixed) {
      if (value !== undefined && value !== fixed) throw new Error('службову категорію не можна змінити');
      return fixed;
    }
    const icon = value ?? startingCategoryIcon({ id, name });
    if (!isPickableCategoryIcon(icon)) throw new Error('такої іконки категорії не існує');
    return icon;
  }

  function update(id: string, input: { name: string; iconKey?: string }): void {
    const row = load(id);
    if (isReservedCategory(id)) throw new Error(`«${row.name}» — службова категорія, її не можна змінити`);
    const name = listName(input.name);
    rejectDuplicate(name, id);
    const iconKey = checkedIcon(id, name, input.iconKey ?? row.iconKey ?? startingCategoryIcon(row));
    db.transaction((tx) => {
      tx.update(categories).set({ name, iconKey }).where(eq(categories.id, id)).run();
    }, { behavior: 'immediate' });
  }

  return {
    list(): Category[] {
      return db.select().from(categories).orderBy(asc(categories.name), asc(categories.id)).all().map(toCategory);
    },
    get(id: string): Category | undefined {
      const row = db.select().from(categories).where(eq(categories.id, id)).get();
      return row ? toCategory(row) : undefined;
    },
    create(input: { id: string; name: string; iconKey?: string }): Category {
      const name = listName(input.name);
      rejectDuplicate(name);
      const iconKey = checkedIcon(input.id, name, input.iconKey);
      db.insert(categories).values({ id: input.id, name, iconKey }).run();
      return { id: input.id, name, iconKey, archived: false };
    },
    /** Name and icon are committed together so a refused rename cannot half-change the tile. */
    update,
    rename(id: string, name: string): void {
      const row = load(id);
      update(id, { name, iconKey: row.iconKey ?? undefined });
    },
    archive(id: string): void {
      const row = load(id);
      if (isReservedCategory(id)) throw new Error(`«${row.name}» — службова категорія, її не можна архівувати`);
      db.update(categories).set({ archived: true }).where(eq(categories.id, id)).run();
    },
    unarchive(id: string): void {
      const row = load(id);
      rejectDuplicate(row.name, id);
      db.update(categories).set({ archived: false }).where(eq(categories.id, id)).run();
    },
  };
}

export type CategoriesRepo = ReturnType<typeof categoriesRepo>;
