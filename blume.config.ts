import { defineConfig } from "blume";

export default defineConfig({
  title: "cable",
  description: "Contract-first procedures and durable typed channels for actor runtimes.",
  content: {
    root: "docs/public",
  },
  theme: {
    fonts: {
      body: { name: "Satoshi", provider: "fontshare" },
      display: { name: "Satoshi", provider: "fontshare" },
      mono: "geist-mono",
    },
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
      {
        label: "Get started",
        items: [
          "/",
          "/installation",
          "/getting-started",
          "/architecture",
          "/agent-setup",
          "/examples",
          "/acknowledgements",
        ],
      },
      {
        label: "Build your API",
        items: ["/contracts", "/procedures", "/authorization", "/grants", "/organizing-procedures"],
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
