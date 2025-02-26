import type { Plugin, UserConfig, Rollup } from "vite";
import type { Options } from "@vitejs/plugin-vue";
import type { Config, UiIntegration } from "../type.js";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePath } from "vite";
import { APP_PATH } from "../constants.js";

const clientEntrypoint = `${APP_PATH}/index.js`;
const serverEntrypoint = `${APP_PATH}/ssr.js`;

// https://github.com/vitejs/vite/blob/d2aa0969ee316000d3b957d7e879f001e85e369e/packages/vite/src/node/plugins/splitVendorChunk.ts#L14
const CSS_LANGS_RE =
  /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

const clientDir = normalizePath(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client")
);

async function getViteConfig(
  config: Config,
  vuePluginOptions?: Options
): Promise<UserConfig> {
  const userCustomElementChecker =
    vuePluginOptions?.template?.compilerOptions?.isCustomElement;
  const isCustomElement = userCustomElementChecker;

  const pageDir = config.pageDir;
  let dev = false;

  const plugin: Plugin = {
    name: "@tenjo-t/vite-plugin-stone-vue",

    configResolved(config) {
      dev = config.env.DEV;
    },

    resolveId(id) {
      if (id.startsWith("stone:") && id.endsWith(".vue")) {
        return `\0${id}`;
      }
    },

    load(id) {
      let entry: string;
      id = normalizePath(id);
      if (id.startsWith("\0stone:") && id.endsWith("/page.vue")) {
        entry = id.slice(7);
      } else if (id.endsWith("/page.js")) {
        entry = dev
          ? path.resolve(pageDir, `.${id.replace(/\.js$/, ".vue")}`)
          : id.replace(/\.js$/, ".vue");
        if (!fs.existsSync(entry)) return;
      } else {
        return;
      }

      const layouts = [];
      let dir = path.dirname(entry);
      while (dir.startsWith(pageDir)) {
        const layout = path.resolve(dir, "./layout.vue");
        if (fs.existsSync(layout)) {
          layouts.push(layout);
        }
        dir = path.resolve(dir, "..");
      }

      return `import { defineComponent, h } from "vue";
import App from "/@fs/${entry.replaceAll("\\", "/")}"
${layouts.map((layout, i) => `import Layout${i} from "/@fs/${layout.replaceAll("\\", "/")}"`).join(";")}

export default defineComponent({
  name: "AppRoute",
  setup() {
    return () => ${layouts.toReversed().reduce((pre, _, i) => `h(Layout${i},null,()=>${pre})`, "h(App)")};
  },
});`;
    },
  };

  const vuePlugin = await import("@vitejs/plugin-vue").then((r) =>
    r.default({
      include: [/\.vue$/],
      ...vuePluginOptions,
      template: {
        ...vuePluginOptions?.template,
        compilerOptions: {
          ...vuePluginOptions?.template?.compilerOptions,
          isCustomElement,
        },
      },
    })
  );

  return {
    plugins: [plugin, vuePlugin],
  };
}

const cache = new Map<string, boolean>();

/**
 * Check if a module is statically imported by at least one entry.
 */
function isEagerChunk(id: string, getModuleInfo: Rollup.GetModuleInfo) {
  if (
    id.includes("node_modules") &&
    !CSS_LANGS_RE.test(id) &&
    staticImportedByEntry(id, getModuleInfo, cache)
  ) {
    return true;
  }
}

function staticImportedByEntry(
  id: string,
  getModuleInfo: Rollup.GetModuleInfo,
  cache: Map<string, boolean>,
  importStack: string[] = []
): boolean {
  if (cache.has(id)) {
    return !!cache.get(id);
  }
  if (importStack.includes(id)) {
    cache.set(id, false);
    // circular deps!
    return false;
  }
  const mod = getModuleInfo(id);
  if (!mod) {
    cache.set(id, false);
    return false;
  }
  if (mod.isEntry) {
    cache.set(id, true);
    return true;
  }
  const someImporterIs = mod.importers.some((importer) =>
    staticImportedByEntry(
      importer,
      getModuleInfo,
      cache,
      importStack.concat(id)
    )
  );
  cache.set(id, someImporterIs);
  return someImporterIs;
}

export default function createVueUiIntegration(
  vuePluginOptions?: Options
): UiIntegration {
  return {
    name: "@tenjo-t/stone-vue",
    config: {
      async setup({ config, updateViteConfig, addRender, addPageExtensions }) {
        updateViteConfig(await getViteConfig(config, vuePluginOptions));
        addRender({ clientEntrypoint, serverEntrypoint });
        addPageExtensions(".vue");
      },
    },
    build: {
      setup({ config, target, updateViteConfig }) {
        if (target === "client") {
          updateViteConfig({
            build: {
              rollupOptions: {
                output: {
                  manualChunks(id, ctx) {
                    if (id.startsWith("\0vite")) {
                      return "framework";
                    }
                    if (id.includes("plugin-vue:export-helper")) {
                      return "framework";
                    }
                    if (
                      id.includes(`${clientDir}/app`) &&
                      id !== `${clientDir}/app/index.js`
                    ) {
                      return "framework";
                    }
                    if (
                      isEagerChunk(id, ctx.getModuleInfo) &&
                      /@vue\/(runtime|shared|reactivity)/.test(id)
                    ) {
                      return "framework";
                    }
                  },
                },
              },
            },
          });
        }
      },
    },
  };
}
