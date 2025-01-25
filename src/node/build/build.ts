import type { BuildOptions, Rollup } from "vite";
import type { SiteConfig } from "../siteConfig";
import type { HeadConfig } from "./render";

import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import fs from "fs-extra";
import pMap from "p-map";
import { rimraf } from "rimraf";
import { glob } from "tinyglobby";
import { slash } from "../../client/shared";
import { task } from "../utils/task";
import {
  deserializeFunctions,
  serializeFunctions,
} from "../utils/fn-serialize";
import { resolveConfig } from "../config";
import { bundle } from "./bundle";
import { renderPage } from "./render";

export async function build(
  root?: string,
  buildOptions: BuildOptions & { base?: string } = {}
) {
  const config = await resolveConfig(root, "build", "production");

  if (buildOptions.base) {
    config.basePath = buildOptions.base;
    delete buildOptions.base;
  }
  if (buildOptions.outDir) {
    config.distDir = path.resolve(process.cwd(), buildOptions.outDir);
    delete buildOptions.outDir;
  }

  const pages = await resolvePages(config.pageDir);

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
      const cssChunk = clientResult!.output.find(
        (chunk) => chunk.type === "asset" && chunk.fileName.endsWith(".css")
      ) as Rollup.OutputAsset;
      const assets = clientResult!.output
        .filter(
          (chunk) => chunk.type === "asset" && !chunk.fileName.endsWith(".css")
        )
        .map((asset) => config.basePath + asset.fileName);

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

  config.logger.info(`build complete`);
}

async function resolvePages(pagesDir: string): Promise<string[]> {
  const allPages = (
    await glob(["**/page.{js,jsx,ts,tsx,vue}"], {
      cwd: pagesDir,
      ignore: ["**/node_modules/**", "**/dist/**"],
      expandDirectories: false,
    })
  ).sort();

  return allPages;
}

function generateMetadataScript(
  pageToHashMap: Record<string, string>,
  config: SiteConfig
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

  if (!config.metaChunk) {
    return { html: `<script>${metadataContent}</script>`, inHead: false };
  }

  const metadataFile = path.join(
    "assets/chunks",
    `metadata.${createHash("sha256").update(metadataContent).digest("hex").slice(0, 8)}.js`
  );

  const resolvedMetadataFile = path.join(config.distDir, metadataFile);
  const metadataFileURL = slash(`${config.basePath}${metadataFile}`);

  fs.ensureDirSync(path.dirname(resolvedMetadataFile));
  fs.writeFileSync(resolvedMetadataFile, metadataContent);

  return {
    html: `<script type="module" src="${metadataFileURL}"></script>`,
    inHead: true,
  };
}
