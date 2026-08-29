/**
 * Category data layer (U8).
 *
 * Builds the category navigation tree from a single flat query. A recursive
 * CTE was explicitly ruled out by the architect: the catalog only has ~8
 * categories today, so an in-memory parent -> children pass over one flat
 * `findMany` result is simpler, cheaper to reason about, and avoids a second
 * SQL dialect (recursive CTE) for a dataset this small.
 */

import { db } from "@/lib/db";
import type { Category } from "@/types/database";

export type CategoryNode = Category & { children: CategoryNode[] };

/**
 * Fetch every active category and assemble it into a parent -> children
 * tree, ordered by `sortOrder` at every level. Root categories (no parent,
 * or a parent that isn't itself active/returned) are returned as the
 * top-level array.
 */
export async function getCategories(): Promise<CategoryNode[]> {
  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  // Single pass: create a node per category, keyed by id.
  const nodesById = new Map<string, CategoryNode>();
  for (const category of categories) {
    nodesById.set(category.id, { ...category, children: [] });
  }

  // Second pass: attach each node to its parent's `children`, or treat it as
  // a root if it has no parent or the parent wasn't fetched (e.g. inactive).
  const roots: CategoryNode[] = [];
  for (const category of categories) {
    const node = nodesById.get(category.id)!;
    const parent = category.parentId ? nodesById.get(category.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
