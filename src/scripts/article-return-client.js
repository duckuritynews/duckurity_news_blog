// Keep the ordinary archive link as a fallback for direct visits and blocked storage.
const back = document.querySelector(".article-header__back");
if (back) {
  try {
    const archive = new URL(back.href, document.baseURI);
    let returnUrl;
    if (document.referrer) returnUrl = new URL(document.referrer);
    else {
      const saved = JSON.parse(sessionStorage.getItem("duckurity:archive-return") || "null");
      if (saved?.articlePath === location.pathname) returnUrl = new URL(saved.archiveUrl, document.baseURI);
    }
    if (returnUrl?.origin === archive.origin && returnUrl.pathname === archive.pathname) {
      back.href = returnUrl.href;
      back.setAttribute("aria-label", "이전 검색 결과로 돌아가기");
    }
  } catch { /* The static archive link remains usable. */ }
}
