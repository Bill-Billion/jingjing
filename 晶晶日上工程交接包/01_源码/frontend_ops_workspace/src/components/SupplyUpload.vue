<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MAX_ASSET_BYTES, mediaTypes, shortSupplyId, type MediaType } from '@/api/modules/supply'
const props = defineProps<{ label: string; ids: string[]; disabled?: boolean; single?: boolean; compact?: boolean }>()
const emit = defineEmits<{ upload: [file: File, mediaType: MediaType]; remove: [id: string] }>()
const file = ref<File | null>(null), media = ref<MediaType | ''>(''), input = ref<HTMLInputElement | null>(null)
const issue = computed(() => file.value && (file.value.size < 1 || file.value.size > MAX_ASSET_BYTES) ? '文件须大于 0 字节，且不超过 8 MiB。' : '')
function choose(event: Event) { file.value = (event.target as HTMLInputElement).files?.[0] || null; media.value = file.value && Object.hasOwn(mediaTypes, file.value.type) ? file.value.type as MediaType : '' }
watch(() => props.ids.join(), () => { file.value = null; media.value = ''; if (input.value) input.value.value = '' })
</script>
<template>
  <div class="upload-box">
    <p class="field-label">{{ label }} <span class="required">*</span></p>
    <ul v-if="ids.length" class="asset-ids"><li v-for="id in ids" :key="id"><span :title="id" :aria-label="id">{{ shortSupplyId(id) }}</span><button type="button" :disabled="disabled" @click="emit('remove', id)">移除引用</button></li></ul>
    <div class="upload-controls"><label class="file-choice">选择文件<input ref="input" type="file" :aria-label="`选择${label}文件`" :disabled="disabled || ids.length >= 100 || (single && !!ids.length)" @change="choose"></label><label>文件类型<select v-model="media" :aria-label="`${label}文件类型`" :disabled="disabled || !file"><option value="">请选择</option><option v-for="(name, type) in mediaTypes" :key="type" :value="type">{{ name }}</option></select></label><button type="button" class="outline" :disabled="disabled || ids.length >= 100 || !file || !media || !!issue" @click="file && media && emit('upload', file, media)">上传私有材料</button></div>
    <p v-if="file" class="muted">{{ file.name }} · {{ Math.ceil(file.size / 1024) }} KiB</p><p v-if="issue" class="form-error" role="alert">{{ issue }}</p><p v-if="!compact" class="muted">每份不超过 8 MiB；上传确认成功后才可引用。仅本人负责人及获准审核人员可读取。</p>
  </div>
</template>
<style scoped>
.upload-box{border:1px dashed var(--ops-border-strong);background:var(--ops-bg);padding:18px;border-radius:10px;min-width:0}.upload-controls{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap}.upload-controls label{font-size:13px;min-width:0}.upload-controls select{display:block;margin-top:8px}.file-choice{flex:1;min-width:200px!important}.file-choice input{display:block;width:100%;margin-top:10px;font:13px var(--ops-sans)}.file-choice input::file-selector-button{min-height:44px;padding:10px 14px;margin-right:12px;border:1px solid var(--ops-border-strong);border-radius:10px;background:var(--ops-surface);color:var(--ops-ink);font:14px var(--ops-sans);cursor:pointer}.file-choice input:disabled::file-selector-button{opacity:.45;cursor:not-allowed}.asset-ids{margin:0 0 14px;padding:0;list-style:none}.asset-ids li{display:flex;align-items:center;gap:14px}.asset-ids span{overflow-wrap:anywhere;flex:1;min-width:0}.asset-ids button{white-space:nowrap}.field-label{margin:0 0 14px;font-weight:600}.muted{font-size:12px;line-height:1.8;color:var(--ops-text-2);margin:12px 0 0}.required,.form-error{color:var(--ops-danger)}
</style>
