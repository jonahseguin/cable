import { defineConfig } from "blume";

export default defineConfig({
  title: "Cable",
  description: "Contract-first procedures and durable typed channels for actor runtimes.",
  banner:
    "Preview documentation. Cable packages are private and unpublished; the examples run from this repository.",
  content: {
    root: "docs/public",
  },
  // Keep component previews out of the repository's application examples.
  examples: "docs/public/examples",
  deployment: {
    output: "static",
  },
  github: {
    owner: "jonahseguin",
    repo: "cable",
  },
  navigation: {
    sidebar: [
      { label: "Get started", items: ["/", "/getting-started", "/examples"] },
      {
        label: "Build your API",
        items: ["/contracts", "/procedures", "/authorization", "/organizing-procedures"],
      },
      { label: "Use in your app", items: ["/client", "/react", "/tanstack-query"] },
      {
        label: "Realtime channels",
        items: ["/channels", "/channel-procedures", "/reliability"],
      },
      {
        label: "Integrations",
        items: ["/adapters/cloudflare", "/adapters/node", "/integrations/effect"],
      },
    ],
  },
});
