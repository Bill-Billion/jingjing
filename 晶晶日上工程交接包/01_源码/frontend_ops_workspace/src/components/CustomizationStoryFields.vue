<script setup lang="ts">
import type { CustomizationTemplate } from '@/api/modules/customization'
defineProps<{template:CustomizationTemplate;modelValue:Record<string,string>;errors:Record<string,string>;disabled?:boolean;readonly?:boolean}>()
const emit = defineEmits<{'update:modelValue':[value:Record<string,string>]}>()
</script>

<template>
  <div class="story-fields" data-testid="story-fields">
    <div v-for="field in template.fields" :key="field.key" class="story-field">
      <label :for="`story-answers-${field.key}`">{{ field.label }} <span v-if="field.required" class="required">（正式提交必填）</span><span v-else class="muted">（选填）</span></label>
      <p v-if="field.type === 'PRIVATE_ATTACHMENT'" :id="`story-answers-${field.key}`" class="story-attachment" tabindex="-1" :aria-describedby="errors[`answers.${field.key}`] ? `story-error-${field.key}` : undefined" data-testid="story-attachment-unavailable">附件上传尚未开放。可以先保存文字草稿{{ field.required ? '，必填附件可用后才能正式提交这类故事' : '，本轮正式提交不包含附件' }}。</p>
      <select v-else-if="field.type === 'CHOICE'" :id="`story-answers-${field.key}`" :value="modelValue[field.key] || ''" :disabled="disabled || readonly" :aria-invalid="!!errors[`answers.${field.key}`]" :aria-describedby="errors[`answers.${field.key}`] ? `story-error-${field.key}` : undefined" @change="emit('update:modelValue',{...modelValue,[field.key]:($event.target as HTMLSelectElement).value})"><option value="">请选择</option><option v-for="option in field.options" :key="option" :value="option">{{ option }}</option></select>
      <template v-else>
        <textarea :id="`story-answers-${field.key}`" :value="modelValue[field.key] || ''" :disabled="disabled" :readonly="readonly" rows="6" :aria-invalid="!!errors[`answers.${field.key}`]" :aria-describedby="`story-count-${field.key}${errors[`answers.${field.key}`] ? ` story-error-${field.key}` : ''}`" @input="emit('update:modelValue',{...modelValue,[field.key]:($event.target as HTMLTextAreaElement).value})"/>
        <small :id="`story-count-${field.key}`" class="muted">{{ Array.from(modelValue[field.key] || '').length }} / {{ field.max_length || 12000 }} 字</small>
      </template>
      <p v-if="errors[`answers.${field.key}`]" :id="`story-error-${field.key}`" class="story-field-error" role="alert">{{ errors[`answers.${field.key}`] }}</p>
    </div>
  </div>
</template>

<style scoped>
.story-fields{display:grid;gap:24px}.story-field label{display:block;font-weight:600;line-height:1.6;margin-bottom:10px}.story-field label span{font-size:12px;font-weight:400}.story-field textarea,.story-field select{width:100%;box-sizing:border-box}.story-field textarea{min-height:140px;resize:vertical;line-height:1.7}.story-field small{display:block;margin-top:8px}.story-field [aria-invalid=true]{border-color:#a0292e}.story-field-error{font-size:13px;line-height:1.6;color:#a0292e;margin:8px 0}.story-attachment{padding:16px;background:var(--ops-accent-soft);line-height:1.7;border:1px solid var(--ops-border)}
</style>
