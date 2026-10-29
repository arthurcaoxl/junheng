import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  // 托管平台（kimix）无 SPA fallback：base 必须为绝对路径，
  // 配合 postbuild 生成 dist/check-in/index.html 静态副本，深链才能直接访问。
  base: '/',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
