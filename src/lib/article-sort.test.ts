import test from "node:test";
import assert from "node:assert/strict";
import { assignSortRanks, paginate, sortArticles, archivePageSizes, normalizeView, type SortableArticle } from "./article-sort.ts";
import { exactCveMatches, extractCveIds } from "./search.ts";

const articles: [SortableArticle, SortableArticle, SortableArticle, SortableArticle, SortableArticle] = [
  { slug: "alpha", title: "Article 10", publishedAt: "2026-01-01T00:00:00Z" },
  { slug: "beta", title: "Article 2", publishedAt: "2026-01-03T00:00:00Z" },
  { slug: "gamma", title: "\uD55C\uAE00", publishedAt: "2026-01-02T00:00:00Z" },
  { slug: "delta", title: "Delta", publishedAt: "2026-01-02T00:00:00Z" },
  { slug: "epsilon", title: "Echo", publishedAt: "2026-01-02T00:00:00Z" },
];
test("archive pages cap cards at 18 and list rows at 20", () => {
  assert.equal(archivePageSizes.cards, 18);
  assert.equal(archivePageSizes.list, 20);
  const items = Array.from({ length: 42 }, (_, index) => index);
  for (const [view, counts] of [["cards", [18, 18, 6]], ["list", [20, 20, 2]]] as const) {
    assert.deepEqual([1, 2, 3].map((page) => paginate(items, page, archivePageSizes[view]).items.length), counts);
    assert.deepEqual([1, 2, 3].flatMap((page) => paginate(items, page, archivePageSizes[view]).items), items);
  }
  assert.equal(normalizeView("list"), "list");
  for (const value of [null, undefined, "cards", "unknown"]) assert.equal(normalizeView(value), "cards");
});

test("latest and oldest sort dates with stable slug ties", () => {
  assert.deepEqual(sortArticles(articles, "latest").map(({ slug }) => slug), [
    "beta", "delta", "epsilon", "gamma", "alpha",
  ]);
  assert.deepEqual(sortArticles(articles, "oldest").map(({ slug }) => slug), [
    "alpha", "delta", "epsilon", "gamma", "beta",
  ]);
});

test("title sort uses Korean numeric collation and stable slug ties", () => {
  assert.deepEqual(sortArticles(articles, "title").map(({ slug }) => slug), [
    "gamma", "beta", "alpha", "delta", "epsilon",
  ]);
  const composed = { ...articles[0], slug: "composed", title: "\uD55C\uAE00" };
  const decomposed = { ...articles[0], slug: "decomposed", title: "\u1112\u1161\u11AB\u1100\u1173\u11AF" };
  assert.deepEqual(sortArticles([decomposed, composed], "title").map(({ slug }) => slug), [
    "composed", "decomposed",
  ]);
});

test("pagination slices after ordering and clamps edges", () => {
  const sorted = sortArticles(Array.from({ length: 12 }, (_, i) => ({
    slug: `article-${String(12 - i).padStart(2, "0")}`,
    title: `Article ${12 - i}`,
    publishedAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
  })), "title");
  assert.equal(paginate(sorted, 1).items.length, 10);
  assert.equal(paginate(sorted, 2).items.length, 2);
  assert.deepEqual(paginate(sorted, 2).items.map(({ slug }) => slug), [
    "article-11", "article-12",
  ]);
  assert.equal(paginate(sorted, 99).page, 2);
});

test("every article gets three unique, zero-based ranks", () => {
  const ranks = assignSortRanks(articles);
  for (const key of ["latestRank", "oldestRank", "titleKoRank"] as const) {
    assert.deepEqual(
      [...ranks.values()].map((rank) => rank[key]).sort((a, b) => a - b),
      [0, 1, 2, 3, 4],
    );
  }
});

test("exact CVE search preserves the selected sort and avoids partial matches", () => {
  const withCves = [
    { ...articles[0], cveIds: ["CVE-2026-12345"] },
    { ...articles[1], cveIds: ["CVE-2026-12345"] },
    { ...articles[2], cveIds: ["CVE-2026-123456"] },
  ];
  assert.deepEqual(exactCveMatches(withCves, " cve-2026-12345 ", "oldest")?.map(({ slug }) => slug), ["alpha", "beta"]);
  assert.deepEqual(exactCveMatches(withCves, "CVE-2026-12345", "latest")?.map(({ slug }) => slug), ["beta", "alpha"]);
  assert.equal(exactCveMatches(withCves, "CVE-2026-1234", "latest")?.length, 0);
  assert.equal(exactCveMatches(withCves, "CVE-2026", "latest"), null);
});


test("CVE catalog includes exact identifiers from article title, body, tags, and aliases", () => {
  assert.deepEqual(extractCveIds(
    "CVE-2026-12345 appears in the body; CVE-2026-1234X is a partial token and must not match.",
    "Title CVE-2027-99111", "security CVE-2028-70000", "alias CVE-2029-9",
  ), ["CVE-2026-12345", "CVE-2027-99111", "CVE-2028-70000"]);
});
