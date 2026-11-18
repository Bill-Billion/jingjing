<script setup lang="ts">
defineProps<{preview:{url:string;type:string;label:string}}>()
defineEmits<{close:[];failed:[]}>()
</script>
<template><section class="artist-preview" data-testid="artists-preview"><div class="section-heading"><h2>本次受控读取</h2><button type="button" class="outline" @click="$emit('close')">关闭并清除预览</button></div><p class="muted">{{preview.label}}。再次查看请重新读取；历史读取不代表当前仍有使用权。</p><img @error="$emit('failed')" v-if="preview.type.startsWith('image/')" :src="preview.url" :alt="preview.label"><video @error="$emit('failed')" v-else-if="preview.type==='video/mp4'" controls :src="preview.url" preload="metadata"></video><audio @error="$emit('failed')" v-else-if="preview.type.startsWith('audio/')" controls :src="preview.url" preload="metadata"></audio><p v-else>此材料不在页面内执行，按本次权限保存后查看。</p><a :href="preview.url" download="本次获准材料" class="button-link outline">保存本次已获准材料</a></section></template>
