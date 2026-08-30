/**
 * Pure helpers over the category tree returned by getCategories()
 * (src/lib/api/categories.ts). Kept separate from the data-access layer so
 * page/component code can be unit-tested without hitting the DB.
 */

import type { CategoryNode } from "@/lib/api/categories";

/** Depth-first flatten of a category tree into a single array (parents before children). */
export function flattenCategories(nodes: CategoryNode[]): CategoryNode[] {
  const result: CategoryNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0) {
      result.push(...flattenCategories(node.children));
    }
  }
  return result;
}

/** Find a single category (at any depth) by its slug. Returns undefined if not found. */
export function findCategoryBySlug(nodes: CategoryNode[], slug: string): CategoryNode | undefined {
  return flattenCategories(nodes).find((node) => node.slug === slug);
}
