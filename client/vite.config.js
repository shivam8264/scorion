import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy = { "/api": { target: process.env.VITE_PROXY_TARGET || "http://localhost:5000", changeOrigin: true } };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev convenience: /api calls are forwarded to Express (the browser never talks to the ML service)
    proxy: apiProxy,
  },
  preview: { port: 4173, proxy: apiProxy },
  build: { chunkSizeWarningLimit: 900 },
  css: { modules: { localsConvention: "camelCaseOnly" } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
