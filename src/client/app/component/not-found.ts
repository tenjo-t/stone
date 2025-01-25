import { defineComponent, h } from "vue";

export const NotFound = defineComponent({
  name: "NotFound",
  setup() {
    return () => h("h1", null, "Page not found.");
  },
});
