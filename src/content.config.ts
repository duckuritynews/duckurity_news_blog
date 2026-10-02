import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

const buildEnv = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env;
const articleBase = buildEnv?.BUILD_FIXTURES_DIR ?? "./articles";
const articles = defineCollection({
  loader: glob({ base: articleBase, pattern: "**/index.md" }),
  schema: ({ image }) => z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1), summary: z.string().trim().min(1),
    publishedAt: z.string().refine((value) => /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), "Use an ISO 8601 timestamp with an explicit timezone."),
    updatedAt: z.string().optional(), draft: z.boolean(),
    authors: z.array(z.string().trim().min(1)).min(1), tags: z.array(z.string().trim().min(1)).min(1),
    keyPoints: z.array(z.string().trim().min(1)).length(3), cover: image().optional(), coverAlt: z.string().trim().optional(),
    level: z.enum(["\uCD08\uAE09", "\uC911\uAE09", "\uACE0\uAE09"]).optional(),
    searchAliases: z.array(z.string()).default([]), cveIds: z.array(z.string().regex(/^CVE-\d{4}-\d{4,}$/i)).default([]),
  }).superRefine((article, context) => {
    if (article.cover && !article.coverAlt) context.addIssue({ code: "custom", path: ["coverAlt"], message: "A descriptive coverAlt is required when a cover is set." });
    if (new Set(article.tags.map((tag) => tag.normalize("NFC").toLocaleLowerCase("ko"))).size !== article.tags.length) {
      context.addIssue({ code: "custom", path: ["tags"], message: "Tags must be unique within an article." });
    }
  }),
});
export const collections = { articles };

