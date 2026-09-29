<script setup lang="ts">
/**
 * 根组件。
 * 目前不需要顶栏/侧边栏——登录页自己排版，工作台自己排版。
 * 等运营区 /admin 和合作方区 /partner 的版式做出来，这里再挂 layouts。
 */
import { RouterView, useRouter } from 'vue-router'
import { watch } from 'vue'
import { useSessionStore } from '@/stores/session'
const session = useSessionStore()
const router = useRouter()
watch(() => session.token, token => { if (!token && !router.currentRoute.value.meta.public) void router.replace('/login') })
</script>

<template>
  <RouterView />
</template>
