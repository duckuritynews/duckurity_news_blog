import { exactCveMatches } from "../lib/search.ts";
import { articleUrl } from "../lib/urls";

const form = document.querySelector("#article-controls");
const input = document.querySelector("#article-search");
const sortControl = document.querySelector("#article-sort");
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
const basePath = new URL(config?.dataset.pagefindPath || "./", document.baseURI);
const pageSize = 10;
let pagefind;
let activeRequest = 0;
let composing = false;

function queryState() {
  const params = new URLSearchParams(location.search);
  const sort = ["latest", "oldest", "title"].includes(params.get("sort")) ? params.get("sort") : "latest";
  const requestedPage = Number(params.get("page") || "1");
  return { query: params.get("q") || "", sort, page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1 };
}
function rankField(sort) { return sort === "oldest" ? "oldestRank" : sort === "title" ? "titleKoRank" : "latestRank"; }
function sortedCatalog(sort) { const key = rankField(sort); return [...catalog].sort((a, b) => a[key] - b[key]); }
function updateAddress({ query, sort, page }, replace = false) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (sort !== "latest") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  history[replace ? "replaceState" : "pushState"]({}, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
}
function makeCard(article) {
  const item = document.createElement("li"); item.className = "article-card";
  const meta = document.createElement("div"); meta.className = "card-meta";
  const date = document.createElement("time"); date.dateTime = article.publishedAt;
  date.textContent = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(article.publishedAt));
  meta.append(date);
  if (article.level) { const level = document.createElement("span"); level.textContent = article.level; meta.append(level); }
  const heading = document.createElement("h2"); const link = document.createElement("a");
  link.href = articleUrl(article.slug); link.textContent = article.title; heading.append(link);
  const summary = document.createElement("p"); summary.textContent = article.summary;
  const tags = document.createElement("ul"); tags.className = "tags"; tags.setAttribute("aria-label", "기사 태그");
  for (const value of article.tags || []) { const tag = document.createElement("li"); tag.className = "tag"; tag.textContent = value; tags.append(tag); }
  item.append(meta, heading, summary, tags); return item;
}
function setStatus(text, kind = "normal") { status.replaceChildren(document.createTextNode(text)); status.dataset.kind = kind; }
function setPages(page, pageCount, state) {
  const href = (number) => { const params = new URLSearchParams(); if (state.query) params.set("q", state.query); if (state.sort !== "latest") params.set("sort", state.sort); if (number > 1) params.set("page", String(number)); return `${location.pathname}${params.size ? `?${params}` : ""}`; };
  previous.href = href(Math.max(1, page - 1)); previous.setAttribute("aria-disabled", page <= 1 ? "true" : "false");
  next.href = href(Math.min(pageCount, page + 1)); next.setAttribute("aria-disabled", page >= pageCount ? "true" : "false");
  pageStatus.textContent = `${page} / ${pageCount}`; pagination.hidden = pageCount <= 1;
}
function articleFromMetadata(meta) {
  const slug = meta.articleSlug || ""; const known = catalog.find((article) => article.slug === slug); if (known) return known;
  return { slug, title: meta.title || "보안 기사", summary: meta.summary || "", publishedAt: meta.publishedAt || "", tags: (meta.tags || "").split(/\s+/).filter(Boolean), cveIds: (meta.cveIds || "").split(/\s+/).filter(Boolean), level: meta.level || "", latestRank: Number(meta.latestRank || 0), oldestRank: Number(meta.oldestRank || 0), titleKoRank: Number(meta.titleKoRank || 0) };
}
async function getMatches(query, sort) {
  if (!query) return sortedCatalog(sort);
  const exactCve = exactCveMatches(catalog, query, sort);
  if (exactCve !== null) return exactCve;
  pagefind ||= await import(basePath.href);
  const response = await pagefind.search(query, { sort: { [rankField(sort)]: "asc" } });
  return Promise.all(response.results.map(async (result) => articleFromMetadata((await result.data()).meta)));
}
async function render(state, { address = false, replaceAddress = false } = {}) {
  const request = ++activeRequest; input.value = state.query; sortControl.value = state.sort; emptyState.hidden = true;
  setStatus(state.query ? "검색 결과를 불러오는 중입니다." : "기사 목록을 정렬하는 중입니다.");
  try {
    const matches = await getMatches(state.query, state.sort); if (request !== activeRequest) return;
    const count = matches.length; const pageCount = Math.max(1, Math.ceil(count / pageSize));
    state.page = Math.min(Math.max(1, state.page), pageCount);
    resultsList.replaceChildren(...matches.slice((state.page - 1) * pageSize, state.page * pageSize).map(makeCard));
    emptyState.hidden = count !== 0;
    setStatus(count === 0 ? (state.query ? "검색 결과가 없습니다. 다른 단어로 검색해 보세요." : "게시된 기사가 없습니다.") : `${count}개 결과 · ${state.sort === "oldest" ? "오래된순" : state.sort === "title" ? "가나다순" : "최신순"}`);
    setPages(state.page, pageCount, state); if (address) updateAddress(state, replaceAddress);
  } catch (error) {
    if (request !== activeRequest) return;
    resultsList.replaceChildren(); emptyState.hidden = true; pagination.hidden = true;
    if (address) updateAddress(state, replaceAddress);
    setStatus("검색 색인을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.", "error");
    const retry = document.createElement("button"); retry.type = "button"; retry.className = "button"; retry.textContent = "다시 시도";
    retry.addEventListener("click", () => window.location.reload(), { once: true }); status.append(" ", retry); console.error("Pagefind search failed", error);
  }
}
form.addEventListener("submit", (event) => { event.preventDefault(); render({ query: input.value.trim(), sort: sortControl.value, page: 1 }, { address: true }); });
input.addEventListener("compositionstart", () => { composing = true; });
input.addEventListener("compositionend", () => { composing = false; render({ query: input.value.trim(), sort: sortControl.value, page: 1 }, { address: true, replaceAddress: true }); });
input.addEventListener("input", (event) => { if (!composing && !event.isComposing) render({ query: input.value.trim(), sort: sortControl.value, page: 1 }, { address: true, replaceAddress: true }); });
sortControl.addEventListener("change", () => render({ query: input.value.trim(), sort: sortControl.value, page: 1 }, { address: true }));
for (const [link, direction] of [[previous, -1], [next, 1]]) link.addEventListener("click", (event) => { event.preventDefault(); if (link.getAttribute("aria-disabled") === "true") return; render({ ...queryState(), page: queryState().page + direction }, { address: true }); });
window.addEventListener("popstate", () => render(queryState()));
render(queryState(), { address: true, replaceAddress: true });
