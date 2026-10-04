const day = 86_400_000;
const koreaOffset = 9 * 60 * 60 * 1000;

// The newest published article anchors the newsletter's Monday–Sunday week in Korea.
export function splitLatestPublicationWeek<T extends { data: { publishedAt: string } }>(ordered: readonly T[]) {
  const latest = Date.parse(ordered[0]?.data.publishedAt ?? "");
  if (!Number.isFinite(latest)) return { weekly: [] as T[], previous: [...ordered] };
  const koreanDate = new Date(latest + koreaOffset);
  const midnight = Date.UTC(koreanDate.getUTCFullYear(), koreanDate.getUTCMonth(), koreanDate.getUTCDate());
  const monday = midnight - ((koreanDate.getUTCDay() + 6) % 7) * day - koreaOffset;
  const weekly: T[] = [], previous: T[] = [];
  for (const article of ordered) {
    const published = Date.parse(article.data.publishedAt);
    (published >= monday && published < monday + 7 * day ? weekly : previous).push(article);
  }
  return { weekly, previous };
}
