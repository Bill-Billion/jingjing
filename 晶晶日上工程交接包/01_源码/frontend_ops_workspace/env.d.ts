/// <reference types="vite/client" />

/** 自定义环境变量。加了类型，页面里读错变量名会直接编译报错。 */
interface ImportMetaEnv {
  /**
   * 后端来源。
   * 留空 = 同源（开发时由 Vite 代理 /api 到后端，避免让后端配 CORS）。
   * 部署时填真实域名，例如 https://api.example.com
   */
  readonly VITE_API_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
