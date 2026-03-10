import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Builds the content script as a fully self-contained IIFE after the main
 * bundle finishes.  Content scripts are injected by Chrome as plain scripts
 * (no "type": "module"), so they must have zero `import` statements.  The
 * main multi-entry build would create shared chunks connected via `import`,
 * breaking injection.  Building the content script separately with
 * format "iife" inlines all dependencies and produces a single standalone
 * file.
 */
function buildContentScriptIIFE(outDir: string): Plugin {
  return {
    name: "build-content-iife",
    apply: "build",
    async closeBundle() {
      const { build } = await import("vite");
      await build({
        configFile: false,
        build: {
          outDir,
          emptyOutDir: false, // main build already emptied dist/
          lib: {
            entry: resolve(__dirname, "src/content/index.ts"),
            name: "_BirthdayMessagingContent",
            fileName: () => "content.js",
            formats: ["iife"],
          },
        },
      });
    },
  };
}

export default defineConfig(async () => {
  const lightningModule = await import("vite-plugin-lightningcss").catch(() => undefined);
  const lightning =
    lightningModule && "default" in lightningModule
      ? lightningModule.default
      : lightningModule;

  const outDir = "dist";

  return {
  root: ".",
  base: "./",
  server: {
    watch: {
      // Use polling to work around flaky filesystem events (OneDrive, network drives)
      usePolling: true,
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        background: resolve(__dirname, "src/background/index.ts"),
        // content is NOT here — it is built separately as an IIFE by the
        // buildContentScriptIIFE plugin to avoid ES module import statements.
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
  plugins: [
    react(),
    buildContentScriptIIFE(outDir),
    ...(lightning ? [lightning({ /* default options */ })] : []),
  ],
  };
});
