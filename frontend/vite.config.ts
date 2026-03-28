import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const apiProxyTarget = process.env.VITE_DEV_API_PROXY || "http://127.0.0.1:5001";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    // Listen on all interfaces so both http://localhost: and http://127.0.0.1: work reliably.
    host: true,
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
