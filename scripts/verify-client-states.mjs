import assert from "node:assert/strict";
import vm from "node:vm";

// Isolated DOM model for the shipped bundle: control failures and completion order,
// without corrupting the real index or treating this as a native browser/IME test.
export async function createClient({ source, catalog, base, pagefindPath, search, failImport = false, initialView = "cards", initialSearch, initialStorage, blockedStorage = false, revision = "test-build" }) {
  const effects = { focus: [], scroll: [], errors: [], reloads: 0 };
  class Element {
    children = []; dataset = {}; attributes = {}; listeners = {}; value = ""; hidden = false; text = "";
    constructor(id = "", tag = "div") { this.id = id; this.tag = tag; }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text + this.children.map((child) => typeof child === "string" ? child : child.textContent).join(""); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.text = ""; this.children = children; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key]; }
    querySelector(selector) {
      for (const child of this.children) {
        if (typeof child === "string") continue;
        if ((selector.startsWith(".") && child.className?.split(/\s+/).includes(selector.slice(1))) || (selector.startsWith("#") && child.id === selector.slice(1)) || child.tag === selector) return child;
        const nested = child.querySelector(selector); if (nested) return nested;
      }
      return null;
    }
    addEventListener(event, callback) { (this.listeners[event] ||= []).push(callback); }
    fire(event, extra = {}) { for (const callback of this.listeners[event] || []) callback({ preventDefault() {}, ...extra }); }
    focus() { effects.focus.push(this.id); }
    scrollIntoView() { effects.scroll.push(this.id); }
  }
  const ids = ["article-controls", "article-search", "article-sort", "view-cards", "view-list", "article-results", "search-status", "empty-state", "pagination", "previous-page", "next-page", "page-status", "search-config", "article-catalog"];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element(id)]));
  elements["article-catalog"].textContent = JSON.stringify(catalog);
  elements["search-config"].dataset.pagefindPath = pagefindPath;
  elements["search-config"].dataset.searchRevision = revision;
  elements["empty-state"].textContent = "아직 게시된 기사가 없습니다. 새 기사를 준비하고 있습니다.";
  const location = { pathname: `${base}archive/`, search: initialSearch ?? (initialView === "list" ? "?view=list" : ""), reload() { effects.reloads++; } };
  const origin = "https://static-test.invalid";
  const navigate = (_state, _title, url) => { location.search = new URL(url, origin).search; };
  const window = new Element(); window.location = location; window.scrollY = 0;
  effects.restoredScroll = [];
  window.scrollTo = ({ top }) => { window.scrollY = top; effects.restoredScroll.push(top); };
  const storage = new Map(initialStorage);
  const root = { dataset: { archiveRestoring: "true" } };
  const context = vm.createContext({
    document: { documentElement: root, baseURI: origin + base, querySelector: (selector) => elements[selector.slice(1)], createElement: (tag) => new Element("", tag), createTextNode: String },
    window, location, history: { pushState: navigate, replaceState: navigate }, URL, URLSearchParams, Intl,
    sessionStorage: {
      getItem: (key) => { if (blockedStorage) throw Error("Storage unavailable"); return storage.get(key); },
      setItem: (key, value) => { if (blockedStorage) throw Error("Storage unavailable"); storage.set(key, value); },
    },
    console: { error: (...args) => effects.errors.push(args) },
  });
  const api = new vm.SyntheticModule(["search"], function () { this.setExport("search", search); }, { context });
  await api.link(() => {}); await api.evaluate();
  const client = new vm.SourceTextModule(source, { context, importModuleDynamically: async (specifier) => {
    assert.equal(specifier, origin + pagefindPath);
    if (failImport) throw new Error("Injected module load failure");
    return api;
  } });
  await client.link(() => { throw new Error("Unexpected static import"); }); await client.evaluate();
  async function until(predicate) {
    for (let i = 0; i < 250; i++) { if (predicate()) return; await new Promise((done) => setTimeout(done, 4)); }
    assert.fail("Client state timed out");
  }
  const settled = () => until(() => !elements["search-status"].textContent.includes("중입니다"));
  const query = (value) => { elements["article-search"].value = value; elements["article-controls"].fire("submit"); };
  const titles = () => elements["article-results"].children.map((card) => card.querySelector(".article-card__title-link").textContent);
  await settled();
  return { elements, effects, location, window, storage, root, until, settled, query, titles };
}

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const nextTurn = () => new Promise((done) => setTimeout(done, 0));

export async function verifyClientStates(options) {
  const view = options.initialView ?? "cards";
  const pageSize = view === "list" ? 20 : 18;
  const empty = await createClient({ ...options, catalog: [], search: () => { throw Error("Empty catalog must not load an index"); } });
  empty.query("anything"); await empty.settled();
  assert.equal(empty.elements["search-status"].textContent, "0개 결과");
  assert.match(empty.elements["empty-state"].textContent, /아직 게시된 기사가 없습니다/);
  assert.equal(empty.elements["empty-state"].hidden, false);
  assert.equal(empty.effects.errors.length, 0);
  assert.equal(empty.effects.focus.length, 0);

  if (!options.catalog.length) return;
  let calls = 0, dataCalls = 0;
  const real = await createClient({ ...options, search: async (...args) => {
    calls++;
    const result = await options.pagefind.search(...args);
    return { results: result.results.map((item) => ({ id: item.id, data: () => { dataCalls++; return item.data(); } })) };
  } });
  for (const card of real.elements["article-results"].children) {
    const link = card.querySelector(".article-card__link");
    assert.ok(link, "Every card must have one link that includes its image and body");
    assert.equal(link.tag, "a");
    assert.ok(link.querySelector(".article-card__media"));
    assert.ok(link.querySelector(".article-card__body"));
    assert.equal(link.querySelector("a"), null, "Whole-card links must not contain nested links");
    assert.ok(link.href.startsWith(`${options.base}articles/`));
    const heading = link.querySelector(".article-card__title");
    assert.equal(link.getAttribute("aria-labelledby"), heading.id, "The card's accessible link name must be its title");
  }
  real.query("CVE-2999-99999"); await real.settled();
  assert.equal(real.elements["search-status"].textContent, "0개 결과");
  assert.match(real.elements["empty-state"].textContent, /일치하는 기사가 없습니다/);
  assert.doesNotMatch(real.elements["empty-state"].textContent, /게시된 기사가 없/);
  assert.equal(real.titles().length, 0); assert.equal(calls, 0);
  assert.equal(real.elements["empty-state"].querySelector("#clear-search"), null);
  assert.equal(real.elements["empty-state"].querySelector("#show-all-articles"), null);
  assert.doesNotMatch(real.elements["empty-state"].textContent, /다른 검색어|전체 글을 확인/);
  real.query(""); await real.settled();
  assert.equal(real.elements["article-search"].value, "");
  assert.equal(new URLSearchParams(real.location.search).get("q"), null);
  assert.equal(real.effects.focus.length, 0, "Changing search text must not move focus");
  assert.equal(real.titles().length, Math.min(pageSize, options.catalog.length));
  assert.equal(real.elements["article-results"].dataset.view, view);
  assert.equal(real.root.dataset.archiveRestoring, undefined, "The archive becomes visible only after the requested results are painted");
  assert.equal(real.elements[`view-${view}`].getAttribute("aria-pressed"), "true");
  assert.match(real.elements["search-status"].textContent, new RegExp(`${options.catalog.length}개 결과`));
  assert.equal(real.elements["search-status"].querySelector("strong").textContent, String(options.catalog.length), "Only the result count belongs in the bold element");
  assert.equal(real.elements["empty-state"].hidden, true);

  // Editing the input after an empty search preserves the sort and view from history.
  real.location.search = `?q=CVE-2999-99999&sort=oldest&view=${view}&page=4`;
  real.window.fire("popstate"); await real.settled();
  real.query(""); await real.settled();
  assert.equal(real.elements["article-sort"].value, "oldest");
  assert.equal(real.elements["article-results"].dataset.view, view);
  assert.equal(new URLSearchParams(real.location.search).get("sort"), "oldest");
  assert.equal(new URLSearchParams(real.location.search).get("page"), null);
  assert.equal(new URLSearchParams(real.location.search).get("q"), null);
  real.query("CVE-2999-99999"); await real.settled();
  assert.equal(real.elements["empty-state"].querySelector("#show-all-articles"), null);
  real.elements["article-sort"].value = "latest";
  real.query(""); await real.settled();
  assert.equal(real.elements["article-sort"].value, "latest");
  assert.equal(real.elements["article-results"].dataset.view, view);
  assert.equal(real.location.search, view === "list" ? "?view=list" : "");
  assert.equal(real.effects.focus.length, 0);
  assert.equal(real.elements["empty-state"].hidden, true);

  // Real Pagefind ordering and result counts must hold across every page and sort.
  const commonQuery = options.catalog.every((article) => article.slug.startsWith("sample-") && /^sample-\d+$/.test(article.slug)) ? "synthetic" : options.catalog[0].title;
  for (const [sort, field] of [["latest", "latestRank"], ["oldest", "oldestRank"], ["title", "titleKoRank"]]) {
    const expected = await options.pagefind.search(commonQuery, { sort: { [field]: "asc" } });
    const expectedTitles = await Promise.all(expected.results.map(async (item) => (await item.data()).meta.title));
    real.elements["article-sort"].value = sort;
    const startCalls = calls, startData = dataCalls;
    real.query(commonQuery); await real.settled();
    const pages = Math.max(1, Math.ceil(expectedTitles.length / pageSize));
    assert.equal(dataCalls - startData, Math.min(pageSize, expectedTitles.length));
    assert.equal(real.elements["page-status"].textContent, `1 / ${pages}`);
    assert.equal(real.elements["search-status"].textContent, `${expectedTitles.length}개 결과${pages > 1 ? ` · 1 / ${pages}페이지` : ""}`, "Only multi-page results should show page information; sort remains in its control");
    const visited = [...real.titles()];
    for (let page = 2; page <= pages; page++) {
      const focused = real.effects.focus.length;
      real.elements["next-page"].fire("click"); await real.settled();
      assert.equal(real.effects.focus.length, focused + 1);
      assert.equal(real.effects.focus.at(-1), "article-results");
      assert.equal(real.effects.scroll.length, real.effects.focus.filter((id) => id === "article-results").length);
      assert.equal(real.elements["page-status"].textContent, `${page} / ${pages}`);
      assert.equal(real.elements["search-status"].textContent, `${expectedTitles.length}개 결과 · ${page} / ${pages}페이지`, "Result status must follow the current and total page counts");
      visited.push(...real.titles());
    }
    assert.deepEqual(visited, expectedTitles);
    assert.equal(calls - startCalls, 1, "Page navigation must reuse the globally sorted result set");
    assert.equal(dataCalls - startData, expectedTitles.length);
    const focusBeforeHistory = real.effects.focus.length;
    real.location.search = `?q=${encodeURIComponent(commonQuery)}&sort=${sort}&view=${view}`;
    real.window.fire("popstate"); await real.settled();
    assert.equal(real.effects.focus.length, focusBeforeHistory);
    assert.equal(dataCalls - startData, expectedTitles.length, "Returning to a loaded page must reuse its data");
    console.log(`Search budget (${view}/${sort}): ${expectedTitles.length} matches; first page ${Math.min(pageSize, expectedTitles.length)} data() calls; all pages ${dataCalls - startData}; search() calls ${calls - startCalls}.`);
  }

  const otherView = view === "cards" ? "list" : "cards";
  const otherSize = otherView === "list" ? 20 : 18;
  const callsBeforeView = calls, dataBeforeView = dataCalls;
  real.elements[`view-${otherView}`].fire("click"); await real.settled();
  assert.equal(real.elements["article-results"].dataset.view, otherView);
  assert.equal(real.elements[`view-${otherView}`].getAttribute("aria-pressed"), "true");
  const titleOrdered = await options.pagefind.search(commonQuery, { sort: { titleKoRank: "asc" } });
  const titleNames = await Promise.all(titleOrdered.results.map(async (item) => (await item.data()).meta.title));
  assert.deepEqual(real.titles(), titleNames.slice(0, otherSize));
  assert.equal(calls, callsBeforeView, "View switching must reuse search results");
  assert.equal(dataCalls, dataBeforeView, "Previously loaded pages must remain cached across view switching");
  assert.equal(new URLSearchParams(real.location.search).get("page"), null, "View switching resets the page");
  if (titleNames.length > otherSize) {
    real.elements["next-page"].fire("click"); await real.settled();
    assert.deepEqual(real.titles(), titleNames.slice(otherSize, otherSize * 2));
    assert.equal(new URLSearchParams(real.elements["next-page"].href.split("?")[1]).get("view"), otherView === "list" ? "list" : null);
  }
  const focusBeforeViewHistory = real.effects.focus.length;
  real.location.search = `?q=${encodeURIComponent(commonQuery)}&sort=title&view=${view}&page=2`;
  real.window.fire("popstate"); await real.settled();
  assert.equal(real.elements["article-results"].dataset.view, view);
  assert.equal(real.elements[`view-${view}`].getAttribute("aria-pressed"), "true");
  assert.equal(real.effects.focus.length, focusBeforeViewHistory);

  // Leaving an article and reloading the archive must restore all four URL controls.
  const returnAddress = real.location.search;
  const returnTitles = real.titles();
  const articleLink = real.elements["article-results"].querySelector(".article-card__link");
  if (articleLink) {
    articleLink.fire("click");
    const saved = JSON.parse(real.storage.get("duckurity:archive-return"));
    assert.equal(saved.archiveUrl, `${options.base}archive/${returnAddress}`);
    assert.equal(saved.articlePath, new URL(articleLink.href, "https://static-test.invalid").pathname);
  }
  const restored = await createClient({ ...options, initialSearch: returnAddress, search: (...args) => options.pagefind.search(...args) });
  assert.deepEqual(restored.titles(), returnTitles);
  assert.equal(restored.elements["article-search"].value, commonQuery);
  assert.equal(restored.elements["article-sort"].value, "title");
  assert.equal(restored.elements["article-results"].dataset.view, view);
  real.window.scrollY = 321;
  real.window.fire("pagehide");
  const immediate = await createClient({ ...options, initialSearch: returnAddress, initialStorage: real.storage, failImport: true, search: () => { throw Error("Saved results must not request the search index"); } });
  assert.deepEqual(immediate.titles(), returnTitles, "A reload must immediately restore the saved results without loading the index");
  assert.equal(immediate.effects.errors.length, 0);
  assert.equal(immediate.window.scrollY, 321, "A return visit restores the saved scroll position");
  let freshSearches = 0;
  const changedCatalog = options.catalog.map((article, index) => index ? article : { ...article, summary: article.summary + " updated" });
  const invalidated = await createClient({ ...options, catalog: changedCatalog, initialSearch: returnAddress, initialStorage: real.storage, search: (...args) => { freshSearches++; return options.pagefind.search(...args); } });
  assert.equal(freshSearches, 1, "Changed article data must invalidate old saved results");
  assert.equal(invalidated.root.dataset.archiveRestoring, undefined);
  let rebuiltSearches = 0;
  await createClient({ ...options, initialSearch: returnAddress, initialStorage: real.storage, revision: "next-build", search: (...args) => { rebuiltSearches++; return options.pagefind.search(...args); } });
  assert.equal(rebuiltSearches, 1, "A new build must invalidate cached searches even when only article body text changes");
  const noStorage = await createClient({ ...options, initialSearch: returnAddress, blockedStorage: true, search: (...args) => options.pagefind.search(...args) });
  assert.deepEqual(noStorage.titles(), returnTitles, "Blocked storage still permits ordinary URL restoration");
  real.elements["article-results"].replaceChildren();
  real.window.fire("pagehide"); real.window.fire("pageshow", { persisted: true }); await real.settled();
  assert.deepEqual(real.titles(), returnTitles, "BFCache restoration must rebuild the current results");
  assert.equal(real.effects.focus.length, focusBeforeViewHistory, "Back restoration must not move keyboard focus");

  const countBeforeIme = calls, focusBeforeIme = real.effects.focus.length;
  real.elements["article-search"].fire("compositionstart");
  real.elements["article-search"].value = options.catalog[0].title + " 검사";
  real.elements["article-search"].fire("input", { isComposing: true });
  await nextTurn(); assert.equal(calls, countBeforeIme);
  real.elements["article-search"].fire("compositionend");
  real.elements["article-search"].fire("input", { isComposing: false });
  await real.settled();
  assert.equal(calls, countBeforeIme + 1, "Compositionend/input should share one search");
  assert.equal(real.effects.focus.length, focusBeforeIme);

  const typedQueries = [];
  const liveInput = await createClient({ ...options, search: async (query) => { typedQueries.push(query); return { results: [] }; } });
  const type = (value) => { liveInput.elements["article-search"].value = value; liveInput.elements["article-search"].fire("input"); };
  type("first"); await liveInput.settled(); type("last"); await liveInput.settled();
  assert.deepEqual(typedQueries, ["first", "last"], "Input searches immediately without a one-second timer");
  liveInput.elements["article-controls"].fire("submit"); await liveInput.settled();
  assert.deepEqual(typedQueries, ["first", "last"], "The restored submit button retains the current query");
  const message = liveInput.elements["empty-state"].querySelector("p");
  assert.equal(message.querySelector(".empty-state__query").textContent, "last");
  assert.equal(message.querySelector(".empty-state__closing-quote").textContent, "”");
  assert.equal(message.textContent, "“last”와 일치하는 기사가 없습니다.");

  const pending = new Map();
  const controlled = await createClient({ ...options, search: (query) => { const task = deferred(); pending.set(query, task); return task.promise; } });
  controlled.query("pending"); await controlled.until(() => pending.has("pending"));
  assert.equal(new URLSearchParams(controlled.location.search).get("q"), "pending", "The query must be saved before the search finishes");
  assert.equal(controlled.elements["empty-state"].hidden, true);
  assert.equal(controlled.elements["article-results"].getAttribute("aria-busy"), "true");
  controlled.window.fire("pagehide");
  pending.get("pending").resolve({ results: [] }); await nextTurn();
  assert.equal(controlled.elements["empty-state"].hidden, true, "A search completing after leaving must not overwrite the suspended page");
  controlled.window.fire("pageshow", { persisted: true }); await controlled.settled();
  assert.equal(controlled.elements["article-search"].value, "pending", "Returning during a pending search must retain the query");
  assert.equal(controlled.elements["empty-state"].hidden, false);
  controlled.query("error"); await controlled.until(() => pending.has("error"));
  pending.get("error").reject(Error("Injected search failure")); await controlled.settled();
  assert.equal(controlled.elements["search-status"].dataset.kind, "error");
  assert.equal(controlled.elements["empty-state"].hidden, true);
  assert.equal(controlled.elements["pagination"].hidden, true);
  const retry = controlled.elements["search-status"].children.find((child) => typeof child !== "string");
  assert.equal(retry.textContent, "다시 시도"); retry.fire("click"); assert.equal(controlled.effects.reloads, 1);
  controlled.query(""); await controlled.settled(); assert.equal(controlled.effects.errors.length, 1);
  assert.equal(controlled.titles().length, Math.min(pageSize, options.catalog.length));

  const missingModule = await createClient({ ...options, failImport: true });
  missingModule.query("load failure"); await missingModule.settled();
  assert.equal(missingModule.elements["search-status"].dataset.kind, "error");
  assert.equal(missingModule.elements["empty-state"].hidden, true);

  // Superseded success and error must not replace a newer result or change focus.
  controlled.query("slow"); await controlled.until(() => pending.has("slow"));
  controlled.query("new"); await controlled.until(() => pending.has("new"));
  pending.get("new").resolve({ results: [] }); await controlled.settled();
  pending.get("slow").reject(Error("Stale failure")); await nextTurn();
  assert.equal(controlled.elements["search-status"].textContent, "0개 결과");
  assert.match(controlled.elements["empty-state"].textContent, /“new”/);
  assert.equal(controlled.effects.errors.length, 1);
  assert.equal(controlled.effects.focus.length, 0);

  // A larger isolated catalog exercises overlapping page-data requests, not just search().
  const count = pageSize * 2 + 5;
  const many = Array.from({ length: count }, (_, i) => ({ ...options.catalog[0], slug: `isolated-${i}`, title: `Isolated ${i}`, latestRank: i, oldestRank: count - 1 - i, titleKoRank: i }));
  const loads = new Map();
  const racing = await createClient({ ...options, catalog: many, search: async () => ({ results: many.map((article, i) => ({ id: String(i), data: () => {
    const task = deferred(); loads.set(i, task); return task.promise;
  } })) }) });
  const release = (from, to) => { for (let i = from; i < to; i++) loads.get(i).resolve({ meta: { articleSlug: many[i].slug } }); };
  racing.query("all"); await racing.until(() => loads.has(pageSize - 1)); release(0, pageSize); await racing.settled();
  racing.elements["next-page"].fire("click"); await racing.until(() => loads.has(pageSize * 2 - 1));
  racing.elements["next-page"].fire("click"); await racing.until(() => loads.has(count - 1));
  release(pageSize * 2, count); await racing.settled();
  assert.deepEqual(racing.titles(), many.slice(pageSize * 2).map((a) => a.title));
  assert.equal(racing.effects.focus.length, 1);
  release(pageSize, pageSize * 2); await nextTurn();
  assert.deepEqual(racing.titles(), many.slice(pageSize * 2).map((a) => a.title));
  assert.equal(racing.effects.focus.length, 1);
  assert.equal(racing.elements["page-status"].textContent, "3 / 3");
  // Starting IME composition also invalidates a pending page's focus request.
  racing.elements["previous-page"].fire("click");
  racing.elements["article-search"].fire("compositionstart");
  await nextTurn();
  assert.equal(racing.effects.focus.length, 1);
  racing.elements["article-search"].fire("compositionend"); await racing.settled();
  assert.equal(racing.effects.focus.length, 1);
  console.log("Client states passed: empty catalog/no hits, loading, module/search failure, clear, IME, history/BFCache/article return, count emphasis, focus, cache and stale page/search responses.");
}

export function verifyArticleReturn({ source, base }) {
  const archive = `https://static-test.invalid${base}archive/`;
  const articlePath = `${base}articles/return-test/`;
  const results = `${archive}?q=${encodeURIComponent("보안 검색")}&sort=oldest&view=list&page=2`;
  function run(referrer, saved, { blocked = false, historyLength = 2, modifiers = {} } = {}) {
    let click;
    const effects = { back: 0, prevented: 0 };
    const back = { href: archive, addEventListener(_type, handler) { click = handler; } };
    vm.runInNewContext(source, {
      URL, location: { pathname: articlePath },
      document: { referrer, baseURI: `https://static-test.invalid${articlePath}`, querySelector: () => back },
      sessionStorage: { getItem() { if (blocked) throw Error("Storage unavailable"); return JSON.stringify(saved); } },
      history: { length: historyLength, back() { effects.back++; } },
    });
    click?.({ button: 0, preventDefault() { effects.prevented++; }, ...modifiers });
    return { href: back.href, ...effects };
  }
  assert.deepEqual(run(results), { href: results, back: 1, prevented: 1 }, "Return from search must use the existing history entry");
  const home = `https://static-test.invalid${base}`;
  assert.deepEqual(run(home, { articlePath, archiveUrl: results }), { href: home, back: 1, prevented: 1 }, "Home visits must return to home rather than an old archive search");
  assert.deepEqual(run(results, null, { historyLength: 1 }), { href: results, back: 0, prevented: 0 }, "New tabs must follow the fallback link");
  assert.equal(run(results, null, { modifiers: { ctrlKey: true } }).back, 0, "Modified clicks keep normal link behavior");
  assert.equal(run("", { articlePath, archiveUrl: results }).href, results);
  assert.equal(run("", { articlePath: "/other/", archiveUrl: results }).href, archive);
  assert.equal(run("https://untrusted.invalid/archive/").href, archive);
  assert.equal(run("", null, { blocked: true }).href, archive);
  console.log("Article return passed: native history, exact search context, home, new tabs, modified clicks, referrer fallback and blocked storage.");
}
