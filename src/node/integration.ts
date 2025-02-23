import type { Logger, UserConfig as ViteConfig } from "vite";
import type {
  Config,
  IntegrationBuildSetupOptions,
  IntegrationConfigSetupOptions,
} from "./type.ts";

import { mergeConfig } from "vite";

export async function runHookConfigSetup(config: Config, logger: Logger) {
  config.integrations.unshift(config.ui);

  let updatedConfig = { ...config.vite };

  for (let i = 0; i < config.integrations.length; i++) {
    const integration = config.integrations[i];

    if (integration.config?.setup) {
      const options: IntegrationConfigSetupOptions = {
        config,
        updateViteConfig: (newConfig) => {
          updatedConfig = mergeConfig(config, newConfig) as ViteConfig;
          return { ...updatedConfig };
        },
        addRender: (render) => {
          config.clientEntrypoint = render.clientEntrypoint;
          config.serverEntrypoint = render.serverEntrypoint;
        },
        addPageExtensions: (exts) => {
          config.pageExtensions.push(
            ...(Array.isArray(exts) ? exts : [exts]).map(
              (ext) => `.${ext.replace(/^\./, "")}`
            )
          );
        },
        logger,
      };
      await integration.config.setup(options);
    }
  }

  config.vite = updatedConfig;

  return config;
}

export async function runHookConfigDone(config: Config, logger: Logger) {
  for (const integration of config.integrations) {
    if (integration.config?.done) {
      await integration.config.done({
        config,
        logger,
      });
    }
  }
}

export async function runHookBuildSetup(
  config: Config,
  viteConfig: ViteConfig,
  target: "client" | "server"
) {
  let updatedConfig: ViteConfig = {};

  for (const integration of config.integrations) {
    if (integration.build?.setup) {
      const options: IntegrationBuildSetupOptions = {
        config,
        viteConfig,
        target,
        updateViteConfig: (newConfig) => {
          updatedConfig = mergeConfig(updatedConfig, newConfig);
          return { ...updatedConfig };
        },
        logger: config.logger,
      };
      await integration.build.setup(options);
    }
  }

  return updatedConfig;
}
