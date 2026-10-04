// Browser history preserves the previous page, search results and scroll position.
// Direct visits and new tabs retain an ordinary archive link as a fallback.
const back = document.querySelector(".article-header__back");
if (back) {
  try {
    const archive = new URL(back.href, document.baseURI);
    const sitePath = archive.pathname.replace(/archive\/$/, "");
    let returnUrl;
    let fromReferrer = false;
    if (document.referrer) { returnUrl = new URL(document.referrer); fromReferrer = true; }
    else {
      const saved = JSON.parse(sessionStorage.getItem("duckurity:archive-return") || "null");
      if (saved?.articlePath === location.pathname) returnUrl = new URL(saved.archiveUrl, document.baseURI);
    }
    if (returnUrl?.origin === archive.origin && returnUrl.pathname.startsWith(sitePath) && returnUrl.pathname !== location.pathname) {
      back.href = returnUrl.href;
      if (fromReferrer && history.length > 1) back.addEventListener("click", (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        history.back();
      });
    }
  } catch { /* The static archive link remains usable. */ }
}
