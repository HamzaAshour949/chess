import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The API server also serves this app in production, so everything is
// same-origin there. In development Vite proxies to it, including the
// WebSocket upgrade for Socket.IO.
const API_ORIGIN = process.env.VITE_API_ORIGIN || "http://localhost:8080";

/**
 * Split the heavy, rarely-changing libraries out of the app bundle so an
 * application change does not force everyone to re-download the chess board.
 */
function vendorChunk(id) {
  if (!id.includes("node_modules")) return undefined;
  if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)/.test(id)) return "react";
  if (/[\\/]node_modules[\\/](chess\.js|react-chessboard|@dnd-kit)/.test(id)) return "chess";
  if (/[\\/]node_modules[\\/](i18next|react-i18next)/.test(id)) return "i18n";
  if (/[\\/]node_modules[\\/](framer-motion|motion|swiper)/.test(id)) return "ui";
  if (/[\\/]node_modules[\\/](socket\.io-client|engine\.io-client|axios)/.test(id)) return "net";
  return "vendor";
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      "/api": { target: API_ORIGIN, changeOrigin: true },
      "/uploads": { target: API_ORIGIN, changeOrigin: true },
      "/socket.io": { target: API_ORIGIN, ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: { manualChunks: vendorChunk },
    },
  },
});
