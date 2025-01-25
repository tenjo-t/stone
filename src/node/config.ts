import type { UserConfig, SiteConfig } from "./siteConfig";

import { resolve } from "node:path";
import fs from "node:fs";
import _debug from "debug";
import { createLogger, loadConfigFromFile, normalizePath } from "vite";

const debug = _debug("stone:config");

const supportedConfigExtensions = ["js"];

export async function resolveConfig(
  root = process.cwd(),
  command: "serve" | "build" = "serve",
  mode = "development"
): Promise<SiteConfig> {
  root = normalizePath(resolve(root));

  const [userConfig, configPath, configDeps] = await resolveUserConfig(
    root,
    command,
    mode
  );

  const logger =
    userConfig.vite?.customLogger ??
    createLogger(userConfig.vite?.logLevel, {
      prefix: "[stone]",
      allowClearScreen: userConfig.vite?.clearScreen,
    });
  // const site = await resolveSiteData(root, userConfig);
  const pageDir = userConfig.pageDir
    ? normalizePath(resolve(root, userConfig.pageDir))
    : resolve(root, "pages");
  const distDir = userConfig.distDir
    ? normalizePath(resolve(root, userConfig.distDir))
    : resolve(root, "build");

  const config = {
    root,
    configPath,
    configDeps,
    pageDir,
    distDir,
    tempDir: normalizePath(resolve(root, ".temp")),

    basePath: userConfig.basePath ?? "/",

    logger,

    vite: userConfig.vite,
  };

  return config;
}

export async function resolveUserConfig(
  root: string,
  command: "serve" | "build",
  mode: string
): Promise<[UserConfig, string | undefined, string[]]> {
  const configPath = supportedConfigExtensions
    .map((ext) => `config.${ext}`)
    .find(fs.existsSync);

  if (!configPath) {
    debug("no config file found.");
    return [{}, undefined, []];
  }

  const configExports = await loadConfigFromFile(
    { command, mode },
    configPath,
    root
  );

  let config = {};
  let configDeps: string[] = [];
  if (configExports) {
    config = configExports.config;
    configDeps = configExports.dependencies.map((file) =>
      normalizePath(resolve(file))
    );
  }

  debug(`loaded config at ${configPath}`);

  return [config, configPath, configDeps];
}
