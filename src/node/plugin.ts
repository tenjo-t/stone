import type { Plugin, Rollup, UserConfig } from "vite";
import type { SiteConfig } from "./siteConfig";

import fs from "node:fs";
import path from "node:path";
import { mergeConfig } from "vite";
import { resolveUserConfig } from "./config";
import { APP_PATH } from "./constants";

const hashRE = /\.([-\w]+)\.js$/;

function isPageChunk(
  chunk: Rollup.OutputAsset | Rollup.OutputChunk
): chunk is Rollup.OutputChunk & { facadeModuleId: string } {
  return !!(
    chunk.type === "chunk" &&
    chunk.isEntry &&
    chunk.facadeModuleId &&
    chunk.facadeModuleId.match(/\/page\.(js|jsx|ts|tsx|vue)$/)
  );
}

function cleanUrl(url: string): string {
  return url.replace(/#.*$/s, "").replace(/\?.*$/s, "");
}

export async function createStonePlugin(
  siteConfig: SiteConfig,
  ssr = false,
  pageToHashMap?: Record<string, string>,
  clientJSMap?,
  recreateServer?: () => Promise<void>
): Promise<Plugin[]> {
  const {
    configPath,
    configDeps,
    pageDir,
    logger,
    vue: vuePluginOptions,
    vite: viteConfig,
  } = siteConfig;

  const userCustomElementChecker =
    vuePluginOptions?.template?.compilerOptions?.isCustomElement;
  let isCustomElement = userCustomElementChecker;

  let config;

  const stonePlugin: Plugin = {
    name: "@tenjo-t/stone",

    async configResolved(resolved) {
      config = resolved;
    },

    config() {
      const base: UserConfig = {};
      return viteConfig ? mergeConfig(base, viteConfig) : base;
    },

    resolveId(id) {
      if (id.endsWith("page.js")) {
        return id;
      }
    },

    load(id) {
      if (id.endsWith("page.js")) {
        const entry = path.isAbsolute(id)
          ? id.replace(/\.js$/, ".vue")
          : path.resolve(pageDir, "." + id.replace(/\.js$/, ".vue"));
        if (!fs.existsSync(entry)) return;

        const layouts = [];
        let dir = path.dirname(entry);
        while (dir.startsWith(pageDir)) {
          const layout = path.resolve(dir, "./layout.vue");
          if (fs.existsSync(layout)) {
            layouts.push(layout);
          }
          dir = path.resolve(dir, "..");
        }

        return `import { defineComponent, h } from "vue";
import App from "/@fs/${entry.replaceAll("\\", "/")}"
${layouts.map((layout, i) => `import Layout${i} from "/@fs/${layout.replaceAll("\\", "/")}"`).join(";")}

export default defineComponent({
  name: "AppRoute",
  setup() {
    return () => ${layouts.toReversed().reduce((pre, _, i) => `h(Layout${i},null,${pre})`, "h(App)")};
  },
});`;
      }
    },

    configureServer(server) {
      if (configPath) {
        server.watcher.add(configPath);
        for (const file of configDeps) {
          server.watcher.add(file);
        }
      }

      return () => {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url && cleanUrl(req.url);
          if (url?.endsWith(".html")) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html");
            let html = `<!DOCTYPE html>
<html>
  <head>
    <title></title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="description" content="">
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/@fs/${APP_PATH}/index.js"></script>
  </body>
</html>`;
            html = await server.transformIndexHtml(url, html, req.originalUrl);
            res.end(html);
            return;
          }
          next();
        });
      };
    },

    generateBundle(_, bundle) {
      if (ssr) {
        this.emitFile({
          type: "asset",
          fileName: "package.json",
          source: '{ "private": true, "type": "module" }',
        });
      } else {
        for (const name in bundle) {
          const chunk = bundle[name];
          if (isPageChunk(chunk)) {
            const hash = chunk.fileName.match(hashRE)![1];
            pageToHashMap![chunk.name!.toLowerCase()] = hash;
          }
        }
      }
    },

    async handleHotUpdate({ file }) {
      if (file === configPath || configDeps.includes(file)) {
        logger.info(
          `${path.relative(process.cwd(), file)} changed, restarting server...\n`,
          { clear: true, timestamp: true }
        );

        try {
          await resolveUserConfig(siteConfig.root, "serve", "development");
        } catch (err: any) {
          logger.error(err);
          return;
        }

        await recreateServer?.();
        return;
      }
    },
  };

  const vuePlugin = await import("@vitejs/plugin-vue").then((r) =>
    r.default({
      include: [/\.vue$/],
      ...vuePluginOptions,
      template: {
        ...vuePluginOptions?.template,
        compilerOptions: {
          ...vuePluginOptions?.template?.compilerOptions,
          isCustomElement,
        },
      },
    })
  );

  return [stonePlugin, vuePlugin];
}
