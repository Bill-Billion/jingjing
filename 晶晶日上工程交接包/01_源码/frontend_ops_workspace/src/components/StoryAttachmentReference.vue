<script setup lang="ts">
import { computed } from 'vue'
import { attachmentSize, type StoryAttachment } from '@/api/modules/customizationAttachments'
const props = defineProps<{assetId?:string;items:StoryAttachment[];busy?:boolean}>()
defineEmits<{'download':[asset:StoryAttachment]}>()
const asset = computed(()=>props.items.find(a=>a.id===props.assetId))
const labels = {UPLOADING:'上传结果待核对',READY:'可受控下载',REVOKED:'访问已撤回'}
</script>
<template>
  <div class="story-file-reference">
    <template v-if="asset"><strong>{{ asset.display_name }}</strong><span class="muted">{{ attachmentSize(asset.byte_size) }} · {{ labels[asset.current_status] }}</span><span v-if="asset.retention_reason === 'FORMAL_SUBMISSION'" class="muted">正式版本已引用，需按资料保留流程处理。</span><button v-if="asset.current_status === 'READY'" type="button" class="outline" :disabled="busy" @click="$emit('download',asset)">受控下载</button></template>
    <p v-else-if="assetId" class="muted">此版本已关联附件。请读取下方附件清单核对文件名；若还有下一页，请继续读取。</p>
    <p v-else class="muted">本字段未关联附件。</p>
  </div>
</template>
<style scoped>
.story-file-reference{display:flex;gap:10px 16px;align-items:center;flex-wrap:wrap;line-height:1.7}.story-file-reference strong{overflow-wrap:anywhere}.story-file-reference span{font-size:13px}.story-file-reference p{margin:0}.story-file-reference button{min-height:40px}
</style>
