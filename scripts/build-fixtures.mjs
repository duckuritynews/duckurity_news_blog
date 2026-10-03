import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const tempRoot = mkdtempSync(join(tmpdir(), "duckurity-blog-fixtures-"));
const fixtureRoot = join(tempRoot, "articles");
const outDir = join(tempRoot, "dist");
const keepFixtures = process.env.KEEP_FIXTURES === "1";
const titles = [
  "\uBCF4\uC548 \uACF5\uC9C0: \uBAA8\uBC14\uC77C \uD654\uBA74\uC5D0\uC11C\uB3C4 \uAE38\uAC8C \uC4F0\uB294 \uC81C\uBAA9\uC744 \uC27D\uAC8C \uC77D\uB294 \uC778\uD130\uD398\uC774\uC2A4\uB85C \uD655\uC778\uD569\uB2C8\uB2E4",
  "\uC870\uC0AC 2: \uC0C8 \uBC84\uC804 \uD655\uC778", "\uC870\uC0AC 10: \uC0C8 \uBC84\uC804 \uD655\uC778",
  "\uD55C\uAE00 \uC5B4\uC808 \uAC80\uC0C9\uC744 \uD655\uC778\uD558\uB294 \uC0D8\uD50C",
  "\uD0DC\uADF8\uB85C \uCC3E\uC744 \uC218 \uC788\uB294 \uAE30\uC0AC", "\uAC19\uC740 CVE\uB97C \uB2E4\uB8E8\uB294 \uCCAB \uBC88\uC9F8 \uBD84\uC11D",
  "\uAC19\uC740 CVE\uB97C \uB2E4\uB8E8\uB294 \uB450 \uBC88\uC9F8 \uBD84\uC11D", "\uB2E4\uB978 CVE\uC640 \uD63C\uB3D9\uD558\uC9C0 \uC54A\uB294 \uAC80\uC0C9",
  "\uD45C\uC640 \uCF54\uB4DC \uBE14\uB85D\uC744 \uD3EC\uD568\uD55C \uAE30\uC0AC", "\uC138\uB85C \uC0AC\uC9C4\uC774 \uD3EC\uD568\uB41C \uD14C\uC2A4\uD2B8",
  "\uC81C\uBAA9\uACFC \uBCF8\uBB38\uC774 \uAE38\uACE0 \uB9CE\uC740 \uD0DC\uADF8\uB97C \uAC00\uC9C4 \uC0D8\uD50C \uAE30\uC0AC", "\uC774\uBBF8\uC9C0 \uBE44\uC728\uC744 \uBE44\uAD50\uD558\uB294 \uC0D8\uD50C"
];
const tags = [
  ["\uBCF4\uC548", "\uC778\uD130\uD398\uC774\uC2A4", "\uBAA8\uBC14\uC77C"], ["\uD328\uCE58", "\uC5C5\uB370\uC774\uD2B8"],
  ["\uD328\uCE58", "\uC5C5\uB370\uC774\uD2B8"], ["\uD55C\uAE00\uAC80\uC0C9", "\uAC80\uC0C9"],
  ["\uD0DC\uADF8\uAC80\uC0C9", "\uBD84\uC11D"], ["CVE", "\uBD84\uC11D"], ["CVE", "\uBD84\uC11D"], ["CVE", "\uC870\uC0AC"],
  ["\uD45C", "\uCF54\uB4DC", "\uBD84\uC11D"], ["\uC774\uBBF8\uC9C0", "\uBAA8\uBC14\uC77C"],
  ["\uAE34 \uD0DC\uADF8: \uC81C\uBAA9\uACFC \uBCF8\uBB38\uC5D0\uC11C \uC77D\uAE30 \uC88B\uC740 \uC774\uB984", "\uAC80\uC0C9", "\uBCF4\uC548"], ["\uC774\uBBF8\uC9C0", "\uD14C\uC2A4\uD2B8"]
];
// Enough articles to cross both 18-card and 20-row boundaries through page three.
for (let index = titles.length; index < 42; index++) {
  titles.push(`추가 검증 기사 ${index + 1}: 검색과 보기 전환`);
  tags.push(["보안", "추가 검증"]);
}
const json = (value) => JSON.stringify(value);
const svg = (w, h, fill, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${fill}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-size="24">${label}</text></svg>`;

try {
  for (let i = 0; i < titles.length; i++) {
    const slug = `sample-${String(i + 1).padStart(2, "0")}`;
    const publishedAt = new Date(Date.now() - (i + 1) * 86400000).toISOString();
    const cveIds = i === 5 || i === 6 ? ["CVE-2026-12345"] : i === 7 ? ["CVE-2026-12346"] : [];
    const summary = `Synthetic preview article ${i + 1}: a distinct search fixture with enough descriptive copy to exercise cards, tags, dates, and mobile wrapping.`;
    const keyPoints = [
      "The opening point stays visible before the long-form analysis.",
      "Searchable text can match titles, body paragraphs, aliases, and tags.",
      "This fixture is temporary and does not represent a published news report."
    ];
    let body = [
      "## Situation overview", "", "This is synthetic UI fixture content, not a real incident report.",
      "The mobile preview checks wrapping, readable spacing, and the summary-first reading path.", "",
      "### What to notice", "", "- Long URLs wrap without widening the viewport.",
      "- Search includes the article body and tag terms.", "- Dates and tags remain visible on compact screens.", ""
    ].join("\n");
    if (i === 3) body += "\nA CVE identifier found only in article body text: CVE-2026-34567.\n";
    if (i === 8) body += [
      "",
      "| Signal | Example | Context | Source | Date | Status | Notes | Owner |", "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| Search | Query match | Synthetic | Fixture | 2026-09-30 | Ready | wraps | UI |",
      "| Sort | Stable rank | Synthetic | Fixture | 2026-09-30 | Ready | ties | UI |", "",
      "```js", "const sample = [\"Korean\", \"English\", \"CVE-2026-12345\"];", "console.log(sample.join(\" \\u00b7 \"));", "```", "",
      "A deliberately long link: https://example.org/security/research/example/path/with/many/segments/that-should-wrap-on-a-narrow-mobile-viewport-without-horizontal-page-overflow.", ""
    ].join("\n");
    if (i === 0) body += "\n" + "Extended sample paragraph used to check the reading width, line height, and the transition from key points into article prose. ".repeat(18);
    if (i === 11) {
      const images = join(fixtureRoot, slug, "images"); mkdirSync(images, { recursive: true });
      writeFileSync(join(images, "landscape.svg"), svg(900, 320, "#17635f", "Landscape"), "utf8");
      writeFileSync(join(images, "portrait.svg"), svg(320, 900, "#69518c", "Portrait"), "utf8");
      writeFileSync(join(images, "square.svg"), svg(512, 512, "#a85a37", "Square"), "utf8");
      for (const format of ["png", "jpeg", "webp"]) {
        await sharp({ create: { width: 32, height: 24, channels: 3, background: "#17635f" } })
          .toFormat(format).toFile(join(images, `raster.${format}`));
        body += `\n![Raster ${format}](./images/raster.${format})\n`;
      }
      body += "\n### Image aspect ratio fixtures\n\n![Landscape sample](./images/landscape.svg)\n\n![Portrait sample](./images/portrait.svg)\n\n![Square sample](./images/square.svg)\n";
    }
    body += "\n## References\n\n- Synthetic fixture source: temporary local preview\n- Checked: 2026-09-30\n";
    const coverFields = i === 11 ? ["cover: ./images/landscape.svg", "coverAlt: Synthetic landscape thumbnail"] : [];
    const frontmatter = ["---", `slug: ${json(slug)}`, `title: ${json(titles[i])}`, `summary: ${json(summary)}`, `publishedAt: ${json(publishedAt)}`, "draft: false", `authors: ${json(["Duckurity UI fixture"])}`, `tags: ${json(tags[i])}`, `keyPoints: ${json(keyPoints)}`, `level: ${json(i % 2 ? "\uC911\uAE09" : "\uCD08\uAE09")}`, `searchAliases: ${json([`fixture-${i + 1}`])}`, `cveIds: ${json(cveIds)}`, ...coverFields, "---", ""].join("\n");
    const articleDir = join(fixtureRoot, slug); mkdirSync(articleDir, { recursive: true });
    writeFileSync(join(articleDir, "index.md"), frontmatter + body, "utf8");
    if (i === 11) {
      for (const [name, metadata] of [["unpublished-draft", "draft: true"], ["unpublished-future", 'publishedAt: "2999-01-01T00:00:00Z"']]) {
        const hiddenDir = join(fixtureRoot, name); mkdirSync(hiddenDir, { recursive: true });
        const hiddenFrontmatter = frontmatter.replace(`slug: ${json(slug)}`, `slug: ${json(name)}`)
          .replace(/^cover(?:Alt)?:.*\n/gm, "")
          .replace(name === "unpublished-draft" ? "draft: false" : `publishedAt: ${json(publishedAt)}`, metadata);
        writeFileSync(join(hiddenDir, "index.md"), hiddenFrontmatter + "Unpublished fixture.", "utf8");
      }
    }
  }
  const env = {
    ...process.env,
    ASTRO_CACHE_DIR: join(tempRoot, "astro-cache"),
    BUILD_FIXTURES_DIR: pathToFileURL(fixtureRoot).href,
    SITE_BASE: process.env.SITE_BASE ?? "/duckurity_news_blog",
  };
  const projectRoot = process.cwd();
  const astroCli = join(projectRoot, "node_modules", "astro", "bin", "astro.mjs");
  const pagefindCli = join(projectRoot, "node_modules", "pagefind", "lib", "runner", "bin.cjs");
  const built = spawnSync(process.execPath, [astroCli, "build", "--outDir", outDir], { cwd: projectRoot, env, encoding: "utf8" });
  process.stdout.write(built.stdout || ""); process.stderr.write(built.stderr || "");
  if (built.status !== 0) process.exitCode = built.status ?? 1;
  else {
    const indexed = spawnSync(process.execPath, [pagefindCli, "--site", outDir], { cwd: projectRoot, env, encoding: "utf8" });
    process.stdout.write(indexed.stdout || ""); process.stderr.write(indexed.stderr || "");
    if (indexed.status !== 0) process.exitCode = indexed.status ?? 1;
    else {
      const verified = spawnSync(process.execPath, ["--experimental-strip-types", "--experimental-vm-modules", "scripts/verify-build.mjs", outDir], { cwd: projectRoot, env, encoding: "utf8" });
      process.stdout.write(verified.stdout || ""); process.stderr.write(verified.stderr || "");
      if (verified.status !== 0) process.exitCode = verified.status ?? 1;
      else console.log(`Synthetic preview built and verified with ${titles.length} sample articles at ${outDir}`);
    }
  }
} finally {
  if (keepFixtures) console.log(`KEEP_FIXTURES=1 retained temporary preview at ${outDir}`);
  else {
    const cleanupRoot = resolve(tempRoot);
    if (dirname(cleanupRoot) !== resolve(tmpdir()) || !cleanupRoot.startsWith(join(resolve(tmpdir()), "duckurity-blog-fixtures-"))) {
      throw new Error(`Unexpected fixture cleanup path: ${cleanupRoot}`);
    }
    rmSync(cleanupRoot, { recursive: true, force: true });
  }
}
