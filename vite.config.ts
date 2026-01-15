import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const MANUS_PROXY_TARGET = "https://api.manus.ai";

export default defineConfig(() => ({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/manus": {
        target: MANUS_PROXY_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/manus/, ""),
      },
    },
  },
}));
