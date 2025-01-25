import type { IOptions } from "polka";

import path from "node:path";
import fs from "fs-extra";
import polka from "polka";
import sirv from "sirv";
import compression from "@polka/compression";
import { resolveConfig } from "../config";

export interface ServeOptions {
  base?: string;
  root?: string;
  port?: number;
}

function trimChar(str: string, char: string): string {
  while (str.charAt(0) === char) {
    str = str.substring(1);
  }

  while (str.charAt(str.length - 1) === char) {
    str = str.substring(0, str.length - 1);
  }

  return str;
}

export async function serve(options: ServeOptions) {
  const port = options.port ?? 4173;
  const config = await resolveConfig(options.root, "serve", "production");
  const base = trimChar(options.base ?? config.basePath ?? "", "/");

  const notAnAsset = (pathname: string) => !pathname.includes("/assets/");
  // const notFound = fs.readFileSync(path.resolve(config.distDir, "404.html"));
  const notFound = "Not found.";
  const onNoMatch: IOptions["onNoMatch"] = (req, res) => {
    res.statusCode = 404;
    if (notAnAsset(req.path)) {
      res.write(notFound.toString());
    }
    res.end();
  };

  const compress = compression({ brotli: true });
  const serve = sirv(config.distDir, {
    etag: true,
    maxAge: 31536000,
    immutable: true,
    setHeaders(res, pathname) {
      if (notAnAsset(pathname)) {
        res.setHeader("cache-control", "no-cache");
      }
    },
  });

  if (base) {
    return polka({ onNoMatch })
      .use(base, compress, serve)
      .listen(port, () => {
        config.logger.info(
          `Built site served at http://localhost:${port}/${base}`
        );
      });
  } else {
    return polka({ onNoMatch })
      .use(compress, serve)
      .listen(port, () => {
        config.logger.info(`Built site served at http://localhost:${port}/`);
      });
  }
}
