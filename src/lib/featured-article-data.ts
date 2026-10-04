import type { ArticleEntry } from "./articles";
import { articleCardData } from "./article-card-data";

export async function featuredArticleData(entry: ArticleEntry) {
  return articleCardData(entry);
}
export type FeaturedArticleData = Awaited<ReturnType<typeof featuredArticleData>>;
