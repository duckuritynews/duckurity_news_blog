import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

class Element {
  listeners = {}; dataset = {}; hidden = false; inert = false; textContent = ""; attributes = {};
  style = {}; animations = [];
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  fire(type, value = {}) { const event = { preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...value }; for (const listener of this.listeners[type] || []) listener(event); return event; }
  setAttribute(name, value) { this.attributes[name] = value; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  toggleAttribute(name, present) { if (present) this.attributes[name] = ""; else delete this.attributes[name]; }
  contains(element) { return this === element; }
  setPointerCapture(id) { this.pointer = id; }
  hasPointerCapture(id) { return this.pointer === id; }
  releasePointerCapture() { this.pointer = undefined; }
  animate(frames, options) {
    let complete;
    const animation = { frames, options, finished: new Promise((resolve) => { complete = resolve; }), cancel() { complete(); }, finish() { complete(); } };
    this.animations.push(animation); return animation;
  }
}
function carouselClient(count = 3, reduced = false, compact = true) {
  let clock = 0, timerId = 0, observer;
  const timers = new Map(), root = new Element(), window = new Element(), document = new Element();
  const slides = Array.from({ length: count }, (_, i) => { const slide = new Element(); slide.querySelector = () => ({ textContent: `Article ${i + 1}` }); slide.inert = i !== 0; if (!i) slide.dataset.active = "true"; return slide; });
  const keys = ["controls", "page", "autoplay", "announcement", "previous", "next", "viewport"];
  const nodes = Object.fromEntries(keys.map((key) => [key, new Element()]));
  nodes.pauseIcon = new Element(); nodes.playIcon = new Element();
  nodes.autoplay.querySelector = (selector) => selector === "[data-weekly-pause-icon]" ? nodes.pauseIcon : nodes.playIcon;
  nodes.controls.hidden = true;
  nodes.viewport.clientWidth = 390;
  root.querySelectorAll = () => slides;
  root.querySelector = (selector) => nodes[selector.slice(13, -1)];
  document.querySelector = () => root;
  document.hidden = false; document.activeElement = null;
  window.matchMedia = (query) => ({ matches: query.includes("reduced-motion") ? reduced : compact });
  window.IntersectionObserver = class { constructor(callback) { observer = callback; } observe() {} };
  vm.runInNewContext(readFileSync(new URL("../src/scripts/weekly-carousel-client.js", import.meta.url), "utf8"), {
    window, document, IntersectionObserver: window.IntersectionObserver, queueMicrotask: (fn) => fn(),
    clearTimeout: (id) => timers.delete(id), setTimeout: (callback, delay) => { timers.set(++timerId, { at: clock + delay, callback }); return timerId; },
  });
  const advance = (ms) => { const end = clock + ms; while (true) { const next = [...timers.entries()].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; timers.delete(next[0]); clock = next[1].at; next[1].callback(); } clock = end; };
  return { slides, nodes, window, document, root, advance, visible: (value) => observer?.([{ isIntersecting: value }]), active: () => slides.findIndex((slide) => slide.dataset.active) };
}
const single = carouselClient(1); single.advance(10000); assert.equal(single.nodes.controls.hidden, true);
const carousel = carouselClient(); carousel.visible(true);
assert.equal(carousel.nodes.autoplay.attributes["aria-label"], "자동 넘김 정지");
assert.equal(carousel.nodes.pauseIcon.hidden, false);
assert.equal(carousel.nodes.playIcon.hidden, true);
carousel.advance(2999); assert.equal(carousel.active(), 0);
carousel.advance(1); assert.equal(carousel.active(), 1);
carousel.nodes.next.fire("click"); assert.equal(carousel.active(), 2);
carousel.advance(2000); carousel.window.fire("pointermove"); carousel.advance(2999); assert.equal(carousel.active(), 2);
carousel.advance(1); assert.equal(carousel.active(), 0, "Idle autoplay wraps to the first article after a fresh three seconds");
carousel.nodes.previous.fire("click"); assert.equal(carousel.active(), 2);
assert.equal(carousel.nodes.page.textContent, "3 / 3");
assert.equal(carousel.slides.filter((slide) => !slide.inert).length, 1, "Only the visible slide is keyboard-accessible");
carousel.nodes.autoplay.fire("click"); carousel.advance(9000); assert.equal(carousel.active(), 2);
assert.equal(carousel.nodes.autoplay.attributes["aria-label"], "자동 넘김 재생");
assert.equal(carousel.nodes.pauseIcon.hidden, true);
assert.equal(carousel.nodes.playIcon.hidden, false);
carousel.nodes.autoplay.fire("click"); carousel.document.hidden = true; carousel.document.fire("visibilitychange"); carousel.advance(9000); assert.equal(carousel.active(), 2);
carousel.document.hidden = false; carousel.document.fire("visibilitychange"); carousel.advance(3000); assert.equal(carousel.active(), 0);
carousel.visible(false); carousel.advance(9000); assert.equal(carousel.active(), 0);
carousel.visible(true); carousel.document.activeElement = carousel.slides[0]; carousel.root.fire("focusin"); carousel.advance(9000); assert.equal(carousel.active(), 0);
carousel.document.activeElement = null; carousel.root.fire("focusout"); carousel.advance(3000); assert.equal(carousel.active(), 1);
carousel.window.fire("pagehide"); carousel.advance(9000); assert.equal(carousel.active(), 1);
carousel.window.fire("pageshow"); carousel.advance(3000); assert.equal(carousel.active(), 2);
const reducedCarousel = carouselClient(2, true); reducedCarousel.visible(true); reducedCarousel.advance(9000); assert.equal(reducedCarousel.active(), 0);
reducedCarousel.nodes.next.fire("click"); assert.equal(reducedCarousel.active(), 1);
assert.equal(reducedCarousel.slides[0].animations.length, 0, "Reduced motion must use immediate page changes");

const swipe = carouselClient(); swipe.visible(true);
const pointer = (x, y = 100, extra = {}) => ({ pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: x, clientY: y, ...extra });
function drag(client, startX, endX, startY = 100, endY = 100) {
  client.nodes.viewport.fire("pointerdown", pointer(startX, startY));
  client.nodes.viewport.fire("pointermove", pointer(endX, endY));
  client.nodes.viewport.fire("pointerup", pointer(endX, endY));
}
swipe.nodes.viewport.fire("pointerdown", pointer(300)); swipe.advance(6000); assert.equal(swipe.active(), 0, "Autoplay must not turn the card while the user holds it");
swipe.nodes.viewport.fire("pointermove", pointer(100));
assert.equal(swipe.slides[0].style.transform, "translateX(-200px)", "The card follows the user's finger");
assert.equal(swipe.slides[1].style.transform, "translateX(190px)");
swipe.nodes.viewport.fire("pointerup", pointer(100));
assert.equal(swipe.active(), 1, "Swipe left opens the next page");
assert.equal(swipe.slides[0].animations.at(-1).options.duration, 300);
assert.equal(swipe.slides[0].animations.at(-1).frames[0].transform, "translateX(-200px)");
assert.equal(swipe.slides[0].animations.at(-1).frames[1].transform, "translateX(-390px)");
assert.equal(swipe.slides[1].animations.at(-1).frames[1].transform, "translateX(0px)");
swipe.slides[0].animations.at(-1).finish(); swipe.slides[1].animations.at(-1).finish();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(swipe.slides[0].style.transform, "");
assert.equal(swipe.slides[0].dataset.moving, undefined, "Completed animations leave no extra visible slides");
assert.equal(swipe.nodes.viewport.fire("click", { detail: 1 }).defaultPrevented, true, "A swipe must not also open the article");
swipe.advance(2999); assert.equal(swipe.active(), 1); swipe.advance(1); assert.equal(swipe.active(), 2, "Swiping starts a fresh three-second idle interval");
drag(swipe, 100, 300); assert.equal(swipe.active(), 1, "Swipe right opens the previous page");
drag(swipe, 100, 300); drag(swipe, 100, 300); assert.equal(swipe.active(), 2, "Swipe pagination wraps at either end");
drag(swipe, 200, 210, 100, 300); assert.equal(swipe.active(), 2, "Vertical scrolling does not turn a page");
drag(swipe, 200, 220); assert.equal(swipe.active(), 2, "A short drag does not turn a page");
assert.equal(swipe.slides[2].animations.at(-1).frames[1].transform, "translateX(0px)", "Short drags animate back to their starting position");
swipe.nodes.viewport.fire("pointerdown", pointer(200)); swipe.nodes.viewport.fire("pointerup", pointer(200));
assert.ok(!swipe.nodes.viewport.fire("click", { detail: 1 }).defaultPrevented, "A normal tap still opens the article");
swipe.nodes.viewport.fire("pointerdown", pointer(300)); swipe.nodes.viewport.fire("pointermove", pointer(100)); swipe.nodes.viewport.fire("pointercancel", pointer(100)); assert.equal(swipe.active(), 2);
assert.ok(!swipe.nodes.viewport.fire("click", { detail: 0 }).defaultPrevented, "Keyboard activation remains available after a cancelled drag");
const desktop = carouselClient(3, false, false); drag(desktop, 300, 100); assert.equal(desktop.active(), 0, "Desktop article selection does not become swipe pagination");
swipe.nodes.viewport.fire("pointerdown", pointer(300, 100, { isPrimary: false })); swipe.nodes.viewport.fire("pointerup", pointer(100)); assert.equal(swipe.active(), 2, "Secondary touches must not turn a page");

function topClient(reduced = false) {
  const button = new Element(), window = new Element();
  let time = 0, frame;
  window.scrollY = 0; window.matchMedia = () => ({ matches: reduced });
  const positions = [];
  window.scrollTo = ({ top }) => { window.scrollY = top; positions.push(top); window.fire("scroll"); };
  vm.runInNewContext(readFileSync(new URL("../src/scripts/back-to-top-client.js", import.meta.url), "utf8"), {
    window, document: { querySelector: () => button }, performance: { now: () => time },
    requestAnimationFrame: (callback) => { frame = callback; return 1; }, cancelAnimationFrame: () => { frame = null; },
  });
  return { button, window, positions, tick: (now) => { time = now; const callback = frame; frame = null; callback?.(time); } };
}
const top = topClient(); assert.equal(top.button.hidden, true);
top.window.scrollY = 1200; top.window.fire("scroll"); assert.equal(top.button.hidden, false);
top.button.fire("click"); assert.equal(top.window.scrollY, 1200, "Click must animate rather than instantly jump");
top.tick(150); assert.equal(top.window.scrollY, 150); assert.equal(top.button.hidden, false);
top.tick(300); assert.equal(top.window.scrollY, 0); assert.equal(top.button.hidden, true);
top.window.scrollY = 1200; top.window.fire("scroll"); top.button.fire("click"); top.tick(350); top.window.fire("wheel"); const cancelled = top.window.scrollY; top.tick(600); assert.equal(top.window.scrollY, cancelled);
const reducedTop = topClient(true); reducedTop.window.scrollY = 300; reducedTop.button.fire("click"); assert.equal(reducedTop.window.scrollY, 0);
// Exercise measured desktop fit as well as the mobile cutoff and focus recovery.
{
  const menu = new Element(), toggle = new Element(), header = new Element(), row = new Element();
  const nav = new Element(), brand = new Element(), window = new Element(), document = new Element();
  let desktopWidth = true, headerHeight = 77, resize;
  const properties = new Map();
  document.documentElement = { style: { setProperty: (key, value) => properties.set(key, value) } };
  document.activeElement = null;
  document.querySelector = (selector) => selector === ".site-menu" ? menu : header;
  header.querySelector = () => row;
  row.querySelector = (selector) => selector === ".brand" ? brand : nav;
  menu.querySelector = () => toggle; menu.querySelectorAll = () => [];
  header.getBoundingClientRect = () => ({ height: headerHeight });
  brand.getBoundingClientRect = () => ({ width: 300 });
  nav.getBoundingClientRect = () => ({ width: 250 });
  toggle.getBoundingClientRect = () => ({ width: 44 });
  toggle.focus = () => { document.activeElement = toggle; };
  window.matchMedia = (query) => { assert.equal(query, "(width > 850px)"); return { matches: desktopWidth }; };
  row.clientWidth = 1100; nav.inert = true;
  vm.runInNewContext(readFileSync(new URL("../src/scripts/header-menu-client.js", import.meta.url), "utf8"), {
    document, window, getComputedStyle: () => ({ columnGap: "12px" }),
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} },
  });
  assert.equal(row.hasAttribute("data-expanded-navigation"), true);
  assert.equal(nav.inert, false);
  assert.equal(nav.attributes["aria-hidden"], "false");
  document.activeElement = nav;
  row.clientWidth = 617; resize();
  assert.equal(row.hasAttribute("data-expanded-navigation"), false, "Interfering desktop links collapse before overlapping the brand");
  assert.equal(nav.inert, true); assert.equal(document.activeElement, toggle);
  row.clientWidth = 618; resize();
  assert.equal(row.hasAttribute("data-expanded-navigation"), true, "Navigation expands when its full measured width fits");
  desktopWidth = false; headerHeight = 65; window.fire("resize");
  assert.equal(row.hasAttribute("data-expanded-navigation"), false, "Mobile retains the hamburger even when links could fit");
  assert.equal(properties.get("--site-header-height"), "65px", "The floating return button follows the actual header height");
  menu.open = true; menu.fire("toggle"); assert.equal(toggle.attributes["aria-label"], "메뉴 닫기");
  menu.fire("keydown", { key: "Escape" }); assert.equal(menu.open, false); assert.equal(document.activeElement, toggle);
  menu.open = true; document.fire("click", { target: brand }); assert.equal(menu.open, false);
  menu.open = true; window.fire("pagehide"); assert.equal(menu.open, false);
}
console.log("Header interactions passed: measured fit/overflow, desktop/mobile resize, focus recovery, header-height tracking, Escape and outside click.");
console.log("Home interactions passed: weekly pagination, swipe/tap/vertical scroll/cancellation, three-second inactivity, manual controls, wraparound, focus/visibility/pause/BFCache and 300ms back-to-top.");
