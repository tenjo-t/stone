import type { RollupOptions } from "rollup";

import { builtinModules, createRequire } from "node:module";
import { defineConfig } from "rollup";
import json from "@rollup/plugin-json";
import esbuild from "rollup-plugin-esbuild";

const require = createRequire(import.meta.url);
const pkg = require("./package.json");

const DEV = !!process.env.DEV;
const PROD = !DEV;

const external = [
  ...Object.keys(pkg.dependencies),
  // ...Object.keys(pkg.peerDependencies),
  ...builtinModules.flatMap((m) =>
    m.includes("punycode") ? [] : [m, `node:${m}`]
  ),
];

const plugins = [esbuild({ target: "esnext" }), json()];

const esmBuild: RollupOptions = {
  input: ["src/node/index.ts", "src/node/cli.ts"],
  output: {
    format: "esm",
    entryFileNames: "[name].js",
    chunkFileNames: "chunk-[hash].js",
    dir: "dist/node",
    sourcemap: DEV,
  },
  external,
  plugins,
  onwarn(warning, warn) {
    if (warning.code !== "EVAL") warn(warning);
  },
};

export default defineConfig([esmBuild]);
