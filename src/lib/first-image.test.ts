import assert from "node:assert/strict";
import test from "node:test";
import { markdownToHtml } from "satteri";
import { firstImageFromHtml } from "./first-image.ts";

test("the first displayed image excludes Markdown comments and code examples", () => {
  const { html } = markdownToHtml([
    '<!-- ![not an image](./missing.png) <img src="comment.png"> -->',
    '`![inline example](./example.png)`',
    '```md', '![fenced example](./example.png)', '```',
    '![First duck](./images/duck.png)', '![Second duck](./images/other.png)',
  ].join("\n\n"));
  assert.equal(firstImageFromHtml(html)?.src, "./images/duck.png");
  assert.equal(firstImageFromHtml(html)?.alt, "First duck");
});

test("reference images follow usage order rather than definition order", () => {
  const { html } = markdownToHtml('[second]: ./second.png\n[first]: ./first.png\n\n![First][first]\n\n![Second][second]');
  assert.equal(firstImageFromHtml(html)?.src, "./first.png");
});

test("HTML image attributes preserve escaping and dimensions", () => {
  assert.deepEqual(firstImageFromHtml('<picture><img src="/base/duck.webp?a=1&amp;b=2" alt="Duck &amp; shield" width="640" height="480"></picture>'), {
    src: "/base/duck.webp?a=1&b=2", alt: "Duck & shield", width: 640, height: 480,
  });
});

test("remote images without dimensions remain usable", () => {
  assert.deepEqual(firstImageFromHtml('<img src="https://example.org/duck.webp" alt="Duck">'), {
    src: "https://example.org/duck.webp", alt: "Duck", width: undefined, height: undefined,
  });
});

test("an article without a displayed image has no fallback", () => {
  assert.equal(firstImageFromHtml('<p>No images</p><!-- <img src="hidden.png"> --><pre>&lt;img src="example.png"&gt;</pre>'), undefined);
});
