import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const pluginRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(pluginRoot, "widget"),
  plugins: [viteSingleFile()],
  base: "./",
  build: {
    outDir: path.join(pluginRoot, "dist", "widget"),
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    target: "es2022",
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
