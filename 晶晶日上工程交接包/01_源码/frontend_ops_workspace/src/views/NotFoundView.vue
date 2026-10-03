<script setup lang="ts">
/**
 * 404。
 *
 * 版面跟登录页同一套：满屏墨底 + 宋体品牌名。
 * 理由是这两页都是"不在工作台里面"的页面——一个是进不来，一个是走错了，
 * 用同一套壳子，比让用户突然看到一张系统默认的白底报错页舒服。
 *
 * 不用 el-button：一个页面只有一个动作时，按钮的边框和底色都是多余装饰，
 * 一条带下划线的文字链接就够，也更容易看出它是个链接。
 */
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
</script>

<template>
  <div class="nf">
    <div class="stage">
      <p class="brand">晶选片场</p>
      <h1 class="title">页面不存在</h1>
      <p class="hint">
        地址 <span class="ops-mono path">{{ route.fullPath }}</span> 没有对应的页面。
      </p>
      <button type="button" class="back" @click="router.replace('/workspace')">回到工作台</button>
    </div>
  </div>
</template>

<style scoped>
.nf {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 56px 24px;
  background: var(--ops-ink);
  background-image: radial-gradient(1100px 520px at 50% 22%, rgba(201, 164, 94, 0.08), transparent 62%);
}

.stage {
  max-width: 420px;
  width: 100%;
  text-align: center;
  animation: rise 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stage {
    animation: none;
  }
}

.brand {
  margin: 0 0 26px;
  font-family: var(--ops-serif);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-indent: 0.22em;
  color: var(--ops-gold);
}

.title {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-indent: 0.06em;
  color: var(--ops-text-invert);
}

.hint {
  margin: 14px 0 30px;
  font-size: 13px;
  line-height: 1.9;
  color: rgba(242, 245, 250, 0.62);
}

.path {
  color: rgba(242, 245, 250, 0.86);
  overflow-wrap: anywhere;
}

.back {
  border: 0;
  background: none;
  padding: 0 0 4px;
  font-family: inherit;
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--ops-gold);
  cursor: pointer;
  border-bottom: 1px solid var(--ops-gold-dim);
  transition: border-color 0.15s ease;
}

.back:hover {
  border-bottom-color: var(--ops-gold);
}
</style>
