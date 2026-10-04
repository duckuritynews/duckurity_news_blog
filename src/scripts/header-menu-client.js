const menu = document.querySelector(".site-menu");
const toggle = menu?.querySelector("summary");
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
