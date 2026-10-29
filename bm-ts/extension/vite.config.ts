import { resolve, dirname } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
    name: 'build-content-iife',
    apply: 'build',
    async closeBundle() {
      const { build } = await import('vite');
      await build({
        configFile: false,
        // The main build already copied public/. Copying it again here would
        // overwrite post-processed files such as the production manifest.
        publicDir: false,
        build: {
          outDir,
          emptyOutDir: false, // main build already emptied dist/
          lib: {
            entry: resolve(__dirname, 'src/content/index.ts'),
            name: '_BirthdayMessagingContent',
            fileName: () => 'content.js',
            formats: ['iife'],
          },
        },
      });
    },
  };
}

/**
 * In production builds, strip development-only localhost / loopback / sslip.io entries from host_permissions in
 * the output manifest.json.  Dev builds keep them for local API testing.
 * Production builds must not request development-only backend hosts.
 */
function stripLocalhostInProduction(outDir: string, mode: string): Plugin {
  return {
    name: 'strip-localhost-manifest',
    apply: 'build',
    writeBundle() {
            if (mode === 'development') {
        const manifestPath = resolve(resolvedOutDir, 'manifest.json');
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        manifest.name = 'BirthdayMessaging FB - DEV';
        if (manifest.action) manifest.action.default_title = 'BirthdayMessaging FB - DEV';
        if (Array.isArray(manifest.host_permissions)) {
          manifest.host_permissions = manifest.host_permissions.filter(
            (p: string) => !p.includes('api-v2.birthdaymessaging.io'),
          );
          if (!manifest.host_permissions.includes('http://127.0.0.1/*')) {
            manifest.host_permissions.push('http://127.0.0.1/*');
          }
        }
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        return;
      }
      if (mode !== 'production') return;

      const manifestPath = resolve(resolvedOutDir, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

      if (Array.isArray(manifest.host_permissions)) {
        manifest.host_permissions = manifest.host_permissions.filter(
          (p: string) => !p.includes('localhost') && !p.includes('127.0.0.1') && !p.includes('sslip.io'),
        );
      }

      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    },
  };
}

export default defineConfig(async ({ mode }) => {
  const lightningModule = await import('vite-plugin-lightningcss').catch(() => undefined);
  const lightning =
    lightningModule && 'default' in lightningModule ? lightningModule.default : lightningModule;

  const outDir = mode === 'development' ? 'dist-dev' : 'dist';

  return {
    root: '.',
    base: './',
    server: {
      watch: {
        // Use polling to work around flaky filesystem events (OneDrive, network drives)
        usePolling: true,
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: mode === 'staging',
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'popup.html'),
          welcome: resolve(__dirname, 'welcome.html'),
          background: resolve(__dirname, 'src/background/index.ts'),
          // content is NOT here â€” it is built separately as an IIFE by the
          // buildContentScriptIIFE plugin to avoid ES module import statements.
          // Documentation pages (opened in new tab from the Help panel)
          faq: resolve(__dirname, 'faq.html'),
          'quick-start': resolve(__dirname, 'quick-start.html'),
          troubleshooting: resolve(__dirname, 'troubleshooting.html'),
          'privacy-policy': resolve(__dirname, 'privacy-policy.html'),
          'terms-of-service': resolve(__dirname, 'terms-of-service.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
    plugins: [
      react(),
      buildContentScriptIIFE(outDir),
      stripLocalhostInProduction(mode),
      ...(lightning
        ? [
            lightning({
              /* default options */
            }),
          ]
        : []),
    ],
  };
});
