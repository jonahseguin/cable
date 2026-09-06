import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [tanstackStart(), react()],
  server:
    mode === "node"
      ? {
          proxy: {
            "/_cable": {
              target: "http://127.0.0.1:8789",
              ws: true,
            },
          },
        }
      : undefined,
}));
