export type ArticleSort = "latest" | "oldest" | "title";
export type ArchiveView = "cards" | "list";
export const archivePageSizes = { cards: 18, list: 20 } as const;
export function normalizeView(value: string | null | undefined): ArchiveView { return value === "list" ? "list" : "cards"; }

export interface SortableArticle {
  slug: string;
  title: string;
  publishedAt: string;
}

const koreanTitleOrder = new Intl.Collator("ko", {
  numeric: true,
  sensitivity: "base",
});

function slugOrder(a: SortableArticle, b: SortableArticle): number {
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

export function compareArticles(
  a: SortableArticle,
  b: SortableArticle,
  sort: ArticleSort,
): number {
  if (sort === "title") {
    const byTitle = koreanTitleOrder.compare(
      a.title.normalize("NFC"),
      b.title.normalize("NFC"),
    );
    return byTitle || slugOrder(a, b);
  }
  const byDate = Date.parse(a.publishedAt) - Date.parse(b.publishedAt);
  return (sort === "latest" ? -byDate : byDate) || slugOrder(a, b);
}

export function sortArticles<T extends SortableArticle>(
  articles: readonly T[],
  sort: ArticleSort,
): T[] {
  return [...articles].sort((a, b) => compareArticles(a, b, sort));
}

export function normalizeSort(value: string | null | undefined): ArticleSort {
  return value === "oldest" || value === "title" ? value : "latest";
}

export function paginate<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize = 10,
): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Number.isInteger(requestedPage)
    ? Math.min(Math.max(1, requestedPage), pageCount)
    : 1;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageCount };
}

export function assignSortRanks<T extends SortableArticle>(
  articles: readonly T[],
): Map<string, { latestRank: number; oldestRank: number; titleKoRank: number }> {
  const ranks = new Map<string, { latestRank: number; oldestRank: number; titleKoRank: number }>();
  const latest = sortArticles(articles, "latest");
  const oldest = sortArticles(articles, "oldest");
  const title = sortArticles(articles, "title");
  latest.forEach((article, latestRank) => {
    ranks.set(article.slug, { latestRank, oldestRank: -1, titleKoRank: -1 });
  });
  oldest.forEach((article, oldestRank) => {
    ranks.get(article.slug)!.oldestRank = oldestRank;
  });
  title.forEach((article, titleKoRank) => {
    ranks.get(article.slug)!.titleKoRank = titleKoRank;
  });
  return ranks;
}
