import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const lightningModule = await import("vite-plugin-lightningcss").catch(() => undefined);
  const lightning =
    lightningModule && "default" in lightningModule
      ? lightningModule.default
      : lightningModule;

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
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
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
    ...(lightning ? [lightning({ /* default options */ })] : []),
  ],
  };
});
