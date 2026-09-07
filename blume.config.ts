import { defineConfig } from "blume";

export default defineConfig({
  title: "Cable",
  description: "Contract-first procedures and durable typed channels for actor runtimes.",
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
});
