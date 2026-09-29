<script setup lang="ts">
/**
 * 开发自检页。只在开发构建里存在（见 router/index.ts 的 import.meta.env.DEV 判断）。
 *
 * 这里放的是"做联调时需要、但用户不需要看见"的东西：探针、接口前缀、
 * 未实现的接口清单。从登录页搬过来的。
 */
import BackendStatus from '@/components/BackendStatus.vue'
</script>

<template>
  <div class="page">
    <h1 class="title">开发自检</h1>

    <BackendStatus />

    <section class="note">
      <h2 class="h2">探针说明</h2>
      <p>
        <code>/health</code> 只说明进程存活，<code>/ready</code> 只检查必要运行依赖。
        两个都绿<strong>也不代表短信已启用</strong>——短信没配时申请验证码会返回 503，
        这是后端的正确行为。
      </p>
    </section>

    <section class="note">
      <h2 class="h2">本地验收桩</h2>
      <p>
        真实后端要 MySQL + 迁移 + 密钥才能起。本地验收用
        <code>npm run stub</code>（<code>tools/dev-stub-server.mjs</code>），
        它按运行时实现逐字段复刻，<strong>不是后端</strong>。
        配合 <code>VITE_BACKEND_ORIGIN=http://127.0.0.1:3210</code> 使用。
      </p>
    </section>

    <section class="note">
      <h2 class="h2">后端仍未实现的 5 个接口</h2>
      <ul>
        <li>实名状态 <code>GET /api/v1/identity-verifications/current</code></li>
        <li>平台能力总览 <code>GET /api/v1/capabilities</code></li>
        <li>运营服务列表 <code>GET /api/v1/admin/provider-readiness</code></li>
        <li>规则版本 <code>GET /api/v1/rule-versions/{id}</code></li>
        <li>合同快照 <code>GET /api/v1/contract-snapshots/{id}</code></li>
      </ul>
      <p>这几个调用会返回 404，对应页面暂不做。</p>
    </section>

    <section class="note">
      <h2 class="h2">运行时约定（照 origin/pr11 实测，不是照示例文件）</h2>
      <ul>
        <li>
          <code>Membership.allowed_actions</code> 服务端<strong>硬编码恒返回空数组</strong>。
          所以工作台不再为它单独留一行——不是隐藏，是它现在没有信息量。
          主体级权限看 <code>Party.allowed_actions</code>。
        </li>
        <li>
          <code>error.retryable</code> 服务端<strong>硬编码恒为 false</strong>。
          客户端不能靠它判断可重试性，只能按状态码和错误码自己判（见
          <code>src/api/errors.ts</code>）。
        </li>
        <li>
          4xx/5xx 的 <code>error.message</code> 一律是通用文案，
          <strong>前端必须以 <code>error.code</code> 为准</strong>。
        </li>
        <li>
          <code>allowed_actions</code> 实际词汇是全大写下划线；契约示例文件
          <code>contracts/examples/platform.json</code> 用的是点号小写，示例是错的。
        </li>
      </ul>
    </section>

    <section class="note">
      <h2 class="h2">对象版本是用来做并发控制的</h2>
      <p>
        <code>object_version</code> 就是 ETag。改主体、改机构名这类写操作必须带上
        <code>If-Match: &lt;object_version&gt;</code>，服务端据此判断"你读到的版本还在不在"。
        不是这版本就返回 412，前端要重新拉一次再让用户决定。
      </p>
    </section>
  </div>
</template>

<style scoped>
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 24px 80px;
}

.title {
  font-size: 22px;
  font-weight: 500;
  margin: 0 0 20px;
}

.note {
  margin-top: 28px;
}

.h2 {
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 8px;
  color: var(--ops-text);
}

.note p,
.note ul {
  margin: 0;
  font-size: 13px;
  line-height: 1.9;
  color: var(--ops-text-2);
}

.note ul {
  padding-left: 20px;
}

code {
  font-family: var(--ops-mono);
  font-size: 12px;
  background: var(--ops-bg);
  padding: 1px 5px;
  border-radius: 4px;
}
</style>
