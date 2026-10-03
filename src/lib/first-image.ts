import { htmlToHast, type HastNode } from "satteri";

/** Inspect rendered Markdown so comments, code examples and reference definitions are not images. */
export function firstImageFromHtml(html: string) {
  function find(node: HastNode): { src: string; alt: string; width: number | undefined; height: number | undefined } | undefined {
    if (node.type === "element" && node.tagName === "img") {
      const props = node.properties;
      if (typeof props.src === "string" && props.src) {
        const dimension = (value: unknown) => {
          const number = Number(value);
          return Number.isFinite(number) && number > 0 ? number : undefined;
        };
        return { src: props.src, alt: typeof props.alt === "string" ? props.alt : "", width: dimension(props.width), height: dimension(props.height) };
      }
    }
    if ("children" in node) {
      for (const child of node.children) {
        const image = find(child);
        if (image) return image;
      }
    }
    return undefined;
  }
  return find(htmlToHast(html, { fragment: true }));
}
