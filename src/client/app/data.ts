import type { Ref } from "vue";
import type { SiteData } from "../shared";

import { shallowRef } from "vue";

export const siteDataRef: Ref<SiteData> = shallowRef({
  base: "",
  cleanUrls: false,
  scrollOffset: 0,
});
