const carousel = document.querySelector("[data-weekly-carousel]");
if (carousel) {
  const slides = [...carousel.querySelectorAll("[data-weekly-slide]")];
  const controls = carousel.querySelector("[data-weekly-controls]");
  if (slides.length > 1 && controls) {
    const page = carousel.querySelector("[data-weekly-page]");
    const autoplay = carousel.querySelector("[data-weekly-autoplay]");
    const announcement = carousel.querySelector("[data-weekly-announcement]");
    const viewport = carousel.querySelector("[data-weekly-viewport]");
    const compactScreen = window.matchMedia("(max-width: 48rem)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let gesture, blockNextClick = false;
    let animations = [], motionVersion = 0;
    let current = 0, timer;
    let visible = false;
    let paused = reducedMotion.matches;
    slides.forEach((slide) => { slide.hidden = false; });
    controls.hidden = false;

    function updateAutoplay() {
      const label = paused ? "자동 넘김 재생" : "자동 넘김 정지";
      autoplay.setAttribute("aria-label", label);
      autoplay.setAttribute("title", label);
      autoplay.querySelector("[data-weekly-pause-icon]").hidden = paused;
      autoplay.querySelector("[data-weekly-play-icon]").hidden = !paused;
      autoplay.setAttribute("aria-pressed", String(paused));
    }
    function schedule() {
      clearTimeout(timer);
      if (paused || !visible || document.hidden || gesture || slides.some((slide) => slide.contains(document.activeElement))) return;
      timer = setTimeout(() => { show(current + 1); schedule(); }, 3000);
    }
    function clearMotion() {
      ++motionVersion;
      animations.forEach((animation) => animation.cancel());
      animations = [];
      slides.forEach((slide) => { slide.style.transform = ""; delete slide.dataset.moving; });
    }
    function moveSlides(from, to, direction, offset = 0, returning = false) {
      if (reducedMotion.matches || typeof slides[from].animate !== "function") return;
      const version = motionVersion;
      const width = viewport.clientWidth;
      const translate = (x) => `translateX(${x}px)`;
      const options = { duration: 300, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "both" };
      slides[from].dataset.moving = "true"; slides[to].dataset.moving = "true";
      animations = [
        slides[from].animate([{ transform: translate(offset) }, { transform: translate(returning ? 0 : -direction * width) }], options),
        slides[to].animate([{ transform: translate(offset + direction * width) }, { transform: translate(returning ? direction * width : 0) }], options),
      ];
      Promise.allSettled(animations.map((animation) => animation.finished)).then(() => { if (version === motionVersion) clearMotion(); });
    }
    function drawGesture(dx) {
      const width = viewport.clientWidth;
      const offset = Math.max(-width, Math.min(width, dx));
      const direction = dx < 0 ? 1 : -1;
      const preview = (current + direction + slides.length) % slides.length;
      if (gesture.preview !== undefined && gesture.preview !== preview) {
        slides[gesture.preview].style.transform = ""; delete slides[gesture.preview].dataset.moving;
      }
      gesture.offset = offset; gesture.direction = direction; gesture.preview = preview;
      slides[current].style.transform = `translateX(${offset}px)`;
      slides[preview].style.transform = `translateX(${offset + direction * width}px)`;
      slides[preview].dataset.moving = "true";
    }
    function show(index, manual = false, offset = 0) {
      const previous = current, direction = index > current ? 1 : -1;
      clearMotion();
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, position) => {
        const active = position === current;
        if (active) slide.dataset.active = "true";
        else delete slide.dataset.active;
        slide.inert = !active;
      });
      page.textContent = `${current + 1} / ${slides.length}`;
      if (manual) announcement.textContent = `${current + 1} / ${slides.length}: ${slides[current].querySelector("h3").textContent}`;
      if (previous !== current) moveSlides(previous, current, direction, offset);
    }
    carousel.querySelector("[data-weekly-previous]").addEventListener("click", () => { show(current - 1, true); schedule(); });
    carousel.querySelector("[data-weekly-next]").addEventListener("click", () => { show(current + 1, true); schedule(); });
    autoplay.addEventListener("click", () => { paused = !paused; updateAutoplay(); schedule(); });
    // Keep vertical scrolling and pinch zoom native; only horizontal gestures turn a page.
    viewport.addEventListener("pointerdown", (event) => {
      if (!compactScreen.matches || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
      clearMotion();
      blockNextClick = false;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: undefined };
      schedule();
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 10) gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? "x" : "y";
      if (gesture.axis === "x") {
        blockNextClick = true;
        event.preventDefault();
        if (!viewport.hasPointerCapture(event.pointerId)) viewport.setPointerCapture(event.pointerId);
        drawGesture(dx);
      }
    });
    function finishGesture(event, cancelled = false) {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      const horizontal = gesture.axis === "x";
      if (horizontal && !cancelled) drawGesture(dx);
      const offset = gesture.offset || 0, direction = gesture.direction || 1;
      gesture = undefined;
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      if (!cancelled && compactScreen.matches && horizontal && Math.abs(dx) >= Math.max(40, viewport.clientWidth * .12) && Math.abs(dx) > Math.abs(dy) * 1.3) show(current + (dx < 0 ? 1 : -1), true, offset);
      else {
        clearMotion();
        if (horizontal) moveSlides(current, (current + direction + slides.length) % slides.length, direction, offset, true);
      }
      schedule();
    }
    viewport.addEventListener("pointerup", (event) => finishGesture(event));
    viewport.addEventListener("pointercancel", (event) => finishGesture(event, true));
    viewport.addEventListener("dragstart", (event) => { if (compactScreen.matches) event.preventDefault(); });
    viewport.addEventListener("click", (event) => {
      if (blockNextClick && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); blockNextClick = false; }
    }, true);
    // Every user action starts a fresh three-second idle interval.
    for (const event of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"]) window.addEventListener(event, schedule, { passive: true });
    carousel.addEventListener("focusin", schedule);
    carousel.addEventListener("focusout", () => queueMicrotask(schedule));
    document.addEventListener("visibilitychange", schedule);
    window.addEventListener("pagehide", () => { clearTimeout(timer); gesture = undefined; blockNextClick = false; clearMotion(); });
    window.addEventListener("resize", () => { gesture = undefined; clearMotion(); schedule(); });
    window.addEventListener("pageshow", schedule);
    updateAutoplay();
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); }).observe(carousel);
    } else { visible = true; schedule(); }
  }
}
