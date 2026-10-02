# Article content

Create each article as `src/content/articles/<unique-slug>/index.md`. Keep image files in that article's `images/` folder and reference them with relative Markdown paths. The glob loader only reads `**/index.md`, so this guide is not treated as an article.

Start new stories as drafts and replace every placeholder before publishing:

```yaml
---
slug: unique-lowercase-slug
title: "Replace with the headline"
summary: "One or two sentences explaining the main finding."
publishedAt: "2026-10-01T09:00:00+09:00"
draft: true
authors: ["Author name"]
tags: ["Security", "Research"]
keyPoints:
  - "The most important result."
  - "Who or what is affected."
  - "What readers should do next."
searchAliases: []
cveIds: []
---

## Analysis

Write the article body in Markdown. Verify every claim and source before publishing.
```
