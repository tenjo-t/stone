import type { Component, InjectionKey } from "vue";
import type { Awaitable, PageData } from "../shared.js";

import { inject, markRaw, nextTick, reactive, readonly } from "vue";
import { inBrowser, notFoundPageData, treatAsHtml } from "../shared.js";
import { siteDataRef } from "./data.js";
import { getScrollOffset, withBase } from "./utils.js";

interface PageModule {
  __pageData: PageData;
  default: Component;
}

export interface Route {
  path: string;
  component: Component | null;
  data: PageData;
}

export interface Router {
  route: Route;
  go: (to?: string) => Promise<void>;
  onBeforeRouteChange?: (to: string) => Awaitable<void | boolean>;
  onBeforePageLoad?: (to: string) => Awaitable<void | boolean>;
  onAfterPageLoad?: (to: string) => Awaitable<void>;
  onAfterRouteChanged?: (to: string) => Awaitable<void>;
}

export const RouterSymbol: InjectionKey<Router> = Symbol();

export function createRouter(
  loadPageModule: (path: string) => Awaitable<PageModule | null>,
  fallbackComponent?: Component
) {
  const route = reactive({
    path: "/",
    component: null,
    data: notFoundPageData,
  } as Route);

  const router: Router = {
    route,
    go,
  };

  async function go(href = inBrowser ? location.href : "/") {
    href = normalizeHref(href);
    if ((await router.onBeforeRouteChange?.(href)) === false) return;
    if (inBrowser && href !== normalizeHref(location.href)) {
      history.replaceState({ scrollPosition: window.scrollY }, "");
      history.pushState({}, "", href);
    }
    await loadPage(href);
    await router.onAfterRouteChanged?.(href);
  }

  let latestPendingPath: string | null = null;

  async function loadPage(href: string, scrollPosition = 0, isRetry = false) {
    if ((await router.onBeforePageLoad?.(href)) === false) return;
    const targetLoc = new URL(href, "http://a.com");
    const pendingPath = (latestPendingPath = targetLoc.pathname);
    try {
      const page = await loadPageModule(pendingPath);
      if (!page) {
        throw new Error(`Page not found: ${pendingPath}`);
      }
      if (latestPendingPath === pendingPath) {
        latestPendingPath = null;
        const { default: comp, __pageData = {} } = page;
        if (!comp) {
          throw new Error(`Invalid route component: ${comp}`);
        }

        await router.onAfterPageLoad?.(href);

        route.path = inBrowser ? pendingPath : withBase(pendingPath);
        route.component = markRaw(comp);
        route.data = import.meta.env.PROD
          ? markRaw(__pageData)
          : readonly(__pageData);

        if (inBrowser) {
          nextTick(() => {
            if (targetLoc.hash && !scrollPosition) {
              let target: HTMLElement | null = null;
              try {
                target = document.getElementById(
                  decodeURIComponent(targetLoc.hash).slice(1)
                );
              } catch (e) {
                console.warn(e);
              }
              if (target) {
                scrollTo(target, targetLoc.hash);
                return;
              }
            }
            window.scrollTo(0, scrollPosition);
          });
        }
      }
    } catch (err: any) {
      if (
        !/fetch|Page not found/.test(err.message) &&
        !/^\/404(\.html|\/)?$/.test(href)
      ) {
        console.error(err);
      }

      // if (!isRetry) {
      //   try {
      //     const res = await fetch(siteDataRef.value.base + "hashmap.json");
      //     __VP_HASH_MAP__ = await res.json();
      //     await loadPage(href, scrollPosition, true);
      //     return;
      //   } catch (e) {}
      // }

      if (latestPendingPath === pendingPath) {
        latestPendingPath = null;
        route.path = inBrowser ? pendingPath : withBase(pendingPath);
        route.component = fallbackComponent ? markRaw(fallbackComponent) : null;
        const relativePath = inBrowser
          ? pendingPath
              .replace(/(^|\/)$/, "$1index")
              .replace(/(\.html)?$/, ".md")
              .replace(/^\//, "")
          : "404.md";
        route.data = { ...notFoundPageData, relativePath };
      }
    }
  }

  if (inBrowser) {
    if (history.state === null) {
      history.replaceState({}, "");
    }
    window.addEventListener(
      "click",
      (e) => {
        if (
          e.defaultPrevented ||
          !(e.target instanceof Element) ||
          e.target.closest("button") ||
          e.button !== 0 ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          e.metaKey
        ) {
          return;
        }

        const link = e.target.closest<HTMLAnchorElement | SVGAElement>("a");
        if (
          !link ||
          link.closest(".stone-raw") ||
          link.hasAttribute("download") ||
          link.hasAttribute("target")
        ) {
          return;
        }

        const linkHref =
          link.getAttribute("href") ??
          (link instanceof SVGAElement
            ? link.getAttribute("xlink:href")
            : null);
        if (linkHref == null) return;

        const { href, origin, pathname, hash, search } = new URL(
          linkHref,
          link.baseURI
        );
        const currentUrl = new URL(location.href);
        if (origin === currentUrl.origin && treatAsHtml(pathname)) {
          e.preventDefault();
          if (
            pathname === currentUrl.pathname &&
            search === currentUrl.search
          ) {
            if (hash !== currentUrl.hash) {
              history.pushState({}, "", href);
              window.dispatchEvent(
                new HashChangeEvent("hashchange", {
                  oldURL: currentUrl.href,
                  newURL: href,
                })
              );
            }
            if (hash) {
              scrollTo(link, hash, link.classList.contains("header-anchor"));
            } else {
              window.scrollTo(0, 0);
            }
          } else {
            go(href);
          }
        }
      },
      { capture: true }
    );

    window.addEventListener("popstate", async (e) => {
      if (e.state === null) {
        return;
      }
      await loadPage(
        normalizeHref(location.href),
        e.state?.scrollPosition || 0
      );
      router.onAfterRouteChanged?.(location.href);
    });

    window.addEventListener("hashchange", (e) => {
      e.preventDefault();
    });
  }

  return router;
}

export function scrollTo(el: Element, hash: string, smooth = true) {
  let target: Element | null = null;

  try {
    target = el.classList.contains("header-anchor")
      ? el
      : document.getElementById(decodeURIComponent(hash).slice(1));
  } catch (e) {
    console.warn(e);
  }

  if (target) {
    const targetPending = Number.parseInt(
      window.getComputedStyle(target).paddingTop,
      10
    );
    const targetTop =
      window.scrollY +
      target.getBoundingClientRect().top -
      getScrollOffset() +
      targetPending;
    requestAnimationFrame(() => {
      if (
        !smooth ||
        Math.abs(targetTop - window.scrollY) > window.innerHeight
      ) {
        window.scrollTo(0, targetTop);
      } else {
        window.scrollTo({ left: 0, top: targetTop, behavior: "smooth" });
      }
    });
  }
}

function normalizeHref(href: string) {
  const url = new URL(href, "http://a.com");
  url.pathname = url.pathname.replace(/(^|\/)index(\.html)?$/, "$1");
  if (siteDataRef.value.cleanUrls) {
    url.pathname = url.pathname.replace(/\.html$/, "");
  } else if (!url.pathname.endsWith("/") && !url.pathname.endsWith(".html")) {
    // url.pathname += ".html";
    url.pathname += "/";
  }
  return url.pathname + url.search + url.hash;
}

export function useRouter(): Router {
  const router = inject(RouterSymbol);
  if (!router) {
    throw new Error("useRouter() is called without provider.");
  }
  return router;
}

export function useRoute(): Route {
  return useRouter().route;
}
