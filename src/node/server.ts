import type { ServerOptions } from "vite";

import { createServer as createViteServer } from "vite";
import { resolveConfig } from "./config";
import { createStonePlugin } from "./plugin";

export async function createServer(
  root = process.cwd(),
  serverOptions: ServerOptions & { base?: string } = {},
  recreateServer?: () => Promise<void>
) {
  const config = await resolveConfig(root);

  if (serverOptions.base) {
    config.basePath = serverOptions.base;
    serverOptions.base = undefined;
  }
  return createViteServer({
    root: config.root,
    base: config.basePath,
    plugins: await createStonePlugin(config, false, {}, {}, recreateServer),
    server: serverOptions,
    customLogger: config.logger,
    configFile: config.vite?.configFile,
  });
}
