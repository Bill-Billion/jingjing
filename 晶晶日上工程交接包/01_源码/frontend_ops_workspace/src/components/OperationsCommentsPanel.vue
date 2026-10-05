<script setup lang="ts">
import {commentStatus,type Comment} from '@/api/modules/operations'
import {shortSupplyId} from '@/api/modules/supply'
defineProps<{comments:Comment[];selected:string;disabled:boolean}>()
defineEmits<{select:[id:string]}>()
</script>
<template><section class="supply-card ops-comments"><h2>当前获准可见的留言</h2><p class="muted">纯文本留言按实际记录显示。隐藏或撤回后只保留状态，不再显示原文。</p>
<article v-for="c in comments" :key="c.id" :class="['ops-comment',{selected:selected===c.id}]" :data-testid="`ops-comment-${c.id}`">
<div class="ops-comment-heading"><span>账号 {{shortSupplyId(c.author_account_id)}} · {{c.party_id?'主体 '+shortSupplyId(c.party_id):'独立账号身份'}}</span><span class="status-chip">{{commentStatus[c.current_status]}}</span></div>
<p v-if="c.current_status==='VISIBLE'" class="ops-text">{{c.body}}</p><p v-else class="muted">{{c.current_status==='WITHDRAWN'?'原文已由作者撤回':'原文已由独立管理人员隐藏'}}</p>
<p v-if="c.reply_to" class="muted">回复原留言 {{shortSupplyId(c.reply_to)}}</p><div class="ops-comment-footer"><time>{{c.created_at}}</time><button class="outline" :disabled="disabled" :data-testid="`ops-select-comment-${c.id}`" @click="$emit('select',c.id)">选择此留言</button></div>
<details class="ops-technical"><summary>记录与版本依据</summary><dl><dt>留言编号</dt><dd>{{c.id}}</dd><dt>账号编号</dt><dd>{{c.author_account_id}}</dd><dt>办理主体</dt><dd>{{c.party_id||'无办理主体'}}</dd><dt>当前版本</dt><dd>{{c.object_version}}</dd></dl></details>
</article><p v-if="!comments.length" class="supply-empty">当前读取范围没有留言。</p><slot/></section></template>
