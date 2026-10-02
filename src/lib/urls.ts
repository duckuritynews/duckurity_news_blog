const base = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export function siteUrl(path = ""): string {
  return `${base}${path.replace(/^\/+/, "")}`;
}

export function articleUrl(slug: string): string {
  return siteUrl(`articles/${encodeURIComponent(slug)}/`);
}
