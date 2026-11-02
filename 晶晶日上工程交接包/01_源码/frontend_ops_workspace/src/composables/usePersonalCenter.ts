import { computed, onScopeDispose, ref, watch } from 'vue'
import { ApiError, asApiError } from '@/api/client'
import { readPersonalCenter, sourcesFor, personalSources, type PersonalCategory, type PersonalSource, type PersonalItem, type PersonalSection } from '@/api/modules/personalCenter'
import type { SupplyIdentity } from '@/api/modules/supply'
interface Context { token: string | null; accountId: string; partyId: string; revision: number; category: PersonalCategory }
export interface PersonalSectionState { source: PersonalSource; label: string; items: PersonalItem[]; cursor: string | null; loaded: boolean; loading: boolean; error: ApiError | null; retryCursor: string | null; retryAppend: boolean; visited: string[] }
const blank = (source: PersonalSource): PersonalSectionState => ({source,label:personalSources[source].label,items:[],cursor:null,loaded:false,loading:false,error:null,retryCursor:null,retryAppend:false,visited:[]})
export function usePersonalCenter(context: () => Context) {
 const signature = computed(() => JSON.stringify(context())), sections = ref<PersonalSectionState[]>([]), error = ref<ApiError | null>(null), loading = ref(false)
 let generation = 0, disposed = false, controller = new AbortController(), sequences = new Map<PersonalSource,number>()
 const ready = computed(() => !!context().token && !!context().accountId && !!context().partyId)
 function clear() { generation++; controller.abort(); controller = new AbortController(); sequences = new Map(); sections.value = sourcesFor(context().category).map(blank); error.value = null; loading.value = false }
 watch(signature,clear,{immediate:true,flush:'sync'})
 const current = (g: number) => !disposed && g === generation
 const identity = (): SupplyIdentity => ({token:context().token!,accountId:context().accountId,partyId:context().partyId})
 function denied(e: ApiError) { if ([401,403,404,409].includes(e.status)) { clear(); error.value = e; return true } return false }
 function apply(state: PersonalSectionState, result: PersonalSection, cursor: string | null, append: boolean) {
  state.retryCursor = cursor; state.retryAppend = append; state.loading = false
  if (result.status === 'UNAVAILABLE') { state.error = new ApiError({status:503,code:result.error_code!,message:'这部分暂时未能加载，请重试。'}); return }
  if (result.next_cursor !== null && (result.next_cursor === cursor || state.visited.includes(result.next_cursor))) { state.error = new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'分页位置未前进，请从头重新读取此来源。'}); return }
  state.items = [...new Map([...(append ? state.items : []),...result.items].map(item => [item.key,item])).values()]
  state.cursor = result.next_cursor; state.loaded = true; state.error = null; state.visited = append ? [...state.visited,...cursor ? [cursor] : []] : []; state.retryCursor = null; state.retryAppend = false
 }
 async function load() {
  if (!ready.value || loading.value || sections.value.some(section => section.loading)) return
  clear(); const g = generation, category = context().category; loading.value = true
  try { const result = await readPersonalCenter(identity(),category,undefined,undefined,{signal:controller.signal}); if (!current(g)) return; for (const section of result.sections) apply(sections.value.find(state => state.source === section.source)!,section,null,false) }
  catch (e) { if (current(g)) { const failure = asApiError(e); if (!denied(failure)) error.value = failure } }
  finally { if (current(g)) loading.value = false }
 }
 async function readSource(source: PersonalSource, mode: 'next' | 'retry' | 'refresh' = 'next') {
  const state = sections.value.find(section => section.source === source)
  if (!state || !ready.value || loading.value || state.loading) return
  if (mode === 'next' && (!state.loaded || !state.cursor || state.error)) return
  if (mode === 'retry' && !state.error) return
  const append = mode === 'next' || mode === 'retry' && state.retryAppend, cursor = mode === 'next' ? state.cursor : mode === 'retry' ? state.retryCursor : null
  if (mode === 'refresh') Object.assign(state,blank(source))
  const g = generation, n = (sequences.get(source) || 0) + 1, category = context().category; sequences.set(source,n); state.loading = true; state.error = null; state.retryCursor = cursor; state.retryAppend = append
  try { const result = await readPersonalCenter(identity(),category,source,cursor,{signal:controller.signal}); if (current(g) && sequences.get(source) === n) apply(state,result.sections[0]!,cursor,append) }
  catch (e) { if (current(g) && sequences.get(source) === n) { const failure = asApiError(e); if (!denied(failure)) state.error = failure } }
  finally { if (current(g) && sequences.get(source) === n) state.loading = false }
 }
 onScopeDispose(() => { disposed = true; clear() })
 return {signature,sections,error,loading,ready,load,readSource,clear}
}
