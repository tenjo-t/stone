import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = resolve(fileURLToPath(import.meta.url), "../..");

export const DIST_CLIENT_PATH = join(PKG_ROOT, "client");
export const APP_PATH = join(DIST_CLIENT_PATH, "app");
