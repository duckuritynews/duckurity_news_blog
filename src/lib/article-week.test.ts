import test from "node:test";
import assert from "node:assert/strict";
import { splitLatestPublicationWeek } from "./article-week.ts";

const article = (date: string) => ({ data: { publishedAt: date } });
test("weekly picks include both articles each day and exclude the preceding Korean week", () => {
  const entries = Array.from({ length: 14 }, (_, i) => article(new Date(Date.parse("2026-10-04T18:00:00+09:00") - Math.floor(i / 2) * 86400000 - (i % 2) * 9 * 3600000).toISOString()));
  const previous = article("2026-09-27T23:59:59+09:00");
  const result = splitLatestPublicationWeek([...entries, previous]);
  assert.deepEqual(result.weekly, entries);
  assert.deepEqual(result.previous, [previous]);
});
test("Korean Monday midnight, year boundaries and old publication weeks are handled", () => {
  const entries = [article("2027-01-03T23:59:59+09:00"), article("2026-12-28T00:00:00+09:00"), article("2026-12-27T14:59:59Z")];
  assert.deepEqual(splitLatestPublicationWeek(entries), { weekly: entries.slice(0, 2), previous: entries.slice(2) });
  const monday = [article("2026-10-04T15:00:00Z"), article("2026-10-04T14:59:59Z")];
  assert.deepEqual(splitLatestPublicationWeek(monday), { weekly: monday.slice(0, 1), previous: monday.slice(1) });
  assert.deepEqual(splitLatestPublicationWeek([]), { weekly: [], previous: [] });
});
