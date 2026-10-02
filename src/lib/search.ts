import { sortArticles, type ArticleSort, type SortableArticle } from "./article-sort.ts";

/** Collect complete CVE tokens from article text without accepting partial IDs. */
export function extractCveIds(...text: readonly string[]): string[] {
  return [...new Set(text.flatMap((value) => value.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? []).map((identifier) => identifier.toUpperCase()))].sort();
}

export interface SearchableArticle extends SortableArticle {
  cveIds: readonly string[];
}

/** Return a sorted exact-CVE result set, or null when the query is ordinary text. */
export function exactCveMatches<T extends SearchableArticle>(
  articles: readonly T[],
  query: string,
  sort: ArticleSort,
): T[] | null {
  const match = query.trim().match(/^CVE-\d{4}-\d{4,}$/i);
  if (!match) return null;
  const identifier = match[0].toUpperCase();
  return sortArticles(articles.filter((article) =>
    article.cveIds.some((id) => id.toUpperCase() === identifier),
  ), sort);
}
