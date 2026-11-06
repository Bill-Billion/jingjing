import { defineStore } from 'pinia'
import { shallowRef, watch } from 'vue'
import { useSessionStore } from './session'
import type { AttachmentCommand } from '@/api/modules/customizationAttachments'

export interface StoryAttachmentRecovery { command:AttachmentCommand; code:string }
// Private bytes stay in memory only. Leaving a page must not create a new upload.
export const useStoryAttachmentRecoveryStore = defineStore('story-attachment-recovery', () => {
  const session = useSessionStore(), entries = shallowRef<Record<string,StoryAttachmentRecovery>>({})
  // A view may refresh the same account object; only an identity change clears private bytes.
  watch([() => session.token,() => session.account?.id,() => session.selectedId,() => session.revision], () => { entries.value = {} }, {flush:'sync'})
  function read(id:string) { return entries.value[id] }
  function write(id:string, value:StoryAttachmentRecovery|null) {
    const next = {...entries.value}; if (value) next[id] = value; else delete next[id]; entries.value = next
  }
  return {read,write}
})
