import { render } from "astro:content";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { ArticleEntry } from "./articles";
import { articleCardData } from "./article-card-data";
import { firstImageFromHtml } from "./first-image";

export async function featuredArticleData(entry: ArticleEntry) {
  const card = await articleCardData(entry);

  // Astro resolves article-relative images and emits their GitHub Pages asset URLs.
  const { Content } = await render(entry);
  const container = await AstroContainer.create();
  const thumbnail = firstImageFromHtml(await container.renderToString(Content));
  return { ...card, thumbnail: thumbnail ?? null };
}
export type FeaturedArticleData = Awaited<ReturnType<typeof featuredArticleData>>;
