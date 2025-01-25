import type { App } from "vue";

import {
  createApp as createClientApp,
  createSSRApp,
  h,
  defineComponent,
} from "vue";
import { inBrowser } from "../shared";
import { createRouter, RouterSymbol, useRoute } from "./router";
import { pathToFile } from "./utils";

const StoneApp = defineComponent({
  name: "StoneApp",
  setup() {
    const route = useRoute();
    return () =>
      h("div", null, [
        route.component ? h(route.component, route.data) : "404 Page Not found",
      ]);
  },
});

function newApp(): App {
  return import.meta.env.PROD
    ? createSSRApp(StoneApp)
    : createClientApp(StoneApp);
}

function newRouter() {
  let isInitialPageLoad = inBrowser;
  let initialPath: string;

  return createRouter((path) => {
    let pageFilePath = pathToFile(path);
    let pageModule = null;

    if (pageFilePath) {
      if (isInitialPageLoad) {
        initialPath = pageFilePath;
      }

      if (isInitialPageLoad || initialPath === pageFilePath) {
        pageFilePath = pageFilePath.replace(/\.js$/, "lean.js");
      }

      pageModule = import(/* @vite-ignore */ pageFilePath);
    }

    if (inBrowser) {
      isInitialPageLoad = false;
    }

    return pageModule;
  });
}

export async function createApp() {
  const router = newRouter();
  const app = newApp();

  app.provide(RouterSymbol, router);

  return { app, router };
}

if (inBrowser) {
  createApp().then(({ app, router }) => {
    router.go().then(() => app.mount("#app"));
  });
}
