import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";
import { sortArticles } from "../src/lib/article-sort.ts";
import { firstImageFromHtml } from "../src/lib/first-image.ts";

// Exercise the shipped static files and client bundle without a browser dependency.
const root = resolve(process.argv[2] || "dist");
const newsletterHtml = readFileSync(join(root, "index.html"), "utf8");
const html = readFileSync(join(root, "archive/index.html"), "utf8");
const catalog = JSON.parse(html.match(/<script[^>]*id="article-catalog"[^>]*>(.*?)<\/script>/s)[1]);
const pagefindPath = html.match(/data-pagefind-path="([^"]+)"/)[1];
const base = pagefindPath.replace(/pagefind\/pagefind\.js$/, "");
const origin = "https://static-test.invalid";
const pageSize = 18;
const archivePath = `${base}archive/`;
const localFile = (url) => {
  const pathname = decodeURIComponent(new URL(url, origin).pathname);
  assert.ok(pathname.startsWith(base), `Missing site base: ${pathname}`);
  const file = resolve(root, pathname.slice(base.length));
  assert.ok(file === root || file.startsWith(root + sep));
  return pathname.endsWith("/") ? join(file, "index.html") : file;
};
let checkedAssets = 0;
function checkHtml(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) checkHtml(file);
    else if (entry.name.endsWith(".html")) {
      const content = readFileSync(file, "utf8");
      const refs = [...content.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
      for (const match of content.matchAll(/srcset="([^"]+)"/g)) refs.push(...match[1].split(",").map((s) => s.trim().split(/\s+/)[0]));
      for (const ref of refs.filter((ref) => ref.startsWith("/") && !ref.startsWith("//"))) {
        assert.ok(existsSync(localFile(ref)), `Broken asset/link in ${file}: ${ref}`);
        checkedAssets++;
      }
    }
  }
}
checkHtml(root);
// Initial static cards and cards rebuilt by search use the same display data.
const unescapeHtml = (value) => value.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" })[entity]);
const staticCards = [...html.matchAll(/<li class="article-card">([\s\S]*?)(?=<li class="article-card">|<\/ol>)/g)];
assert.equal(staticCards.length, Math.min(pageSize, catalog.length));
for (const [index, card] of staticCards.entries()) {
  const article = sortArticles(catalog, "latest")[index];
  const link = card[1].match(/<a[^>]*class="article-card__link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(link, "Static card must expose one link around its image and body");
  assert.equal(unescapeHtml(link[1]), article.href);
  assert.equal((card[1].match(/<a\b/g) ?? []).length, 1, "Card must have only one keyboard target");
  assert.ok(link[2].includes('class="article-card__media"') && link[2].includes('class="article-card__body"'));
  const title = link[2].match(/class="article-card__title-link"[^>]*>(.*?)<\/span>/s);
  assert.equal(unescapeHtml(title[1]), article.title);
  const image = card[1].match(/<img\b([^>]+)>/);
  assert.equal(Boolean(image), Boolean(article.thumbnail));
  if (article.thumbnail) {
    const attrs = Object.fromEntries([...image[1].matchAll(/([a-z]+)="([^"]*)"/g)].map((match) => [match[1], unescapeHtml(match[2])]));
    for (const key of ["src", "alt", "width", "height"]) assert.equal(attrs[key], article.thumbnail[key] === undefined ? undefined : String(article.thumbnail[key]));
  }
}
assert.ok(existsSync(join(root, "about/index.html")));
for (const id of ["article-controls", "article-search", "article-sort", "search-status", "newsletter"]) assert.ok(!newsletterHtml.includes(`id="${id}"`), `Archive/banner UI leaked into newsletter: ${id}`);
assert.ok(newsletterHtml.includes("MR.DUCK&#39;S WEEKLY LETTER") || newsletterHtml.includes("MR.DUCK'S WEEKLY LETTER"));
assert.ok(newsletterHtml.includes("이번 주 픽"));
assert.ok(!newsletterHtml.includes("먼저 읽어볼 이야기"));
const recent = [...newsletterHtml.matchAll(/<li class="article-card article-card--compact">([\s\S]*?)(?=<li class="article-card article-card--compact">|<\/ol>)/g)];
const previousArticles = sortArticles(catalog, "latest").slice(1, 7);
assert.equal(recent.length, previousArticles.length);
recent.forEach((card, index) => {
  const link = card[1].match(/class="article-card__link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
  assert.equal(unescapeHtml(link[1]), previousArticles[index].href);
  assert.equal((card[1].match(/<a\b/g) ?? []).length, 1);
  assert.ok(link[2].includes('class="article-card__media"'));
  const title = link[2].match(/class="article-card__title-link"[^>]*>(.*?)<\/span>/s);
  assert.equal(unescapeHtml(title[1]), previousArticles[index].title);
  assert.ok(!card[1].includes('class="card-meta"') && !card[1].includes("<p>") && !card[1].includes('class="article-card__read"'));
});
const latest = sortArticles(catalog, "latest")[0];
for (const article of catalog) {
  const detailHtml = readFileSync(localFile(article.href), "utf8");
  const coverHtml = detailHtml.match(/<figure class="cover">([\s\S]*?)<\/figure>/)?.[1];
  const proseHtml = detailHtml.match(/class="prose"[^>]*>([\s\S]*?)<footer class="sources"/)[1];
  if (coverHtml) {
    const cover = firstImageFromHtml(coverHtml);
    assert.ok(article.thumbnail, "An explicit cover must appear in the article catalog");
    assert.equal(article.thumbnail.alt, cover.alt, "Explicit cover must take precedence over body images");
    assert.ok(Math.abs(article.thumbnail.width / article.thumbnail.height - cover.width / cover.height) < .01);
  } else {
    const bodyImage = firstImageFromHtml(proseHtml);
    assert.equal(Boolean(article.thumbnail), Boolean(bodyImage), "Archive must use the same body-image fallback as home");
    if (bodyImage) for (const key of ["src", "alt", "width", "height"]) assert.equal(article.thumbnail[key], bodyImage[key]);
  }
}
if (latest) {
  assert.ok(newsletterHtml.includes(`class="home-feature__card" href="${latest.href}"`));
  const weeklyHref = newsletterHtml.match(/<a[^>]*class="home-button home-button--coral"[^>]*href="([^"]+)"/)?.[1];
  assert.equal(unescapeHtml(weeklyHref ?? ""), latest.href, "Weekly CTA must lead to the newest public article");
  const featuredHtml = newsletterHtml.match(/class="home-feature__image">([\s\S]*?)<div class="home-feature__copy"/)[1];
  const featuredImage = firstImageFromHtml(featuredHtml);
  assert.equal(Boolean(featuredImage), Boolean(latest.thumbnail));
  if (featuredImage) for (const key of ["src", "alt", "width", "height"]) assert.equal(featuredImage[key], latest.thumbnail[key], "Featured and archive images must match");
}
assert.ok(existsSync(join(root, "404.html")));
const fragmentDir = join(root, "pagefind/fragment");
const fragments = existsSync(fragmentDir) ? readdirSync(fragmentDir).map((file) => {
  const raw = gunzipSync(readFileSync(join(fragmentDir, file))).toString();
  return JSON.parse(raw.slice(raw.indexOf("{")));
}) : [];
const normalized = (text) => text.replace(/\s+/g, " ").trim();
for (const article of catalog) {
  const fragment = fragments.find((item) => item.meta.articleSlug === article.slug);
  assert.ok(fragment, `Missing search fragment: ${article.slug}`);
  for (const text of [article.title, article.summary]) {
    assert.ok(normalized(fragment.content).includes(normalized(text)), `Text excluded from index: ${article.slug}: ${text}`);
  }
}
for (const slug of ["unpublished-draft", "unpublished-future"]) {
  assert.ok(!catalog.some((article) => article.slug === slug));
  assert.ok(!existsSync(join(root, "articles", slug)));
}

// Run the real Pagefind WASM index, serving fetch requests from the build output.
globalThis.fetch = async (input) => {
  const file = localFile(input);
  assert.ok(statSync(file).isFile());
  return new Response(readFileSync(file));
};
const pagefind = catalog.length ? await import(pathToFileURL(join(root, "pagefind/pagefind.js")).href) : null;
if (pagefind) await pagefind.options({ basePath: `${origin}${base}pagefind/`, baseUrl: base });
for (const article of catalog) {
  for (const query of [article.title, article.summary]) {
    const result = await pagefind.search(query);
    const slugs = await Promise.all(result.results.map(async (item) => (await item.data()).meta.articleSlug));
    assert.ok(slugs.includes(article.slug), `Title/summary missing from search: ${article.slug}: ${query}`);
  }
}
for (const [sort, field] of [["latest", "latestRank"], ["oldest", "oldestRank"], ["title", "titleKoRank"]]) {
  if (!pagefind) break;
  const result = await pagefind.search(null, { sort: { [field]: "asc" } });
  const slugs = await Promise.all(result.results.map(async (item) => (await item.data()).meta.articleSlug));
  assert.deepEqual(slugs, sortArticles(catalog, sort).map((item) => item.slug));
}

class Element {
  children = []; dataset = {}; attributes = {}; listeners = {}; value = ""; hidden = false; text = "";
  constructor(tag = "div") { this.tag = tag; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map((child) => typeof child === "string" ? child : child.textContent).join(""); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.text = ""; this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  querySelector(selector) {
    for (const child of this.children) {
      if (typeof child === "string") continue;
      if ((selector.startsWith(".") && child.className?.split(/\s+/).includes(selector.slice(1))) || child.tag === selector) return child;
      const nested = child.querySelector(selector); if (nested) return nested;
    }
    return null;
  }
  addEventListener(event, callback) { (this.listeners[event] ||= []).push(callback); }
  fire(event, extra = {}) { for (const callback of this.listeners[event] || []) callback({ preventDefault() {}, ...extra }); }
  focusCount = 0; scrollCount = 0;
  focus() { this.focusCount++; }
  scrollIntoView() { this.scrollCount++; }
}
const ids = ["article-controls", "article-search", "article-sort", "view-cards", "view-list", "article-results", "search-status", "empty-state", "pagination", "previous-page", "next-page", "page-status", "search-config", "article-catalog"];
const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
elements["article-catalog"].textContent = JSON.stringify(catalog);
elements["search-config"].dataset.pagefindPath = pagefindPath;
const location = { pathname: archivePath, search: "?sort=title&page=999", hash: "#article-archive" };
const navigate = (_state, _title, url) => { const next = new URL(url, origin); location.pathname = next.pathname; location.search = next.search; location.hash = next.hash; };
const window = new Element();
const context = vm.createContext({
  document: { baseURI: origin + base, querySelector: (selector) => elements[selector.slice(1)], createElement: (tag) => new Element(tag), createTextNode: (text) => String(text) },
  location, window, history: { pushState: navigate, replaceState: navigate }, URL, URLSearchParams, Intl, console,
});
const scriptPath = html.match(/<script[^>]*src="([^"]+)"/)[1];
const client = new vm.SourceTextModule(readFileSync(localFile(scriptPath), "utf8"), {
  context,
  initializeImportMeta: (meta) => { meta.url = origin + scriptPath; },
  importModuleDynamically: async (specifier) => { assert.equal(specifier, origin + pagefindPath); return pagefind; },
});
await client.link(() => { throw new Error("Unexpected static client import"); });
await client.evaluate();
async function settled() {
  for (let i = 0; i < 250; i++) {
    await new Promise((done) => setTimeout(done, 20));
    if (!elements["search-status"].textContent.includes("중입니다")) {
      assert.notEqual(elements["search-status"].dataset.kind, "error");
      return;
    }
  }
  assert.fail("Client rendering timed out");
}
const cards = () => elements["article-results"].children.map((card) => card.querySelector(".article-card__title-link"));
function expectCards(articles) {
  assert.deepEqual(cards().map((link) => link.textContent), articles.map((article) => article.title));
  for (const card of elements["article-results"].children) {
    const link = card.querySelector(".article-card__link");
    assert.ok(link.querySelector(".article-card__media") && link.querySelector(".article-card__body"), "Client card image and body must share a link");
    assert.equal(link.querySelector("a"), null, "Card links must not contain nested links");
    assert.ok(link.href.startsWith(`${base}articles/`), `Wrong client article URL: ${link.href}`);
    assert.ok(existsSync(localFile(link.href)));
  }
  elements["article-results"].children.forEach((card, index) => {
    const image = card.querySelector("img");
    const thumbnail = articles[index].thumbnail;
    assert.equal(Boolean(image), Boolean(thumbnail));
    if (thumbnail) {
      for (const key of ["src", "alt", "width", "height"]) assert.equal(String(image.getAttribute(key)), String(thumbnail[key]));
      assert.ok(existsSync(localFile(thumbnail.src)), `Broken thumbnail: ${thumbnail.src}`);
      assert.ok(thumbnail.alt);
      if (thumbnail.width !== undefined) assert.ok(thumbnail.width > 0);
      if (thumbnail.height !== undefined) assert.ok(thumbnail.height > 0);
    }
  });
}
await settled();
assert.equal(location.hash, "#article-archive", "Initial search must preserve the archive anchor");
const lastPage = Math.max(1, Math.ceil(catalog.length / pageSize));
expectCards(sortArticles(catalog, "title").slice((lastPage - 1) * pageSize));
assert.equal(new URLSearchParams(location.search).get("page"), lastPage > 1 ? String(lastPage) : null);
for (const sort of ["latest", "oldest", "title"]) {
  elements["article-sort"].value = sort; elements["article-sort"].fire("change"); await settled();
  expectCards(sortArticles(catalog, sort).slice(0, pageSize));
  if (catalog.length > pageSize) {
    elements["next-page"].fire("click"); await settled();
    expectCards(sortArticles(catalog, sort).slice(pageSize, pageSize * 2));
  }
}
location.search = "?sort=oldest"; window.fire("popstate"); await settled();
expectCards(sortArticles(catalog, "oldest").slice(0, pageSize));
if (catalog.length) {
  elements["article-search"].fire("compositionstart");
  elements["article-search"].value = catalog[0].title;
  elements["article-search"].fire("input", { isComposing: true });
  elements["article-search"].fire("compositionend"); await settled();
  assert.ok(cards().some((link) => link.textContent === catalog[0].title));
  for (const sort of ["latest", "oldest", "title"]) {
    elements["article-search"].value = "CVE-2026-12345";
    elements["article-sort"].value = sort; elements["article-controls"].fire("submit"); await settled();
    expectCards(sortArticles(catalog.filter((article) => article.cveIds.includes("CVE-2026-12345")), sort).slice(0, pageSize));
  }
}
console.log(`Verified ${catalog.length} articles, ${checkedAssets} local references, real search index, client links, all sorts, pagination, URL restoration, and IME input (base: ${base}).`);
const { verifyClientStates } = await import("./verify-client-states.mjs");
await verifyClientStates({ source: readFileSync(localFile(scriptPath), "utf8"), catalog, pagefind, base, pagefindPath });
await verifyClientStates({ source: readFileSync(localFile(scriptPath), "utf8"), catalog, pagefind, base, pagefindPath, initialView: "list" });
