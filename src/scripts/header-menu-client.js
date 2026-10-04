const menu = document.querySelector(".site-menu");
const toggle = menu?.querySelector("summary");
const header = document.querySelector(".site-header");
const row = header?.querySelector(".header-row");
const desktopNav = row?.querySelector(".site-nav--desktop");
const brand = row?.querySelector(".brand");
if (header && row && desktopNav && brand && toggle) {
  function updateHeaderLayout() {
    document.documentElement.style.setProperty("--site-header-height", `${header.getBoundingClientRect().height}px`);
    const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
    const neededWidth = brand.getBoundingClientRect().width + desktopNav.getBoundingClientRect().width + toggle.getBoundingClientRect().width + gap * 2;
    const expanded = window.matchMedia("(width > 850px)").matches && neededWidth <= row.clientWidth;
    if (row.hasAttribute("data-expanded-navigation") === expanded) return;
    if ((!expanded && desktopNav.contains(document.activeElement)) ||
        (menu.contains(document.activeElement) && document.activeElement !== toggle)) toggle.focus();
    menu.open = false;
    row.toggleAttribute("data-expanded-navigation", expanded);
    desktopNav.inert = !expanded;
    desktopNav.setAttribute("aria-hidden", String(!expanded));
  }
  const observer = new ResizeObserver(updateHeaderLayout);
  for (const element of [header, row, desktopNav, brand]) observer.observe(element);
  window.addEventListener("resize", updateHeaderLayout);
  window.addEventListener("pageshow", updateHeaderLayout);
  updateHeaderLayout();
}
if (menu && toggle) {
  menu.addEventListener("toggle", () => toggle.setAttribute("aria-label", menu.open ? "메뉴 닫기" : "메뉴 열기"));
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menu.open) return;
    event.preventDefault();
    menu.open = false;
    toggle.focus();
  });
  document.addEventListener("click", (event) => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => { menu.open = false; }));
  window.addEventListener("pagehide", () => { menu.open = false; });
}
