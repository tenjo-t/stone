import type { ServerOptions } from "vite";

import { createServer as createViteServer, mergeConfig } from "vite";
import { resolveConfig } from "./config.js";
import { createStonePlugin } from "./plugin.js";
import { runHookConfigSetup, runHookConfigDone } from "./integration.js";

export async function createServer(
  root = process.cwd(),
  serverOptions: ServerOptions & { base?: string } = {},
  recreateServer?: () => Promise<void>
) {
  let config = await resolveConfig(root);
  config = await runHookConfigSetup(config, config.logger);

  if (serverOptions.base) {
    config.base = serverOptions.base;
    serverOptions.base = undefined;
  }

  await runHookConfigDone(config, config.logger);

  const viteConfig = mergeConfig(
    {
      root: config.root,
      base: config.base,
      plugins: await createStonePlugin(config, false, {}, recreateServer),
      server: serverOptions,
      customLogger: config.logger,
      configFile: config.vite?.configFile,
    },
    config.vite ?? {}
  );

  return createViteServer(viteConfig);
}
