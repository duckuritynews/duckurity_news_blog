import { getImage } from "astro:assets";
import { render } from "astro:content";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { articleRanks, type ArticleEntry } from "./articles";
import { articleUrl } from "./urls";
import { extractCveIds } from "./search";
import { firstImageFromHtml } from "./first-image";

async function articleThumbnail(entry: ArticleEntry) {
  const { data } = entry;
  if (data.cover) {
    const image = await getImage({ src: data.cover, width: Math.min(960, data.cover.width) });
    return { src: image.src, width: Number(image.attributes.width), height: Number(image.attributes.height), alt: data.coverAlt ?? "" };
  }
  // Render Markdown so Astro resolves article-relative images and the site's asset base.
  const { Content } = await render(entry);
  const container = await AstroContainer.create();
  return firstImageFromHtml(await container.renderToString(Content)) ?? null;
}

export async function articleCardData(entry: ArticleEntry) {
  const { data } = entry;
  return {
    slug: data.slug, href: articleUrl(data.slug), title: data.title, summary: data.summary,
    publishedAt: data.publishedAt, tags: data.tags, level: data.level ?? "",
    thumbnail: await articleThumbnail(entry),
  };
}
export type ArticleCardData = Awaited<ReturnType<typeof articleCardData>>;

export async function articleCatalog(entries: ArticleEntry[]) {
  const ranks = articleRanks(entries);
  return Promise.all(entries.map(async (entry) => {
    const { data, body } = entry;
    return {
      ...await articleCardData(entry), authors: data.authors,
      cveIds: [...new Set([...data.cveIds.map((id) => id.toUpperCase()), ...extractCveIds(body ?? "", data.title, data.summary, ...data.tags, ...data.searchAliases)])],
      ...ranks.get(data.slug)!,
    };
  }));
}
