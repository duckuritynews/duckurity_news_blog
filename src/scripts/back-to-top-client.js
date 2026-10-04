const button = document.querySelector(".back-to-top");
if (button) {
  let frame;
  const updateVisibility = () => { button.hidden = window.scrollY <= 0; };
  const cancel = () => { cancelAnimationFrame(frame); frame = undefined; };
  window.addEventListener("scroll", updateVisibility, { passive: true });
  window.addEventListener("pageshow", updateVisibility);
  window.addEventListener("pagehide", cancel);
  for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) window.addEventListener(event, cancel, { passive: true });
  button.addEventListener("click", () => {
    cancel();
    const start = window.scrollY;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo({ top: 0, behavior: "instant" }); updateVisibility(); return;
    }
    const startedAt = performance.now();
    const move = (now) => {
      const progress = Math.min(1, (now - startedAt) / 300);
      window.scrollTo({ top: start * (1 - progress) ** 3, behavior: "instant" });
      if (progress < 1) frame = requestAnimationFrame(move);
      else { frame = undefined; updateVisibility(); }
    };
    frame = requestAnimationFrame(move);
  });
  updateVisibility();
}
