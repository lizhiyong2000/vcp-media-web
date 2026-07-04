import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8090",
        changeOrigin: true,
      },
      "/hls": {
        target: "http://127.0.0.1:8081",
        changeOrigin: true,
      },
      // 注意：/flv 不要走 proxy（chunked 长连接会被缓冲）。FLV 直连 8081。
    },
  },
});
