import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    host: "0.0.0.0",
    port: 5173,

    proxy: {
      "/api/auth": {
        target: "http://127.0.0.1:8081",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth/, ""),
      },

      "/api/catalog": {
        target: "http://127.0.0.1:8082",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/catalog/, ""),
      },

      "/api/inventory": {
        target: "http://127.0.0.1:8083",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/inventory/, ""),
      },

      "/api/orders": {
        target: "http://127.0.0.1:8084",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/orders/, ""),
      },

      "/api/payments": {
        target: "http://127.0.0.1:8085",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/payments/, ""),
      },

      "/api/notifications": {
        target: "http://127.0.0.1:8086",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/notifications/, ""),
      },

      "/api/analytics": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/analytics/, ""),
      },
    },
  },
});
