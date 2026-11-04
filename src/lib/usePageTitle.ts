import { useEffect } from "react";

const DEFAULT_TITLE = "The Justice Leagues — Organised neighbours. Measured impact.";
const DEFAULT_DESCRIPTION =
  "Justice Leagues — form or join local leagues, coordinate volunteer shifts, and track collective impact.";

export interface PageMeta {
  description?: string;
  image?: string;
  /** Canonical path within the app, e.g. `/leagues/harbor`. */
  path?: string;
  type?: "website" | "article";
}

function setMeta(attribute: "name" | "property", key: string, content: string | null) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!content) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * Route title and share cards. Public league/chapter pages pass a description
 * and image so a pasted link reads like a clipping from the paper.
 */
export function usePageTitle(title: string, meta: PageMeta = {}) {
  const { description, image, path, type = "website" } = meta;

  useEffect(() => {
    document.title = title;

    const resolvedDescription = description ?? DEFAULT_DESCRIPTION;
    // The Pages edition lives under a subpath and uses hash routes, so its
    // share URL is simply the current address. The local app can name a
    // clean canonical path.
    const url =
      import.meta.env.MODE === "pages"
        ? window.location.href
        : path
          ? new URL(path, window.location.origin).toString()
          : window.location.href;

    setMeta("name", "description", resolvedDescription);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", resolvedDescription);
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", url);
    setMeta("name", "twitter:card", image ? "summary_large_image" : "summary");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", resolvedDescription);
    setMeta("name", "twitter:image", image ?? null);
    setMeta("property", "og:image", image ?? null);
    setCanonical(url);

    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title, description, image, path, type]);
}
