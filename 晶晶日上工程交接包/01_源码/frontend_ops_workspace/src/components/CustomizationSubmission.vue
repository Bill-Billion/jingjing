<script setup lang="ts">
import type { IntakeRequest } from '@/api/modules/customization'
import type { StoryAttachment } from '@/api/modules/customizationAttachments'
import StoryAttachmentReference from './StoryAttachmentReference.vue'
withDefaults(defineProps<{ request: Pick<IntakeRequest, 'submission' | 'template_version_id'>; attachments?:StoryAttachment[]; attachmentBusy?:boolean }>(),{attachments:()=>[]})
defineEmits<{'download-attachment':[asset:StoryAttachment]}>()
</script>

<template>
  <section class="supply-card" data-testid="customization-submission">
    <h2>用户正式提交的故事</h2>
    <p class="muted">{{ request.submission.template_snapshot.description }}</p>
    <dl class="submission-answers">
      <div v-for="field in request.submission.template_snapshot.fields" :key="field.key">
        <dt>{{ field.label }}<span v-if="field.required" class="required"> *</span></dt>
        <dd v-if="field.type === 'PRIVATE_ATTACHMENT'"><StoryAttachmentReference :asset-id="request.submission.answers[field.key]" :items="attachments" :busy="attachmentBusy" @download="$emit('download-attachment',$event)"/></dd>
        <dd v-else-if="Object.hasOwn(request.submission.answers, field.key)" class="long-text">{{ request.submission.answers[field.key] === '' ? '（用户留空）' : request.submission.answers[field.key] }}</dd>
        <dd v-else class="muted">未填写</dd>
      </div>
    </dl>
    <details class="submission-record">
      <summary>提交版本与核对信息</summary>
      <dl class="supply-facts">
        <div><dt>提交编号</dt><dd>{{ request.submission.id }}</dd></div>
        <div><dt>模板版本编号</dt><dd>{{ request.template_version_id }}</dd></div>
        <div><dt>提交账号</dt><dd>{{ request.submission.submitted_by }}</dd></div>
        <div><dt>提交时间（UTC）</dt><dd><time :datetime="request.submission.submitted_at">{{ request.submission.submitted_at }}</time></dd></div>
        <div class="submission-hash"><dt>内容校验值</dt><dd>{{ request.submission.content_sha256 }}</dd></div>
      </dl>
      <p class="muted">此页使用提交时保存的问题和答案。开始受理不会修改用户原话，也不表示内容或授权已审核通过。</p>
    </details>
  </section>
</template>

<style scoped>
.submission-answers{margin:0}.submission-answers>div{padding:20px 0;border-bottom:1px solid var(--ops-border)}
.submission-answers dt{font-size:14px;color:var(--ops-text-2);margin-bottom:10px}.submission-answers dd{margin:0;line-height:1.8}
.submission-record{margin-top:24px;color:var(--ops-text-2);font-size:14px}.submission-record summary{cursor:pointer;min-height:44px;display:list-item;align-content:center}.submission-record dl{margin-top:20px}.submission-hash{grid-column:1/-1}
</style>
