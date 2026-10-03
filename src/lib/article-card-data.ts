import { getImage } from "astro:assets";
import { articleRanks, type ArticleEntry } from "./articles";
import { articleUrl } from "./urls";
import { extractCveIds } from "./search";

export async function articleCardData({ data }: ArticleEntry) {
  const image = data.cover ? await getImage({ src: data.cover, width: Math.min(960, data.cover.width) }) : undefined;
  return {
    slug: data.slug, href: articleUrl(data.slug), title: data.title, summary: data.summary,
    publishedAt: data.publishedAt, tags: data.tags, level: data.level ?? "",
    thumbnail: image ? { src: image.src, width: Number(image.attributes.width), height: Number(image.attributes.height), alt: data.coverAlt ?? "" } : null,
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
