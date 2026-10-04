import { exactCveMatches } from "../lib/search.ts";
import { articleUrl } from "../lib/urls";
import { archivePageSizes, normalizeView } from "../lib/article-sort.ts";

const form = document.querySelector("#article-controls");
const input = document.querySelector("#article-search");
const sortControl = document.querySelector("#article-sort");
const cardsControl = document.querySelector("#view-cards");
const listControl = document.querySelector("#view-list");
const resultsList = document.querySelector("#article-results");
const status = document.querySelector("#search-status");
const emptyState = document.querySelector("#empty-state");
const pagination = document.querySelector("#pagination");
const previous = document.querySelector("#previous-page");
const next = document.querySelector("#next-page");
const pageStatus = document.querySelector("#page-status");
const config = document.querySelector("#search-config");
const catalogElement = document.querySelector("#article-catalog");
const catalog = JSON.parse(catalogElement?.textContent || "[]");
const catalogBySlug = new Map(catalog.map((article) => [article.slug, article]));
const basePath = new URL(config?.dataset.pagefindPath || "./", document.baseURI);
let pagefind;
let activeRequest = 0;
let composing = false;
let lastSearch;
let requestedState;

function queryState() {
  const params = new URLSearchParams(location.search);
  const sort = ["latest", "oldest", "title"].includes(params.get("sort")) ? params.get("sort") : "latest";
  const requestedPage = Number(params.get("page") || "1");
  return { query: params.get("q") || "", sort, view: normalizeView(params.get("view")), page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1 };
}
function rankField(sort) { return sort === "oldest" ? "oldestRank" : sort === "title" ? "titleKoRank" : "latestRank"; }
function sortedCatalog(sort) { const key = rankField(sort); return [...catalog].sort((a, b) => a[key] - b[key]); }
function homeAnchor() { return ["#article-archive", "#main"].includes(location.hash) ? location.hash : ""; }
function stateAddress({ query, sort, page, view }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (sort !== "latest") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  if (view === "list") params.set("view", view);
  return `${location.pathname}${params.size ? `?${params}` : ""}${homeAnchor()}`;
}
function updateAddress(state, replace = false) {
  history[replace ? "replaceState" : "pushState"]({}, "", stateAddress(state));
}
function makeCard(article) {
  const item = document.createElement("li"); item.className = "article-card";
  const link = document.createElement("a"); link.className = "article-card__link";
  link.href = article.href || articleUrl(article.slug);
  link.addEventListener("click", () => {
    // Retain the exact archive context even when the browser suppresses referrers.
    try {
      sessionStorage.setItem("duckurity:archive-return", JSON.stringify({
        articlePath: new URL(link.href, document.baseURI).pathname,
        archiveUrl: stateAddress(requestedState || queryState()),
      }));
    } catch { /* Navigation still works when browser storage is unavailable. */ }
  });
  const titleId = `article-card-title-${article.slug}`; link.setAttribute("aria-labelledby", titleId);
  const media = document.createElement("div"); media.className = "article-card__media";
  if (article.thumbnail) {
    const image = document.createElement("img");
    for (const key of ["src", "width", "height", "alt"]) if (article.thumbnail[key] != null) image.setAttribute(key, article.thumbnail[key]);
    image.setAttribute("loading", "lazy"); media.append(image);
  } else {
    const placeholder = document.createElement("div"); placeholder.className = "home-image-slot"; placeholder.setAttribute("aria-hidden", "true");
    const caption = document.createElement("span"); caption.textContent = "썸네일 준비 중"; placeholder.append(caption); media.append(placeholder);
  }
  const body = document.createElement("div"); body.className = "article-card__body";
  const meta = document.createElement("div"); meta.className = "card-meta";
  const date = document.createElement("time"); date.dateTime = article.publishedAt;
  date.textContent = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(article.publishedAt));
  meta.append(date);
  const heading = document.createElement("h2"); heading.className = "article-card__title"; heading.id = titleId;
  const title = document.createElement("span"); title.className = "article-card__title-link"; title.textContent = article.title; heading.append(title);
  const summary = document.createElement("p"); summary.className = "article-card__summary"; summary.textContent = article.summary;
  const tags = document.createElement("ul"); tags.className = "tags"; tags.setAttribute("aria-label", "기사 태그");
  for (const value of article.tags || []) { const tag = document.createElement("li"); tag.className = "tag"; tag.textContent = value; tags.append(tag); }
  const read = document.createElement("span"); read.className = "article-card__read"; read.setAttribute("aria-hidden", "true"); read.textContent = "읽으러 가기 →";
  const footer = document.createElement("div"); footer.className = "article-card__footer"; footer.append(tags, read);
  body.append(meta, heading, summary, footer); link.append(media, body); item.append(link); return item;
}
function setStatus(text, kind = "normal", count) {
  if (count === undefined) status.replaceChildren(document.createTextNode(text));
  else {
    const number = document.createElement("strong"); number.textContent = String(count);
    status.replaceChildren(number, document.createTextNode(text));
  }
  status.dataset.kind = kind;
}
function setEmptyState(state) {
  const message = document.createElement("p");
  message.textContent = catalog.length
    ? `${state.query ? `“${state.query}”와 일치하는 기사가 없습니다. ` : ""}다른 검색어로 검색하거나 전체 글을 확인해 보세요.`
    : "아직 게시된 기사가 없습니다. 새 기사를 준비하고 있습니다. 나중에 다시 방문해 주세요.";
  emptyState.replaceChildren(message);
  if (!catalog.length || !state.query) return;
  const actions = document.createElement("div"); actions.className = "empty-state__actions";
  const clear = document.createElement("button"); clear.type = "button"; clear.id = "clear-search"; clear.className = "button";
  clear.dataset.liquidGlass = "control";
  clear.textContent = "검색어 지우기"; clear.setAttribute("aria-controls", "article-results");
  clear.addEventListener("click", () => {
    render({ ...state, query: "", page: 1 }, { address: true });
    input.focus({ preventScroll: true });
  });
  const allState = { query: "", sort: "latest", view: state.view, page: 1 };
  const all = document.createElement("a"); all.id = "show-all-articles"; all.className = "button"; all.href = stateAddress(allState); all.textContent = "전체 글 보기";
  all.dataset.liquidGlass = "control";
  all.addEventListener("click", (event) => { event.preventDefault(); render(allState, { address: true, moveToResults: true }); });
  actions.append(clear, all); emptyState.append(actions);
}
function setPages(page, pageCount, state) {
  const href = (number) => stateAddress({ ...state, page: number });
  previous.href = href(Math.max(1, page - 1)); previous.setAttribute("aria-disabled", page <= 1 ? "true" : "false");
  next.href = href(Math.min(pageCount, page + 1)); next.setAttribute("aria-disabled", page >= pageCount ? "true" : "false");
  pageStatus.textContent = `${page} / ${pageCount}`; pagination.hidden = pageCount <= 1;
}
function articleFromMetadata(meta) {
  const slug = meta.articleSlug || ""; const known = catalogBySlug.get(slug); if (known) return known;
  return { slug, title: meta.title || "보안 기사", summary: meta.summary || "", publishedAt: meta.publishedAt || "", tags: (meta.tags || "").split(/\s+/).filter(Boolean), cveIds: (meta.cveIds || "").split(/\s+/).filter(Boolean), level: meta.level || "", latestRank: Number(meta.latestRank || 0), oldestRank: Number(meta.oldestRank || 0), titleKoRank: Number(meta.titleKoRank || 0) };
}
async function findMatches(query, sort) {
  const local = !query || !catalog.length ? sortedCatalog(sort) : exactCveMatches(catalog, query, sort);
  if (local !== null) return { count: local.length, readPage: (start, end) => local.slice(start, end) };
  pagefind ||= await import(basePath.href);
  const response = await pagefind.search(query, { sort: { [rankField(sort)]: "asc" } });
  // Pagefind sorts the entire matching set using the indexed ranks before slicing.
  // Keep only this query/sort's display data; back/next need not fetch it again.
  const loaded = new Map();
  return {
    count: response.results.length,
    readPage: (start, end) => Promise.all(response.results.slice(start, end).map((result) => {
      if (!loaded.has(result.id)) loaded.set(result.id, result.data().then((data) => articleFromMetadata(data.meta)));
      return loaded.get(result.id);
    })),
  };
}
function getMatches(query, sort) {
  const key = JSON.stringify([query, sort]);
  if (lastSearch?.key !== key) lastSearch = { key, promise: findMatches(query, sort) };
  return lastSearch.promise;
}
async function render(state, { address = false, replaceAddress = false, moveToResults = false } = {}) {
  state.view = normalizeView(state.view);
  // Save controls before awaiting Pagefind so leaving during a search keeps its URL.
  if (address) updateAddress(state, replaceAddress);
  const pageSize = archivePageSizes[state.view];
  requestedState = { ...state };
  const request = ++activeRequest; input.value = state.query; sortControl.value = state.sort; emptyState.hidden = true;
  resultsList.dataset.view = state.view;
  cardsControl.setAttribute("aria-pressed", state.view === "cards" ? "true" : "false");
  listControl.setAttribute("aria-pressed", state.view === "list" ? "true" : "false");
  resultsList.setAttribute("aria-busy", "true");
  setStatus(state.query ? "검색 결과를 불러오는 중입니다." : "기사 목록을 정렬하는 중입니다.");
  try {
    const matches = await getMatches(state.query, state.sort); if (request !== activeRequest) return;
    const count = matches.count; const pageCount = Math.max(1, Math.ceil(count / pageSize));
    state.page = Math.min(Math.max(1, state.page), pageCount);
    const articles = await matches.readPage((state.page - 1) * pageSize, state.page * pageSize);
    if (request !== activeRequest) return;
    requestedState = { ...state };
    resultsList.replaceChildren(...articles.map(makeCard));
    resultsList.setAttribute("aria-busy", "false");
    resultsList.setAttribute("aria-label", `보안 뉴스 목록 · ${state.page} / ${pageCount} 페이지`);
    emptyState.hidden = count !== 0;
    setEmptyState(state);
    setStatus(`개 결과${pageCount > 1 ? ` · ${state.page} / ${pageCount}페이지` : ""}`, "normal", count);
    setPages(state.page, pageCount, state); if (address) updateAddress(state, true);
    if (moveToResults && count) {
      resultsList.focus({ preventScroll: true });
      resultsList.scrollIntoView({ block: "start", behavior: "instant" });
    }
  } catch (error) {
    if (request !== activeRequest) return;
    lastSearch = undefined;
    resultsList.setAttribute("aria-busy", "false");
    resultsList.replaceChildren(); emptyState.hidden = true; pagination.hidden = true;
    setStatus("검색 색인을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.", "error");
    const retry = document.createElement("button"); retry.type = "button"; retry.className = "button"; retry.textContent = "다시 시도";
    retry.dataset.liquidGlass = "control";
    retry.addEventListener("click", () => window.location.reload(), { once: true }); status.append(" ", retry); console.error("Pagefind search failed", error);
  }
}
function controlsState() { return { query: input.value.trim(), sort: sortControl.value, view: requestedState?.view ?? queryState().view, page: 1 }; }
form.addEventListener("submit", (event) => { event.preventDefault(); render(controlsState(), { address: true }); });
input.addEventListener("compositionstart", () => { composing = true; ++activeRequest; });
input.addEventListener("compositionend", () => { composing = false; render(controlsState(), { address: true, replaceAddress: true }); });
input.addEventListener("input", (event) => { if (!composing && !event.isComposing) render(controlsState(), { address: true, replaceAddress: true }); });
sortControl.addEventListener("change", () => render(controlsState(), { address: true }));
for (const [control, view] of [[cardsControl, "cards"], [listControl, "list"]]) control.addEventListener("click", () => { if (requestedState?.view !== view) render({ ...controlsState(), view }, { address: true }); });
for (const [link, direction] of [[previous, -1], [next, 1]]) link.addEventListener("click", (event) => { event.preventDefault(); if (link.getAttribute("aria-disabled") === "true") return; const state = requestedState || queryState(); render({ ...state, page: state.page + direction }, { address: true, moveToResults: true }); });
window.addEventListener("popstate", () => render(queryState(), { address: true, replaceAddress: true }));
window.addEventListener("pagehide", () => { ++activeRequest; composing = false; });
window.addEventListener("pageshow", (event) => { if (event.persisted) render(queryState(), { address: true, replaceAddress: true }); });
render(queryState(), { address: true, replaceAddress: true });
