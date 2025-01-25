import type { SSGContext } from "../shared";

import { renderToString } from "vue/server-renderer";
import { createApp } from "./index";

export async function render(path: string): Promise<SSGContext> {
  const { app, router } = await createApp();
  await router.go(path);
  const ctx = { content: "" };
  ctx.content = await renderToString(app, ctx);
  return ctx;
}
