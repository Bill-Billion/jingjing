<script setup lang="ts">
import { attachmentSize, type StoryAttachment } from '@/api/modules/customizationAttachments'
defineProps<{items:StoryAttachment[];loaded:boolean;nextCursor:string|null;locked:boolean;downloading?:string;operator?:boolean;retained?:string[]}>()
defineEmits<{'load':[more:boolean];'download':[asset:StoryAttachment];'revoke':[asset:StoryAttachment]}>()
const labels = {UPLOADING:'上传结果待核对',READY:'可受控下载',REVOKED:'访问已撤回'}
</script>
<template>
  <section class="supply-card story-attachment-list" data-testid="story-attachment-list">
    <div class="section-heading"><h2>{{ operator ? '正式版本的受控附件' : '本故事的附件记录' }}</h2><button type="button" class="outline" :disabled="locked" @click="$emit('load',false)">重新读取附件清单</button></div>
    <p class="muted">{{ operator ? '只读取正式版本引用的文件；本人尚未正式提交的附件与补件草稿不可见。' : '每个故事最多 40 条上传记录，包含待核对和已撤回记录。' }} 文件统一按当前权限下载，不内嵌执行；上传成功不代表人物授权已审核。</p>
    <div v-for="asset in items" :key="asset.id" class="story-attachment-row"><div><strong>{{ asset.display_name }}</strong><p>{{ attachmentSize(asset.byte_size) }} · {{ asset.media_type }} · {{ labels[asset.current_status] }}</p><p v-if="retained?.includes(asset.id)" class="muted">已由正式版本引用，按资料保留流程处理。</p></div><div class="supply-actions"><button type="button" class="outline" :disabled="locked || !!downloading || asset.current_status !== 'READY'" @click="$emit('download',asset)">{{ downloading === asset.id ? '正在核对下载…' : '受控下载' }}</button><button v-if="!operator && asset.current_status !== 'REVOKED'" type="button" class="outline" :disabled="locked || retained?.includes(asset.id)" @click="$emit('revoke',asset)">撤回附件访问</button></div></div>
    <p v-if="loaded && !items.length" class="supply-empty">{{ nextCursor ? '本页没有可见附件，后续页面仍可能有记录，请继续读取。' : operator ? '没有当前可读取的正式附件。' : '本故事还没有上传记录。请在附件字段选择文件。' }}</p>
    <button v-if="nextCursor" type="button" class="outline" :disabled="locked" data-testid="story-attachments-more" @click="$emit('load',true)">继续读取下一页附件</button>
    <p v-if="!operator" class="muted">撤回仅关闭未正式引用附件的访问，不表示彻底删除文件与备份。已属于正式版本的文件须按资料保留流程处理。</p>
    <p v-else class="muted">附件按正式版本保留，补件换文件不会改写旧版本。此页不提供删除入口；保留与撤回请求须按资料保留流程办理。</p>
  </section>
</template>
<style scoped>
.story-attachment-list .section-heading{flex-wrap:wrap;gap:16px}.story-attachment-row{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:18px 0;border-top:1px solid var(--ops-border)}.story-attachment-row>div{min-width:0}.story-attachment-row strong{overflow-wrap:anywhere}.story-attachment-row p{font-size:13px;line-height:1.7;overflow-wrap:anywhere}.story-attachment-row .supply-actions{flex-shrink:0}@media(max-width:760px){.story-attachment-row{align-items:stretch;flex-direction:column;gap:10px}.story-attachment-list h2{font-size:20px}}
</style>
