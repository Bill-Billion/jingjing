import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

/** 开发时后端地址。可用环境变量覆盖，不必改这个文件。 */
const BACKEND_ORIGIN = process.env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    /**
     * 开发代理。
     * 为什么用代理而不是让前端直连后端：后端对跨域来源是白名单制
     * （API_ALLOWED_ORIGINS），没列进去就 403。走代理就是同源请求，
     * 不需要后端为本地开发改配置。STAGE_2_ACCOUNT_API.md 也把"同源代理"
     * 列为推荐做法之一。
     *
     * 代理同时转发 /api（业务接口）和 /health、/ready（探针）。
     */
    proxy: {
      '/api': { target: BACKEND_ORIGIN, changeOrigin: false },
      '/health': { target: BACKEND_ORIGIN, changeOrigin: false },
      '/ready': { target: BACKEND_ORIGIN, changeOrigin: false },
    },
  },
})
