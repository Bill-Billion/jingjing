<script setup lang="ts">
import { computed } from 'vue'
import { attachmentSize, STORY_FILE_TYPES, type StoryAttachment, type StoryFile } from '@/api/modules/customizationAttachments'
import StoryAttachmentReference from './StoryAttachmentReference.vue'
const props = defineProps<{fieldKey:string;assetId?:string;requestId:string;items:StoryAttachment[];selected?:StoryFile;editable:boolean;locked:boolean;error?:string}>()
const emit = defineEmits<{'select':[file:File|null];'upload':[];'bind':[id:string];'download':[asset:StoryAttachment]}>()
const choices = computed(()=>props.items.filter(a=>a.request_id===props.requestId && a.current_status==='READY'))
function select(event:Event) { const input=event.target as HTMLInputElement;emit('select',input.files?.[0]||null);input.value='' }
</script>
<template>
  <div class="story-file-field" data-testid="story-attachment-field">
    <StoryAttachmentReference :asset-id="assetId" :items="items" :busy="locked" @download="$emit('download',$event)"/>
    <p v-if="!requestId" class="muted">先点击“创建并保存草稿”，再为这份故事选择并上传附件。尚未填写完成的文字也可以先保存。</p>
    <template v-else>
      <label :for="`story-answers-${fieldKey}`">{{ assetId ? '选择替换文件' : '选择本次上传文件' }}</label>
      <input :id="`story-answers-${fieldKey}`" type="file" :accept="STORY_FILE_TYPES.join(',')" :disabled="!editable || locked" :aria-invalid="!!error" :aria-describedby="`story-file-help-${fieldKey}${error ? ` story-error-${fieldKey}` : ''}`" @change="select"/>
      <p :id="`story-file-help-${fieldKey}`" class="muted">支持 JPEG、PNG、MP4、MP3、WAV、PDF、纯文本；单个文件最多 8 MiB。上传成功后仍须保存草稿，正式提交后才供平台读取。</p>
      <div v-if="selected" class="story-file-selected"><p>已选择：<strong>{{ selected.displayName }}</strong> · {{ attachmentSize(selected.file.size) }}</p><div class="supply-actions"><button type="button" class="primary" :disabled="!editable || locked" @click="$emit('upload')">上传并关联本次文件</button><button type="button" class="outline" :disabled="locked" @click="$emit('select',null)">取消本次选择</button></div></div>
      <label v-if="choices.length" :for="`story-existing-${fieldKey}`">或关联本故事已上传的文件<select :id="`story-existing-${fieldKey}`" :value="assetId || ''" :disabled="!editable || locked" @change="$emit('bind',($event.target as HTMLSelectElement).value)"><option value="">本字段不关联附件</option><option v-if="assetId && !choices.some(a=>a.id===assetId)" :value="assetId" disabled>当前附件尚未读到，请继续读取清单</option><option v-for="asset in choices" :key="asset.id" :value="asset.id">{{ asset.display_name }} · {{ attachmentSize(asset.byte_size) }}</option></select></label>
      <button v-else-if="assetId" type="button" class="outline" :disabled="!editable || locked" @click="$emit('bind','')">解除本次输入的关联</button>
      <p v-if="assetId" class="muted">换文件或解除关联只修改本次输入，不会删除旧正式版本中的附件。</p>
    </template>
  </div>
</template>
<style scoped>
.story-file-field{padding:18px;border:1px solid var(--ops-border);background:var(--ops-accent-soft);line-height:1.7}.story-file-field label{display:block;font-weight:500;margin:16px 0 8px}.story-file-field input,.story-file-field select{max-width:100%;width:100%;box-sizing:border-box}.story-file-field select{display:block;margin-top:8px}.story-file-field p{overflow-wrap:anywhere}.story-file-selected{padding:12px 0;border-block:1px solid var(--ops-border)}.story-file-field .muted{font-size:13px}
</style>
