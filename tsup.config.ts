import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/node/index.ts", "src/node/cli.ts"],
  outDir: "dist/node",
  dts: "src/node/index.ts",
  format: "esm",
  target: "esnext",
});
