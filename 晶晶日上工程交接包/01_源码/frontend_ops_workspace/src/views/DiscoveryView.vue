<script setup lang="ts">
import type {ApiError} from '@/api/client'
import {computed,ref,watch} from 'vue'
import {useRoute} from 'vue-router'
import {useServiceContext} from '@/composables/useServiceContext'
import {isCities,isSearch,kinds,publicLink,query,type Cities,type Json,type PublicKind} from '@/api/modules/clientServices'
import {directoryCity,setDirectoryCity} from '@/business/directoryCity'
import ServiceWorkspace from '@/components/ServiceWorkspace.vue'
import StockPublicMedia from '@/components/business/StockPublicMedia.vue'
import {isMatches,isRecommendations,isRecommendedMatches,matchingFilters,discoveryReasons} from '@/business/matching'
const matching=ref(false),recommended=ref(false),ranking=ref<Json|null>(null),filters=ref<Record<string,string>>({}),reasons=ref<Record<string,string[]>>({}),seen=new Set<string>()
const route=useRoute(),ui=useServiceContext(()=>null),{error,notice}=ui
const cities=ref<Cities|null>(null),kind=ref<PublicKind>('ARTIST'),city=ref(directoryCity.value),term=ref(''),items=ref<Json[]>([]),cursor=ref<string|number|null>(null),loading=ref(false),loaded=ref(false),localCity=ref(false)
let serial=0,initialized=false
const empty=computed(()=>loaded.value&&!items.value.length&&!cursor.value&&!error.value)
const title=(r:Json)=>String(r.display_name||r.title||r.data?.title||r.notice?.title||r.data?.notice?.title||kinds[kind.value])
const text=(r:Json)=>String(r.introduction||r.description||r.data?.description||r.notice?.description||r.data?.notice?.description||r.service_area||'')
function clear(){ui.cancelReads();error.value=null;serial++;items.value=[];cursor.value=null;loaded.value=false;loading.value=false;reasons.value={};ranking.value=null;seen.clear()}
async function load(more=false){
 error.value=null;if(loading.value||more&&!cursor.value)return
 let selected:Record<string,string|number>={}
 try{if(matching.value)selected=matchingFilters(kind.value,filters.value)}catch(e){ui.fail(e instanceof Error?e.message:'请核对筛选条件');return}
 const turn=++serial,previous=more?cursor.value:null,chosen=kind.value
 if(!more){items.value=[];cursor.value=null;loaded.value=false;reasons.value={};ranking.value=null;seen.clear()}
 loading.value=true
 const endpoint=recommended.value?(matching.value?'recommended-matches':'recommendations'):(matching.value?'matches':'search')
 const validate=recommended.value?(matching.value?isRecommendedMatches:isRecommendations):(matching.value?isMatches:isSearch)
 const result=await ui.read('/discovery/'+endpoint+query({kind:chosen,city:city.value.trim(),q:term.value.trim(),...selected,cursor:previous,limit:20}),validate)
 if(turn!==serial)return;loading.value=false
 if(!result){if([400,401,403,404,409,412].includes((error.value as ApiError|null)?.status||0)){items.value=[];cursor.value=null;reasons.value={};ranking.value=null}return}
 if(result.kind!==chosen||result.next_cursor&&seen.has(String(result.next_cursor))||previous!==null&&result.next_cursor===previous){ui.fail('查询结果或分页位置不一致，请重新查找。');return}
 if(matching.value&&JSON.stringify(Object.entries(result.filters).sort())!==JSON.stringify(Object.entries(selected).sort())){ui.fail('返回筛选条件不一致，请重新查找。');return}
 if(result.next_cursor)seen.add(String(result.next_cursor))
 const rows=matching.value||recommended.value?result.items.map((r:Json)=>r.item):result.items
 if(matching.value||recommended.value)for(const r of result.items)reasons.value[r.item.listing_id||r.item.id]=r.reasons
 ranking.value=recommended.value?{personalized:result.personalized,catalog_truncated:result.catalog_truncated}:null
 items.value=more?[...new Map([...items.value,...rows].map(r=>[r.listing_id||r.id,r])).values()]:rows;cursor.value=result.next_cursor;loaded.value=true
}

async function ready(){initialized=true;const s=ui.signature.value,c=await ui.read('/discovery/cities',isCities);if(s!==ui.signature.value)return;cities.value=c;await load()}
watch(()=>[kind.value,city.value,term.value,matching.value,recommended.value,JSON.stringify(filters.value)],clear,{flush:'sync'})
watch(kind,()=>{filters.value={}},{flush:'sync'})
watch(()=>filters.value.purpose,()=>{if(filters.value.purpose!=='COMMERCIAL_LIMITED')delete filters.value.commercial_use},{flush:'sync'})
watch(ui.revision,()=>{clear();cities.value=null;if(initialized&&ui.ready.value)void ready()},{flush:'sync'})
watch(directoryCity,v=>{if(!localCity.value)city.value=v})
function defaultCity(){setDirectoryCity(city.value);localCity.value=false;notice.value=city.value?'已设为其他目录的默认城市。':'已清除目录默认城市。'}
</script>
<template><ServiceWorkspace title="查找公开内容" intro="按城市和关键词查找当前可公开的艺人、现成影片、试镜与通告。" account-only :error="error" :notice="notice" @ready="ready"><div class="service-tabs"><RouterLink to="/directory/organizations">公开机构</RouterLink><RouterLink to="/directory/featured">精选艺人</RouterLink><RouterLink to="/me/collections/favorites">我的收藏</RouterLink></div><form class="supply-card" @submit.prevent="load()"><div class="service-form"><label>内容类别<select v-model="kind"><option v-for="(name,key) in kinds" :key="key" :value="key">{{name}}</option></select></label><label>城市<input v-model="city" list="discovery-cities" placeholder="全部城市，或输入城市名称" maxlength="100" @input="localCity=true"><datalist id="discovery-cities"><option v-for="item in cities?.items" :key="item.code" :value="item.name"/></datalist></label><label class="wide">关键词<input v-model="term" type="search" maxlength="100" placeholder="公开名称、介绍或标签"></label></div><label class="service-check"><input v-model="recommended" type="checkbox">参考我的浏览与交易排序</label><p v-if="recommended">仅在隐私设置已开启个性化推荐时使用，不会自动修改你的设置。在当前公开结果中先按明确条件筛选，再优先展示近期实际购买城市、近期浏览城市的内容，其余按公开目录顺序；不改变价格，也不代替授权或成交。 <RouterLink to="/privacy/preferences">调整个性化推荐</RouterLink></p><label class="service-check"><input v-model="matching" type="checkbox">按明确条件匹配</label>
<div v-if="matching" class="service-form" data-testid="matching-filters">
<template v-if="kind==='ARTIST'"><label>最低星环<select v-model="filters.min_halo"><option value="">不限</option><option v-for="n in [0,1,2,3]" :key="n" :value="String(n)">{{n}}级</option></select></label><label>人物标签<input v-model="filters.tag" maxlength="40"></label></template>
<template v-if="kind==='STOCK'"><label>许可用途<select v-model="filters.purpose"><option value="">不限</option><option value="PERSONAL_NONCOMMERCIAL">个人非商业</option><option value="COMMERCIAL_LIMITED">约定商用范围</option></select></label><label v-if="filters.purpose==='COMMERCIAL_LIMITED'">商用用途<select v-model="filters.commercial_use"><option value="">不限</option><option value="BRAND_PROMOTION">品牌推广</option><option value="COMMERCIAL_ADVERTISING">商业广告</option><option value="CORPORATE_DISPLAY">企业展示</option></select></label></template>
<label v-if="kind==='STOCK'||kind==='AUDITION'">最高公开价格（元）<input v-model="filters.max_price_minor" inputmode="decimal" placeholder="留空不限；未公开价格不参与预算匹配"></label>
<label v-if="kind==='AUDITION'">试镜方式<select v-model="filters.audition_mode"><option value="">不限</option><option value="OFFLINE">线下试镜</option><option value="ONLINE_MATERIALS">线上材料</option></select></label>
<label v-if="kind==='NOTICE'">通告类型<select v-model="filters.notice_type"><option value="">不限</option><option v-for="(label,key) in {DRAMA:'剧集',PERFORMANCE:'商演',COMMERCIAL:'商单',EVENT:'活动',RECRUITMENT:'招募',OFFICIAL:'平台官方'}" :key="key" :value="key">{{label}}</option></select></label>
<p>只按你明确选择的条件和当前公开资料匹配，不计算“AI匹配率”，不按个人身份改价。进入详情后仍须核对当前授权、有效期和办理资格。</p></div>
<p class="service-muted">快捷城市来自服务器；也可输入其他城市名称精确查找。普通查找按公开目录顺序展示。</p><div class="service-actions"><button class="primary" :disabled="loading">查找</button><button type="button" class="outline" @click="defaultCity">将本页城市用于其他目录</button><button v-if="localCity" type="button" class="outline" @click="localCity=false;city=directoryCity">使用目录默认城市</button></div></form><section class="supply-card"><p v-if="loading" role="status">正在查找…</p><template v-if="ranking"><p>{{ranking.personalized?'当前使用已开启的个性化偏好。每条结果列出实际排序依据。':'当前个性化推荐已关闭，按公开目录顺序展示，仍可筛选和办理。'}}</p><p v-if="ranking.catalog_truncated">当前目录内容较多，本次推荐只覆盖前500条候选，请补充城市或关键词缩小范围。</p></template><div class="service-grid"><article v-for="item in items" :key="item.listing_id||item.id" class="service-result"><StockPublicMedia v-if="kind==='STOCK'" :record="item" :name="title(item)" :scope="route.fullPath+kind+city+term"/><p class="service-muted">{{kinds[kind]}} · {{item.city||item.data?.city||item.notice?.city||''}}</p><h2>{{title(item)}}</h2><p v-if="matching||recommended">{{recommended?'排序依据':'符合原因'}}：{{(reasons[item.listing_id||item.id]||[]).map(r=>discoveryReasons[r]).join('、')}}</p><p class="service-text">{{text(item)}}</p><p v-if="kind==='AUDITION'">{{item.unit_minor===null?'价格未公开':Number.isSafeInteger(item.unit_minor)?'¥'+(item.unit_minor/100).toFixed(2):'进入方案查看具体费用'}}</p><RouterLink class="button-link outline" :to="publicLink(kind,item.listing_id||item.id)">{{matching?'核对详情并继续办理':'查看当前详情'}}</RouterLink></article></div><p v-if="empty" class="supply-empty">没有找到当前可公开的结果。</p><p v-if="!items.length&&cursor" role="status">本页没有匹配内容，后面还有待查询的记录。</p><button v-if="cursor" class="outline" :disabled="loading" @click="load(true)">{{items.length?'加载更多':'继续查找'}}</button><button v-if="error" class="outline" :disabled="loading" @click="load()">保留条件重新查找</button></section></ServiceWorkspace></template>
