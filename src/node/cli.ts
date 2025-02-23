#!/usr/bin/env node

import minimist from "minimist";
import { createLogger } from "vite";
import { version } from "../../package.json";
import { createServer, build } from "./index.js";
import { serve } from "./serve/serve.js";

function logVersion(logger = createLogger()) {
  logger.info(`\n  v${version}\n`, { clear: !logger.hasWarned });
}

const argv = minimist(process.argv.slice(2));

const command = argv._[0];
const root = argv._[command ? 1 : 0];
if (root) {
  argv.root = root;
}

if (!command || command === "dev") {
  let restartPromise: Promise<void> | undefined;

  async function createDevServer(isRestart = true) {
    const server = await createServer(root, argv, async () => {
      if (!restartPromise) {
        restartPromise = (async () => {
          await server.close();
          await createDevServer();
        })().finally(() => {
          restartPromise = undefined;
        });
      }
      return restartPromise;
    });

    await server.listen(undefined, isRestart);
    logVersion(server.config.logger);
    server.printUrls();
  }

  createDevServer(false).catch((err) => {
    createLogger().error(
      `failed to start server. error:\n${err.message}\n${err.stack}`
    );
    process.exit(1);
  });
} else {
  logVersion();

  if (command === "build") {
    await build(root, argv).catch((err) => {
      createLogger().error(`build error:\n${err.message}\n${err.stack}`);
      process.exit(1);
    });
  } else if (command === "serve" || command === "preview") {
    serve(argv).catch((err) => {
      createLogger().error(
        `failed to start server. error:\n${err.message}\n${err.stack}`
      );
    });
  } else {
    createLogger().error(`unknown command "${command}".`);
    process.exit(1);
  }
}
