import type { CollectionEntry } from "astro:content";
import { assignSortRanks, sortArticles, type ArticleSort } from "./article-sort";

export const buildTimestamp = new Date();

export type ArticleEntry = CollectionEntry<"articles">;

export function assertUniqueSlugs(entries: readonly ArticleEntry[]): void {
  const firstBySlug = new Map<string, ArticleEntry>();
  for (const entry of entries) {
    const first = firstBySlug.get(entry.data.slug);
    if (first) {
      throw new Error(
        `Duplicate article slug "${entry.data.slug}": ${first.id} and ${entry.id}. Slugs must stay unique across folders.`,
      );
    }
    firstBySlug.set(entry.data.slug, entry);
  }
}

export function getPublicArticles(
  entries: readonly ArticleEntry[],
  asOf: Date = buildTimestamp,
): ArticleEntry[] {
  assertUniqueSlugs(entries);
  return entries.filter((entry) => {
    const published = Date.parse(entry.data.publishedAt);
    return entry.data.draft === false && Number.isFinite(published) && published <= asOf.getTime();
  });
}

export function articleRanks(entries: readonly ArticleEntry[]) {
  return assignSortRanks(entries.map(({ data }) => ({
    slug: data.slug,
    title: data.title,
    publishedAt: data.publishedAt,
  })));
}

export function orderPublicArticles(
  entries: readonly ArticleEntry[],
  sort: ArticleSort,
): ArticleEntry[] {
  const bySlug = new Map(entries.map((entry) => [entry.data.slug, entry]));
  return sortArticles([...bySlug.values()].map(({ data }) => ({
    slug: data.slug,
    title: data.title,
    publishedAt: data.publishedAt,
  })), sort).map(({ slug }) => bySlug.get(slug)!);
}
