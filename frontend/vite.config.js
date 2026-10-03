import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The API server also serves this app in production, so everything is
// same-origin there. In development Vite proxies HTTP to it.
const API_ORIGIN = process.env.VITE_API_ORIGIN || "http://localhost:8080";

/**
 * Split the heavy, rarely-changing libraries used on every page into their
 * own chunks, so an application change does not force everyone to download
 * React again. Libraries only one page uses (the carousel, the board) stay
 * with that page's lazily loaded chunk.
 */
function vendorChunk(id) {
  if (!id.includes("node_modules")) return undefined;
  if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return "react";
  if (/[\\/]node_modules[\\/](i18next|react-i18next)[\\/]/.test(id)) return "i18n";
  if (/[\\/]node_modules[\\/](socket\.io-client|engine\.io-client|engine\.io-parser|socket\.io-parser|axios)[\\/]/.test(id)) return "net";
  return undefined;
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    // In development the socket connects straight to the API: WebSocket
    // upgrades through Vite's proxy fail under Bun. The API allows this
    // origin through CORS_ORIGINS. Built bundles connect same-origin.
    __SOCKET_ORIGIN__: JSON.stringify(command === "serve" ? API_ORIGIN : ""),
  },
  server: {
    port: 3000,
    // Fail rather than drift to 3001: the API only accepts the origins listed
    // in CORS_ORIGINS, so the live connection would break on another port.
    strictPort: true,
    proxy: {
      "/api": { target: API_ORIGIN, changeOrigin: true },
      "/uploads": { target: API_ORIGIN, changeOrigin: true },
    },
  },
  preview: { port: 3000 },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: { manualChunks: vendorChunk },
    },
  },
}));
