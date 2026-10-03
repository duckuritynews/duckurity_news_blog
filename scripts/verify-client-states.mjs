import assert from "node:assert/strict";
import vm from "node:vm";

// Isolated DOM model for the shipped bundle: control failures and completion order,
// without corrupting the real index or treating this as a native browser/IME test.
export async function createClient({ source, catalog, base, pagefindPath, search, failImport = false, initialView = "cards" }) {
  const effects = { focus: [], scroll: [], errors: [], reloads: 0 };
  class Element {
    children = []; dataset = {}; attributes = {}; listeners = {}; value = ""; hidden = false; text = "";
    constructor(id = "") { this.id = id; }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text + this.children.map((child) => typeof child === "string" ? child : child.textContent).join(""); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.text = ""; this.children = children; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key]; }
    querySelector(selector) {
      for (const child of this.children) {
        if (typeof child === "string") continue;
        if (selector.startsWith(".") && child.className?.split(/\s+/).includes(selector.slice(1))) return child;
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
  elements["empty-state"].textContent = "아직 게시된 기사가 없습니다. 새 기사를 준비하고 있습니다.";
  const location = { pathname: `${base}archive/`, search: initialView === "list" ? "?view=list" : "", reload() { effects.reloads++; } };
  const origin = "https://static-test.invalid";
  const navigate = (_state, _title, url) => { location.search = new URL(url, origin).search; };
  const window = new Element(); window.location = location;
  const context = vm.createContext({
    document: { baseURI: origin + base, querySelector: (selector) => elements[selector.slice(1)], createElement: () => new Element(), createTextNode: String },
    window, location, history: { pushState: navigate, replaceState: navigate }, URL, URLSearchParams, Intl,
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
  return { elements, effects, location, window, until, settled, query, titles };
}

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const nextTurn = () => new Promise((done) => setTimeout(done, 0));

export async function verifyClientStates(options) {
  const view = options.initialView ?? "cards";
  const pageSize = view === "list" ? 20 : 18;
  const empty = await createClient({ ...options, catalog: [], search: () => { throw Error("Empty catalog must not load an index"); } });
  empty.query("anything"); await empty.settled();
  assert.match(empty.elements["search-status"].textContent, /아직 게시된 기사가 없습니다/);
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
  real.query("CVE-2999-99999"); await real.settled();
  assert.match(real.elements["search-status"].textContent, /일치하는 기사가 없습니다/);
  assert.doesNotMatch(real.elements["empty-state"].textContent, /게시된 기사가 없/);
  assert.equal(real.titles().length, 0); assert.equal(calls, 0);
  real.query(""); await real.settled();
  assert.equal(real.titles().length, Math.min(pageSize, options.catalog.length));
  assert.equal(real.elements["article-results"].dataset.view, view);
  assert.equal(real.elements[`view-${view}`].getAttribute("aria-pressed"), "true");
  assert.match(real.elements["search-status"].textContent, new RegExp(`${options.catalog.length}개 결과`));
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
    assert.match(real.elements["search-status"].textContent, / · 1페이지$/);
    const visited = [...real.titles()];
    for (let page = 2; page <= pages; page++) {
      const focused = real.effects.focus.length;
      real.elements["next-page"].fire("click"); await real.settled();
      assert.equal(real.effects.focus.length, focused + 1);
      assert.equal(real.effects.focus.at(-1), "article-results");
      assert.equal(real.effects.scroll.length, real.effects.focus.length);
      assert.equal(real.elements["page-status"].textContent, `${page} / ${pages}`);
      assert.ok(real.elements["search-status"].textContent.endsWith(` · ${page}페이지`), "Result status must follow the current page");
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

  const pending = new Map();
  const controlled = await createClient({ ...options, search: (query) => { const task = deferred(); pending.set(query, task); return task.promise; } });
  controlled.query("pending"); await controlled.until(() => pending.has("pending"));
  assert.equal(controlled.elements["empty-state"].hidden, true);
  assert.equal(controlled.elements["article-results"].getAttribute("aria-busy"), "true");
  pending.get("pending").resolve({ results: [] }); await controlled.settled();
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
  assert.match(controlled.elements["search-status"].textContent, /“new”/);
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
  console.log("Client states passed: empty catalog/no hits, loading, module/search failure, clear, IME, history, focus, cache and stale page/search responses.");
}
