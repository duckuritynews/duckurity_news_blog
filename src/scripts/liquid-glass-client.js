import "../../public/vendor/liquid-glass/liquid-glass.js";

const instances = new Map();

function isAvailable(element) {
  return element.isConnected && element.offsetWidth && element.offsetHeight &&
    !element.matches(':disabled, [aria-disabled="true"]');
}

function initializeLiquidGlass() {
  for (const [element, glass] of instances) {
    if (isAvailable(element)) continue;
    glass.destroy();
    instances.delete(element);
    delete element.dataset.liquidGlassReady;
  }

  for (const element of document.querySelectorAll("[data-liquid-glass]")) {
    // Hidden and disabled controls need no filter, map, or resize observer.
    if (instances.has(element) || !isAvailable(element)) continue;

    const navigation = element.dataset.liquidGlass === "nav";
    const glass = window.liquidGlass(element, {
      scale: navigation ? -60 : -48,
      chroma: 2,
      border: 0.12,
      mapBlur: 6,
      blur: 1.5,
      saturate: 1.2,
      fallbackBlur: 12,
      ...(navigation ? { radius: Math.min(element.offsetWidth, element.offsetHeight) / 2 } : {}),
    });

    element.dataset.liquidGlassReady = glass.supported ? "refraction" : "frosted";
    instances.set(element, glass);
  }
}

initializeLiquidGlass();
// Preserve existing filters on BFCache restores. Upstream observes size changes;
// position-only navigation transitions never trigger explicit map regeneration.
window.addEventListener("pageshow", initializeLiquidGlass);

let scheduled = false;
const containsGlass = (node) => node.nodeType === 1 &&
  (node.matches("[data-liquid-glass]") || node.querySelector("[data-liquid-glass]"));

// Search replaces recovery buttons and reveals pagination after initial load.
// Observe only structural/availability changes; SVG map updates cannot loop here.
new MutationObserver((mutations) => {
  const changed = mutations.some((mutation) => mutation.type === "attributes"
    ? containsGlass(mutation.target)
    : [...mutation.addedNodes, ...mutation.removedNodes].some(containsGlass));
  if (!changed || scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    initializeLiquidGlass();
  });
}).observe(document.body, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["hidden", "disabled", "aria-disabled", "open"],
});
