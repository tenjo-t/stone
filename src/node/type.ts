import type { Logger, UserConfig as ViteConfig } from "vite";

export interface UserConfig {
  site?: string;
  base?: string;

  root?: string;
  pageDir?: string;
  distDir?: string;

  ui?: UiIntegration;
  integrations?: Integration[];

  vite?: ViteConfig & { configFile?: string | false };
}

export interface Config {
  site: string | undefined;
  base: string;

  root: string;
  pageDir: string;
  distDir: string;
  tempDir: string;

  ui: UiIntegration;
  integrations: Integration[];

  clientEntrypoint: string;
  serverEntrypoint: string;
  pageExtensions: string[];
  vite: (ViteConfig & { configFile?: string | false }) | undefined;

  configPath?: string;
  configDeps: string[];

  logger: Logger;
}

export interface Integration {
  name: string;
  config?: {
    setup?: IntegrationConfigSetup;
    done?: IntegrationConfigDone;
  };
  server?: {
    setup?: () => void;
    done?: () => void;
  };
  build?: {
    setup?: IntegrationBuildSetup;
    done?: () => void;
  };
}
export interface UiIntegration extends Integration {}

export interface Render {
  clientEntrypoint: string;
  serverEntrypoint: string;
}

export interface IntegrationConfigSetupOptions {
  config: Config;
  updateViteConfig: (config: Partial<ViteConfig>) => UserConfig;
  addRender: (render: Render) => void;
  addPageExtensions: (exts: string | string[]) => void;
  logger: Logger;
}
export type IntegrationConfigSetup = (
  options: IntegrationConfigSetupOptions
) => void | Promise<void>;

export interface IntegrationConfigDoneOptions {
  config: Config;
  logger: Logger;
}
export type IntegrationConfigDone = (
  options: IntegrationConfigDoneOptions
) => void | Promise<void>;

export interface IntegrationBuildSetupOptions {
  config: Config;
  viteConfig: ViteConfig;
  target: "client" | "server";
  updateViteConfig: (config: Partial<ViteConfig>) => UserConfig;
  logger: Logger;
}
export type IntegrationBuildSetup = (
  options: IntegrationBuildSetupOptions
) => void | Promise<void>;
