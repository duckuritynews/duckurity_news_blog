const copies = [...document.querySelectorAll(".home-hero [data-preferred-wrap]")].map((element) => ({
  element,
  text: element.textContent.replace(/\s+/g, " ").trim(),
}));

if (copies.length) {
  function updateCopyWrapping() {
    for (const { element, text } of copies) {
      let available = element.clientWidth;
      if (element.classList.contains("home-button__label")) {
        // Measure the button's capacity, not its already wrapped label width;
        // otherwise the narrower two-line button would never expand again.
        const button = element.parentElement;
        const actions = button.parentElement;
        const style = getComputedStyle(button);
        const number = (value) => Number.parseFloat(value) || 0;
        const arrow = element.nextElementSibling?.getBoundingClientRect().width || 0;
        available = actions.clientWidth - number(style.paddingLeft) - number(style.paddingRight)
          - number(style.borderLeftWidth) - number(style.borderRightWidth)
          - arrow - (arrow ? number(style.columnGap) : 0);
      }
      const measure = document.createElement("span");
      measure.setAttribute("aria-hidden", "true");
      measure.style.cssText = "position:fixed;left:0;top:0;width:max-content;max-width:none;white-space:pre;visibility:hidden;pointer-events:none;font:inherit;letter-spacing:inherit;";
      measure.textContent = text;
      element.append(measure);
      const needed = measure.getBoundingClientRect().width;
      measure.remove();
      element.toggleAttribute("data-wrap-needed", needed > available + .5);
    }
  }
  const observer = new ResizeObserver(updateCopyWrapping);
  for (const { element } of copies) observer.observe(element);
  const actions = document.querySelector(".home-hero .home-actions");
  if (actions) observer.observe(actions);
  window.addEventListener("resize", updateCopyWrapping);
  window.addEventListener("pageshow", updateCopyWrapping);
  document.fonts?.ready.then(updateCopyWrapping);
  updateCopyWrapping();
}
