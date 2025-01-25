import type { SSRContext } from "vue/server-renderer";

export type Awaitable<T> = T | PromiseLike<T>;

export interface PageData {}

export interface SiteData {
  base: string;
  cleanUrls: boolean;
  scrollOffset:
    | number
    | string
    | string[]
    | { selector: string | string[]; padding: number };
}

export interface SSGContext extends SSRContext {
  content: string;
}

const KNOWN_EXTENSIONS = new Set();

export const EXTERNAL_URL_RE = /^(?:[a-z]+:|\/\/)/i;

export const inBrowser = typeof document !== "undefined";

export const notFoundPageData: PageData = {};

export function treatAsHtml(filename: string): boolean {
  if (KNOWN_EXTENSIONS.size === 0) {
    const extraExts =
      (typeof process === "object" && process.env?.VITE_EXTRA_EXTENSIONS) ||
      import.meta.env?.VITE_EXTRA_EXTENSIONS ||
      "";

    // md, html? are intentionally omitted
    (
      "3g2,3gp,aac,ai,apng,au,avif,bin,bmp,cer,class,conf,crl,css,csv,dll," +
      "doc,eps,epub,exe,gif,gz,ics,ief,jar,jpe,jpeg,jpg,js,json,jsonld,m4a," +
      "man,mid,midi,mjs,mov,mp2,mp3,mp4,mpe,mpeg,mpg,mpp,oga,ogg,ogv,ogx," +
      "opus,otf,p10,p7c,p7m,p7s,pdf,png,ps,qt,roff,rtf,rtx,ser,svg,t,tif," +
      "tiff,tr,ts,tsv,ttf,txt,vtt,wav,weba,webm,webp,woff,woff2,xhtml,xml," +
      "yaml,yml,zip" +
      (extraExts && typeof extraExts === "string" ? "," + extraExts : "")
    )
      .split(",")
      .forEach((ext) => KNOWN_EXTENSIONS.add(ext));
  }

  const ext = filename.split(".").pop();

  return ext == null || !KNOWN_EXTENSIONS.has(ext.toLowerCase());
}

const DRIVE_LETTER_REGEX = /^[a-z]:/i;
const INVALID_CHAR_REGEX = /[\u0000-\u001F"#$&*+,:;<=>?[\]^`{|}\u007F]/g;

export function sanitizeFileName(name: string): string {
  const match = DRIVE_LETTER_REGEX.exec(name);
  const driveLetter = match ? match[0] : "";

  return (
    driveLetter +
    name
      .slice(driveLetter.length)
      .replace(INVALID_CHAR_REGEX, "_")
      .replace(/(^|\/)_+(?=[^/]*$)/, "$1")
  );
}

export function slash(p: string): string {
  return p.replaceAll("\\", "/");
}

export function escapeHtml(str: string): string {
  return str
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll(/&(?![\w#]+;)/g, "&amp;");
}
