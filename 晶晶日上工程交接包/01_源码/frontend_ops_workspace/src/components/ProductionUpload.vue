<script setup lang="ts">
import { ref } from 'vue'
import { fileMedia, MAX_FILE_BYTES, type FileMedia } from '@/api/modules/production'
defineProps<{disabled:boolean}>()
const emit=defineEmits<{upload:[file:File,media:FileMedia]}>(),file=ref<File|null>(null),media=ref<FileMedia|' '>(' '),error=ref('')
function choose(e:Event){const f=(e.target as HTMLInputElement).files?.[0]||null;error.value='';file.value=null;if(!f)return;if(!f.size||f.size>MAX_FILE_BYTES){error.value='文件须为非空且不超过 50 MiB。';return}file.value=f;media.value=Object.hasOwn(fileMedia,f.type)?f.type as FileMedia:' '}
function upload(){if(file.value&&Object.hasOwn(fileMedia,media.value))emit('upload',file.value,media.value as FileMedia)}
</script>
<template><div class="production-upload"><div class="trade-fields two"><label>文件类型 *<select v-model="media" data-testid="production-file-media" :disabled="disabled"><option value=" ">待选择</option><option v-for="(label,key) in fileMedia" :key="key" :value="key">{{label}}</option></select></label><label>私有制作文件 *<input type="file" data-testid="production-file" :disabled="disabled" @change="choose"></label></div><p v-if="file" class="muted">{{file.name}} · {{file.size.toLocaleString('zh-CN')}} 字节</p><p v-if="error" class="supply-warning" role="alert">{{error}}</p><p class="muted">剧本交付用纯文本；样片、粗剪和成片用 MP4。50 MiB 是单文件技术上限，不改变原订单约定。</p><button type="button" class="outline" :disabled="disabled||!file||!Object.hasOwn(fileMedia,media)" @click="upload">上传私有制作文件</button></div></template>
