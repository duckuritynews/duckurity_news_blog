import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";
import { sortArticles } from "../src/lib/article-sort.ts";

// Exercise the shipped static files and client bundle without a browser dependency.
const root = resolve(process.argv[2] || "dist");
const html = readFileSync(join(root, "index.html"), "utf8");
const catalog = JSON.parse(html.match(/<script[^>]*id="article-catalog"[^>]*>(.*?)<\/script>/s)[1]);
const pagefindPath = html.match(/data-pagefind-path="([^"]+)"/)[1];
const base = pagefindPath.replace(/pagefind\/pagefind\.js$/, "");
const origin = "https://static-test.invalid";
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
  addEventListener(event, callback) { (this.listeners[event] ||= []).push(callback); }
  fire(event, extra = {}) { for (const callback of this.listeners[event] || []) callback({ preventDefault() {}, ...extra }); }
  focusCount = 0; scrollCount = 0;
  focus() { this.focusCount++; }
  scrollIntoView() { this.scrollCount++; }
}
const ids = ["article-controls", "article-search", "article-sort", "article-results", "search-status", "empty-state", "pagination", "previous-page", "next-page", "page-status", "search-config", "article-catalog"];
const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
elements["article-catalog"].textContent = JSON.stringify(catalog);
elements["search-config"].dataset.pagefindPath = pagefindPath;
const location = { pathname: base, search: "?sort=title&page=999" };
const navigate = (_state, _title, url) => { const next = new URL(url, origin); location.pathname = next.pathname; location.search = next.search; };
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
const cards = () => elements["article-results"].children.map((card) => card.children[1].children[0]);
function expectCards(articles) {
  assert.deepEqual(cards().map((link) => link.textContent), articles.map((article) => article.title));
  for (const link of cards()) {
    assert.ok(link.href.startsWith(`${base}articles/`), `Wrong client article URL: ${link.href}`);
    assert.ok(existsSync(localFile(link.href)));
  }
}
await settled();
const lastPage = Math.max(1, Math.ceil(catalog.length / 10));
expectCards(sortArticles(catalog, "title").slice((lastPage - 1) * 10));
assert.equal(new URLSearchParams(location.search).get("page"), lastPage > 1 ? String(lastPage) : null);
for (const sort of ["latest", "oldest", "title"]) {
  elements["article-sort"].value = sort; elements["article-sort"].fire("change"); await settled();
  expectCards(sortArticles(catalog, sort).slice(0, 10));
  if (catalog.length > 10) {
    elements["next-page"].fire("click"); await settled();
    expectCards(sortArticles(catalog, sort).slice(10, 20));
  }
}
location.search = "?sort=oldest"; window.fire("popstate"); await settled();
expectCards(sortArticles(catalog, "oldest").slice(0, 10));
if (catalog.length) {
  elements["article-search"].fire("compositionstart");
  elements["article-search"].value = catalog[0].title;
  elements["article-search"].fire("input", { isComposing: true });
  elements["article-search"].fire("compositionend"); await settled();
  assert.ok(cards().some((link) => link.textContent === catalog[0].title));
  for (const sort of ["latest", "oldest", "title"]) {
    elements["article-search"].value = "CVE-2026-12345";
    elements["article-sort"].value = sort; elements["article-controls"].fire("submit"); await settled();
    expectCards(sortArticles(catalog.filter((article) => article.cveIds.includes("CVE-2026-12345")), sort).slice(0, 10));
  }
}
console.log(`Verified ${catalog.length} articles, ${checkedAssets} local references, real search index, client links, all sorts, pagination, URL restoration, and IME input (base: ${base}).`);
const { verifyClientStates } = await import("./verify-client-states.mjs");
await verifyClientStates({ source: readFileSync(localFile(scriptPath), "utf8"), catalog, pagefind, base, pagefindPath });
