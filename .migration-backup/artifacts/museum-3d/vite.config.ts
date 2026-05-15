import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs/promises";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    {
      name: "metadata-cache-control",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && /\/metadata\.json(\?|$)/.test(req.url)) {
            res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
          }
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && /\/metadata\.json(\?|$)/.test(req.url)) {
            res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
          }
          next();
        });
      },
    },
    {
      name: "inject-sw-shell-assets",
      apply: "build",
      async writeBundle() {
        const outDir = path.resolve(import.meta.dirname, "dist");
        const manifestPath = path.join(outDir, ".vite", "manifest.json");
        const swPath = path.join(outDir, "sw.js");

        try {
          const manifestRaw = await fs.readFile(manifestPath, "utf-8");
          const manifest = JSON.parse(manifestRaw) as Record<
            string,
            { file?: string; css?: string[]; assets?: string[] }
          >;

          const assetUrls = new Set<string>();
          for (const entry of Object.values(manifest)) {
            if (entry.file) assetUrls.add(`${basePath}${entry.file}`);
            for (const css of entry.css ?? []) {
              assetUrls.add(`${basePath}${css}`);
            }
            for (const asset of entry.assets ?? []) {
              assetUrls.add(`${basePath}${asset}`);
            }
          }

          const TOKEN = "const SHELL_ASSETS = [];";
          const swContent = await fs.readFile(swPath, "utf-8");
          if (!swContent.includes(TOKEN)) {
            console.warn(
              "[inject-sw-shell-assets] Replacement token not found in sw.js — shell assets were NOT injected. Ensure sw.js contains: " +
                TOKEN,
            );
            return;
          }
          const injected = JSON.stringify([...assetUrls]);
          const updated = swContent.replace(TOKEN, `const SHELL_ASSETS = ${injected};`);
          await fs.writeFile(swPath, updated, "utf-8");
          console.log(
            `[inject-sw-shell-assets] Injected ${assetUrls.size} asset(s) into sw.js`,
          );
        } catch (e) {
          console.warn("[inject-sw-shell-assets] Failed to inject shell assets:", e);
        }
      },
    },
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    manifest: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
