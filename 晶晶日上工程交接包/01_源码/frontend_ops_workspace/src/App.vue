<script setup lang="ts">
/**
 * 根组件。
 * 目前不需要顶栏/侧边栏——登录页自己排版，工作台自己排版。
 * 等运营区 /admin 和合作方区 /partner 的版式做出来，这里再挂 layouts。
 */
import { RouterView, useRouter } from 'vue-router'
import { watch } from 'vue'
import '@/styles/editorial.css'
import { useSessionStore } from '@/stores/session'
const session = useSessionStore()
const router = useRouter()
watch(() => session.token, token => {
  if (!token && !router.currentRoute.value.meta.public) {
    const recovery = session.loginRecovery
    session.loginRecovery = null
    void router.replace(recovery === 'PHONE_CHANGE_CONFIRMATION'
      ? { path: '/login', query: { redirect: '/me/phone-change', phoneChange: 'uncertain' } }
      : '/login')
  }
})
</script>

<template>
  <RouterView />
</template>
