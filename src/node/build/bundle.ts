import type { Rollup, BuildOptions, InlineConfig } from "vite";
import type { Config } from "../type.js";

import path from "node:path";
import { build, mergeConfig } from "vite";
import { sanitizeFileName, slash } from "../../client/shared.js";
import { task } from "../utils/task.js";
import { createStonePlugin } from "../plugin.js";

export async function bundle(
  config: Config,
  options: BuildOptions,
  pages: string[]
) {
  const pageToHashMap: Record<string, string> = Object.create(null);
  const input: Record<string, string> = {};

  for (const file of pages) {
    const page = file.slice(0, -path.extname(file).length);
    const name = slash(page).replaceAll("/", "_");
    input[name] = `stone:${path.resolve(config.pageDir, file)}`;
  }

  const { rollupOptions } = options;

  const resolveViteConfig = async (ssr: boolean) => {
    const base: InlineConfig = {
      root: config.root,
      base: config.base,
      define: {
        __ASSETS_DIR__: JSON.stringify("assets"),
      },
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
            app: path.resolve(
              ssr ? config.serverEntrypoint : config.clientEntrypoint
            ),
          },
          preserveEntrySignatures: "allow-extension",
          output: {
            sanitizeFileName,
            ...rollupOptions?.output,
            assetFileNames: "assets/[name].[hash].[ext]",
            ...(ssr
              ? {
                  entryFileNames: "[name].js",
                  chunkFileNames: "[name].[hash].js",
                }
              : {
                  entryFileNames: "assets/[name].[hash].js",
                  chunkFileNames(chunk) {
                    // avoid ads chunk being intercepted by adblock
                    return /(?:Carbon|BuySell)Ads/.test(chunk.name)
                      ? "assets/chunks/ui-custom.[hash].js"
                      : "assets/chunks/[name].[hash].js";
                  },
                }),
          },
        },
      },
      configFile: config.vite?.configFile,
    };

    return config.vite ? mergeConfig(base, config.vite) : base;
  };

  let clientResult!: Rollup.RollupOutput;
  let serverResult!: Rollup.RollupOutput;

  await task("building client + server bundles", async () => {
    clientResult = (await build(
      await resolveViteConfig(false)
    )) as Rollup.RollupOutput;
    serverResult = (await build(
      await resolveViteConfig(true)
    )) as Rollup.RollupOutput;
  });

  const sortedPageToHashMap = Object.create(null) as Record<string, string>;
  for (const key of Object.keys(pageToHashMap).sort()) {
    sortedPageToHashMap[key] = pageToHashMap[key];
  }

  return { clientResult, serverResult, pageToHashMap: sortedPageToHashMap };
}
