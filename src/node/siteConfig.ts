import type { Options as VuePluginOptions } from "@vitejs/plugin-vue";
import type { Logger, UserConfig as ViteConfig } from "vite";

export interface UserConfig {
  basePath?: string;
  // srcDir?: string;
  pageDir?: string;
  distDir?: string;
  // publicDir?: string;

  vue?: VuePluginOptions;
  vite?: ViteConfig & { configFile?: string | false };
}

export interface SiteConfig extends Pick<UserConfig, "vue" | "vite"> {
  root: string;
  configPath?: string;
  configDeps: string[];
  pageDir: string;
  distDir: string;
  tempDir: string;

  basePath?: string;

  logger: Logger;
}
