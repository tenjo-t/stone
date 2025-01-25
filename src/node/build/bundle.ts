import type { Rollup, BuildOptions, InlineConfig } from "vite";
import type { SiteConfig } from "../siteConfig";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePath, build } from "vite";
import { sanitizeFileName, slash } from "../../client/shared";
import { task } from "../utils/task";
import { createStonePlugin } from "../plugin";
import { APP_PATH } from "../constants";

// https://github.com/vitejs/vite/blob/d2aa0969ee316000d3b957d7e879f001e85e369e/packages/vite/src/node/plugins/splitVendorChunk.ts#L14
const CSS_LANGS_RE =
  /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

const clientDir = normalizePath(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client")
);

// these deps are also being used in the client code (outside of the theme)
// exclude them from the theme chunk so there is no circular dependency
const excludedModules = [
  "/@siteData",
  "node_modules/@vueuse/core/",
  "node_modules/@vueuse/shared/",
  "node_modules/vue/",
  "node_modules/vue-demi/",
  clientDir,
];

export async function bundle(
  config: SiteConfig,
  options: BuildOptions,
  pages: string[]
) {
  const pageToHashMap = Object.create(null) as Record<string, string>;
  const input: Record<string, string> = {};

  for (const file of pages) {
    const page = file.slice(0, -path.extname(file).length);
    const name = slash(page).replaceAll("/", "_");
    input[name] = path.resolve(
      config.pageDir,
      file.replace(/page\.(jsx|ts|tsx|vue)/, "page.js")
    );
  }

  const { rollupOptions } = options;

  const resolveViteConfig = async (ssr: boolean) =>
    ({
      root: config.root,
      base: config.basePath,
      logLevel: config.vite?.logLevel ?? "warn",
      plugins: await createStonePlugin(config, ssr, pageToHashMap),
      build: {
        ...options,
        emptyOutDir: true,
        ssr,
        minify: ssr
          ? false
          : typeof options.minify === "boolean"
            ? options.minify
            : !process.env.DEBUG,
        outDir: ssr ? config.tempDir : config.distDir,
        cssCodeSplit: false,
        rollupOptions: {
          ...rollupOptions,
          input: {
            ...input,
            app: path.resolve(APP_PATH, ssr ? "ssr.js" : "index.js"),
          },
          preserveEntrySignatures: "allow-extension",
          output: {
            sanitizeFileName,
            ...rollupOptions?.output,
            assetFileNames: `assets/[name].[hash].[ext]`,
            ...(ssr
              ? {
                  entryFileNames: "[name].js",
                  chunkFileNames: "[name].[hash].js",
                }
              : {
                  entryFileNames: `assets/[name].[hash].js`,
                  chunkFileNames(chunk) {
                    // avoid ads chunk being intercepted by adblock
                    return /(?:Carbon|BuySell)Ads/.test(chunk.name)
                      ? `assets/chunks/ui-custom.[hash].js`
                      : `assets/chunks/[name].[hash].js`;
                  },
                  manualChunks(id, ctx) {
                    if (id.startsWith("\0vite")) {
                      return "framework";
                    }
                    if (id.includes("plugin-vue:export-helper")) {
                      return "framework";
                    }
                    if (
                      id.includes(`${clientDir}/app`) &&
                      id !== `${clientDir}/app/index.js`
                    ) {
                      return "framework";
                    }
                    if (
                      isEagerChunk(id, ctx.getModuleInfo) &&
                      /@vue\/(runtime|shared|reactivity)/.test(id)
                    ) {
                      return "framework";
                    }

                    if (
                      !excludedModules.some((i) => id.includes(i)) &&
                      staticImportedByEntry(id, ctx.getModuleInfo, cacheTheme)
                    ) {
                      return "theme";
                    }
                  },
                }),
          },
        },
      },
      configFile: config.vite?.configFile,
    }) satisfies InlineConfig;

  let clientResult: Rollup.RollupOutput | null;
  let serverResult: Rollup.RollupOutput;

  await task("building client + server bundles", async () => {
    clientResult = (await build(
      await resolveViteConfig(false)
    )) as Rollup.RollupOutput;
    serverResult = (await build(
      await resolveViteConfig(true)
    )) as Rollup.RollupOutput;
  });

  const sortedPageToHashMap = Object.create(null) as Record<string, string>;
  Object.keys(pageToHashMap)
    .sort()
    .forEach((key) => (sortedPageToHashMap[key] = pageToHashMap[key]));

  return { clientResult, serverResult, pageToHashMap: sortedPageToHashMap };
}

const cache = new Map<string, boolean>();
const cacheTheme = new Map<string, boolean>();

/**
 * Check if a module is statically imported by at least one entry.
 */
function isEagerChunk(id: string, getModuleInfo: Rollup.GetModuleInfo) {
  if (
    id.includes("node_modules") &&
    !CSS_LANGS_RE.test(id) &&
    staticImportedByEntry(id, getModuleInfo, cache)
  ) {
    return true;
  }
}

function staticImportedByEntry(
  id: string,
  getModuleInfo: Rollup.GetModuleInfo,
  cache: Map<string, boolean>,
  importStack: string[] = []
): boolean {
  if (cache.has(id)) {
    return !!cache.get(id);
  }
  if (importStack.includes(id)) {
    cache.set(id, false);
    // circular deps!
    return false;
  }
  const mod = getModuleInfo(id);
  if (!mod) {
    cache.set(id, false);
    return false;
  }
  if (mod.isEntry) {
    cache.set(id, true);
    return true;
  }
  const someImporterIs = mod.importers.some((importer) =>
    staticImportedByEntry(
      importer,
      getModuleInfo,
      cache,
      importStack.concat(id)
    )
  );
  cache.set(id, someImporterIs);
  return someImporterIs;
}
