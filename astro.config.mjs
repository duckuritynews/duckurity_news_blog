import { defineConfig } from "astro/config";

const site = process.env.SITE_URL ?? "https://duckuritynews.github.io";
const configuredBase = process.env.SITE_BASE ?? "/duckurity_news_blog";
const base = configuredBase === "/"
  ? "/"
  : `/${configuredBase.replace(/^\/+|\/+$/g, "")}/`;

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
  ...(process.env.ASTRO_CACHE_DIR ? { cacheDir: process.env.ASTRO_CACHE_DIR } : {}),
  markdown: { shikiConfig: { theme: "github-dark" } },
});
