import type { BuildOptions, Rollup } from "vite";
import type { HeadConfig } from "./render.js";
import type { Config } from "../type.js";

import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import fs from "fs-extra";
import pMap from "p-map";
import { rimraf } from "rimraf";
import { glob } from "tinyglobby";
import { slash } from "../../client/shared.js";
import { task } from "../utils/task.js";
import {
  deserializeFunctions,
  serializeFunctions,
} from "../utils/fn-serialize.js";
import { resolveConfig } from "../config.js";
import { runHookConfigDone, runHookConfigSetup } from "../integration.js";
import { bundle } from "./bundle.js";
import { renderPage } from "./render.js";

export async function build(
  root?: string,
  buildOptions: BuildOptions & { base?: string } = {}
) {
  let config = await resolveConfig(root, "build", "production");
  config = await runHookConfigSetup(config, config.logger);

  if (buildOptions.base) {
    config.base = buildOptions.base;
    buildOptions.base = undefined;
  }
  if (buildOptions.outDir) {
    config.distDir = path.resolve(process.cwd(), buildOptions.outDir);
    buildOptions.outDir = undefined;
  }

  await runHookConfigDone(config, config.logger);

  const pages = await resolvePages(config);

  try {
    const { clientResult, pageToHashMap } = await bundle(
      config,
      buildOptions,
      pages
    );

    if (process.env.BUNDLE_ONLY) {
      return;
    }

    const entryPath = path.join(config.tempDir, "app.js");
    const { render } = await import(pathToFileURL(entryPath).href);

    await task("rendering pages", async () => {
      const appChunk =
        clientResult &&
        (clientResult.output.find(
          (chunk) =>
            chunk.type === "chunk" &&
            chunk.isEntry &&
            chunk.facadeModuleId?.endsWith(".js")
        ) as Rollup.OutputChunk);
      const cssChunk = clientResult.output.find(
        (chunk) => chunk.type === "asset" && chunk.fileName.endsWith(".css")
      ) as Rollup.OutputAsset;
      const assets = clientResult.output
        .filter(
          (chunk) => chunk.type === "asset" && !chunk.fileName.endsWith(".css")
        )
        .map((asset) => config.base + asset.fileName);

      const additionalHeadTags: HeadConfig[] = [];

      const metadataScript = generateMetadataScript(pageToHashMap, config);

      await pMap(pages, async (page) => {
        await renderPage(
          render,
          config,
          page,
          clientResult,
          appChunk,
          cssChunk,
          assets,
          pageToHashMap,
          metadataScript,
          additionalHeadTags
        );
      });

      // emit page hash map for the case where a user session is open
      // when the site got redeployed (which invalidates current hashmap)
      fs.writeJSONSync(
        path.join(config.distDir, "hashmap.json"),
        pageToHashMap
      );
    });
  } finally {
    if (!process.env.DEBUG) {
      await rimraf(config.tempDir);
    }
  }

  config.logger.info("build complete");
}

async function resolvePages(config: Config) {
  return (
    await glob([`**/page{${config.pageExtensions.join(",")}}`], {
      cwd: config.pageDir,
      ignore: ["**/node_modules/**", `**/${config.distDir}/**`],
      expandDirectories: false,
    })
  ).sort();
}

function generateMetadataScript(
  pageToHashMap: Record<string, string>,
  config: Config
) {
  const hashMapString = JSON.stringify(JSON.stringify(pageToHashMap));
  const siteDataString = JSON.stringify(
    JSON.stringify(serializeFunctions({ head: [] }))
  );

  const metadataContent = `window.__STONE_HASH_MAP__=JSON.parse(${hashMapString});${
    siteDataString.includes("_stone-fn_")
      ? `${deserializeFunctions};window.__STONE_SITE_DATA__=deserializeFunctions(JSON.parse(${siteDataString}));`
      : `window.__STONE_SITE_DATA__=JSON.parse(${siteDataString});`
  }`;

  // if (!config.metaChunk) {
  //   return { html: `<script>${metadataContent}</script>`, inHead: false };
  // }

  const metadataFile = path.join(
    "assets/chunks",
    `metadata.${createHash("sha256").update(metadataContent).digest("hex").slice(0, 8)}.js`
  );

  const resolvedMetadataFile = path.join(config.distDir, metadataFile);
  const metadataFileURL = slash(`${config.base}${metadataFile}`);

  fs.ensureDirSync(path.dirname(resolvedMetadataFile));
  fs.writeFileSync(resolvedMetadataFile, metadataContent);

  return {
    html: `<script type="module" src="${metadataFileURL}"></script>`,
    inHead: true,
  };
}
