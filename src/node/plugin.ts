import type { Plugin, Rollup } from "vite";
import type { Config } from "type.js";

import path from "node:path";
import { normalizePath } from "vite";
import { resolveUserConfig } from "./config.js";
import { runHookBuildSetup } from "./integration.js";

const hashRE = /\.([-\w]+)\.js$/;

function cleanUrl(url: string): string {
  return url.replace(/#.*$/s, "").replace(/\?.*$/s, "");
}

function isPageChunk(
  chunk: Rollup.OutputAsset | Rollup.OutputChunk,
  pageRE: RegExp
): chunk is Rollup.OutputChunk & { facadeModuleId: string } {
  return !!(
    chunk.type === "chunk" &&
    chunk.isEntry &&
    chunk.facadeModuleId &&
    chunk.facadeModuleId.match(pageRE)
  );
}

export async function createStonePlugin(
  config: Config,
  ssr = false,
  pageToHashMap?: Record<string, string>,
  recreateServer?: () => Promise<void>
): Promise<Plugin[]> {
  const { pageExtensions, configPath, configDeps, logger } = config;
  const pageRE = new RegExp(`\/page(${pageExtensions.join("|")})$`);

  const stonePlugin: Plugin = {
    name: "@tenjo-t/stone",

    config(viteConfig, env) {
      if (env.command === "build") {
        return runHookBuildSetup(
          config,
          viteConfig,
          env.isSsrBuild ? "server" : "client"
        );
      }
    },

    resolveId(id) {
      if (normalizePath(id).endsWith("/page.js")) {
        return id;
      }
    },

    load(id) {},

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
    <script type="module" src="/@fs/${config.clientEntrypoint}"></script>
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
          if (isPageChunk(chunk, pageRE)) {
            // biome-ignore lint/style/noNonNullAssertion:
            const hash = chunk.fileName.match(hashRE)![1];
            // biome-ignore lint/style/noNonNullAssertion:
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
          await resolveUserConfig(config.root, "serve", "development");
        } catch (err: any) {
          logger.error(err);
          return;
        }

        await recreateServer?.();
        return;
      }
    },
  };

  return [stonePlugin];
}
