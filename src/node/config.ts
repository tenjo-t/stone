import type { UserConfig, Config } from "./type.js";

import fs from "node:fs";
import { resolve } from "node:path";
import _debug from "debug";
import { createLogger, loadConfigFromFile, normalizePath } from "vite";
import vue from "./integrations/vue.js";

const debug = _debug("stone:config");

const supportedConfigExtensions = ["js"];

export async function resolveConfig(
  root = process.cwd(),
  command: "serve" | "build" = "serve",
  mode = "development"
): Promise<Config> {
  const rootPath = normalizePath(resolve(root));

  const [userConfig, configPath, configDeps] = await resolveUserConfig(
    rootPath,
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
    ? normalizePath(resolve(rootPath, userConfig.pageDir))
    : resolve(rootPath, "pages");
  const distDir = userConfig.distDir
    ? normalizePath(resolve(rootPath, userConfig.distDir))
    : resolve(rootPath, "build");

  const config = {
    site: userConfig.site,
    base: userConfig.base ?? "/",

    root: rootPath,
    pageDir,
    distDir,
    tempDir: normalizePath(resolve(rootPath, ".temp")),

    ui: userConfig.ui ?? vue(),
    integrations: userConfig.integrations ?? [],

    clientEntrypoint: "",
    serverEntrypoint: "",
    pageExtensions: [".js"],
    vite: userConfig.vite,

    configPath,
    configDeps,

    logger,
  };

  return config;
}

export async function resolveUserConfig(
  root: string,
  command: "serve" | "build",
  mode: string
): Promise<[UserConfig, string | undefined, string[]]> {
  const configPath = supportedConfigExtensions
    .map((ext) => `stone.config.${ext}`)
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
