import { EXTERNAL_URL_RE, inBrowser, sanitizeFileName } from "../shared.js";
import { siteDataRef } from "./data.js";

export function joinPath(base: string, path: string): string {
  return `${base}${path}`.replaceAll(/\/+/g, "/");
}

export function withBase(path: string): string {
  return EXTERNAL_URL_RE.test(path) || !path.startsWith("/")
    ? path
    : joinPath(siteDataRef.value.base, path);
}

export function pathToFile(path: string): string | null {
  let pagePath = path.replace(/\/index\.html$/, "/");
  pagePath = pagePath.replace(/\.html$/, "/");
  pagePath = decodeURIComponent(pagePath);
  if (/\/$/.test(pagePath)) {
    pagePath += "page";
  } else {
    pagePath += "/page";
  }

  if (import.meta.env.DEV) {
    pagePath += `.js?t=${Date.now()}`;
  } else if (inBrowser) {
    const base = import.meta.env.BASE_URL;
    pagePath = sanitizeFileName(
      pagePath.slice(base.length).replaceAll("/", "_")
    );

    const pageHash = __STONE_HASH_MAP__[pagePath.toLowerCase()];
    if (!pageHash) return null;
    pagePath = `${base}${__ASSETS_DIR__}/${pagePath}.${pageHash}.js`;
  } else {
    pagePath = `./${sanitizeFileName(pagePath.slice(1).replaceAll("/", "_"))}.js`;
  }

  return pagePath;
}

export function getScrollOffset(): number {
  let scrollOffset = siteDataRef.value.scrollOffset;
  let offset = 0;
  let padding = 24;

  if (typeof scrollOffset === "object" && "padding" in scrollOffset) {
    padding = scrollOffset.padding;
    scrollOffset = scrollOffset.selector;
  }

  if (typeof scrollOffset === "number") {
    offset = scrollOffset;
  } else if (typeof scrollOffset === "string") {
    offset = tryOffsetSelector(scrollOffset, padding);
  } else if (Array.isArray(scrollOffset)) {
    for (const selector of scrollOffset) {
      const res = tryOffsetSelector(selector, padding);
      if (res) {
        offset = res;
        break;
      }
    }
  }

  return offset;
}

function tryOffsetSelector(selector: string, padding: number): number {
  const el = document.querySelector(selector);
  if (!el) return 0;
  const bot = el.getBoundingClientRect().bottom;
  if (bot < 0) return 0;
  return bot + padding;
}
