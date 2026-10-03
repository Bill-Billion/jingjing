<script setup lang="ts">
/**
 * 后端连通性自检。**只给开发用**，挂在 /dev/status 上，登录页不放。
 *
 * 为什么从登录页移走：普通用户不关心进程活没活，探针是排查工具，
 * 摆在登录页上只会让人觉得"这页还没做完"。
 *
 * 注意：/health 只说明进程存活，/ready 只检查必要依赖，
 * **都不代表短信或商业服务已启用**。别把探针绿了当成"能登录"。
 */
import { onMounted, ref } from 'vue'
import { probe, API_BASE } from '@/api/client'

const health = ref<{ ok: boolean; detail: string } | null>(null)
const ready = ref<{ ok: boolean; detail: string } | null>(null)
const checking = ref(false)

async function check() {
  checking.value = true
  health.value = null
  ready.value = null
  const [h, r] = await Promise.all([probe('/health'), probe('/ready')])
  health.value = h
  ready.value = r
  checking.value = false
}

onMounted(check)

defineExpose({ check })
</script>

<template>
  <div class="status" data-testid="backend-status">
    <div class="row">
      <span class="path ops-mono">/health</span>
      <span class="dot" :class="health ? (health.ok ? 'on' : 'off') : 'pending'" />
      <span class="detail ops-mono">{{ health ? health.detail : '检查中…' }}</span>
      <span class="desc">进程存活</span>
    </div>

    <div class="row">
      <span class="path ops-mono">/ready</span>
      <span class="dot" :class="ready ? (ready.ok ? 'on' : 'off') : 'pending'" />
      <span class="detail ops-mono">{{ ready ? ready.detail : '检查中…' }}</span>
      <span class="desc">依赖就绪</span>
    </div>

    <div class="row">
      <span class="path">接口前缀</span>
      <span class="detail ops-mono">{{ API_BASE }}</span>
    </div>

    <el-button link size="small" :loading="checking" @click="check">重新检测</el-button>
  </div>
</template>

<style scoped>
.status {
  border: 1px solid var(--ops-border);
  background: var(--ops-surface);
  border-radius: var(--ops-radius);
  padding: 14px 16px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  padding: 5px 0;
}

.path {
  width: 68px;
  flex: none;
  font-size: 12px;
  color: var(--ops-text-2);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  background: var(--ops-text-3);
}

.dot.on {
  background: var(--ops-success);
}

.dot.off {
  background: var(--ops-danger);
}

.detail {
  font-size: 12px;
  color: var(--ops-text);
}

.desc {
  font-size: 12px;
  color: var(--ops-text-3);
}
</style>
