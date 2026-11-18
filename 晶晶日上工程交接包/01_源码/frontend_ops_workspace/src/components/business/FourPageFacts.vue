<script setup lang="ts">
import {computed} from 'vue'
import {type BusinessData,rowData} from '@/api/modules/business'
import {lotteryReason} from '@/business/fourPages'
const props=defineProps<{record:BusinessData;domain:string;section:string}>()
const data=computed(()=>rowData(props.record)),notice=computed(()=>data.value.publication_notice as BusinessData|undefined)
const money=(x:unknown)=>x===null?'本人未另设上限':typeof x==='number'?`¥${(x/100).toFixed(2)}`:'需核对'
const obj=(v:unknown)=>(v||{}) as BusinessData
const date=(v:unknown)=>typeof v==='string'?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）':'待核对'
const statuses:Record<string,string>={DRAFT:'资料未齐',DIFFERENCES:'存在逐笔差异',READY:'比对一致，等待独立审核',REVIEWED:'本版已独立审核',RECHECK_REQUIRED:'新事实或凭证变化，须重新核对'}
</script>
<template>
 <section v-if="domain==='consumer'&&record.limits" data-testid="consumer-facts"><p>统计月份：{{obj(record.period).month}}（北京时间）；截至 {{date(record.as_of)}}。占用包含待确认，不能当作已花掉的现金。</p><article v-for="k in ['PAYMENT','RECHARGE']" :key="k" class="business-availability"><h3>{{k==='PAYMENT'?'本人现金消费':'本人充值'}}</h3><p>当前上限 {{money(obj(record.limits)[k])}}；已占用 {{money(obj(obj(record.usage)[k]).used_minor)}}；其中待确认 {{money(obj(obj(record.usage)[k]).pending_minor)}}；剩余 {{money(obj(obj(record.usage)[k]).remaining_minor)}}</p><p v-if="obj(obj(record.usage)[k]).over_limit">当前占用已超过降低后的上限，剩余为0；已有回执和退款仍按真实结果处理。</p><p v-if="obj(record.pending)[k]">申请调整为 {{money(obj(obj(record.pending)[k]).monthly_limit_minor)}}；本人最早可确认：{{date(obj(obj(record.pending)[k]).confirm_after)}}。到期不会自动提高。</p><p v-else>本类别没有待生效申请。</p></article></section>
 <section v-if="domain==='daily-finance'&&record.current_status" data-testid="daily-finance-facts"><h3>{{statuses[String(record.effective_status||record.current_status)]||'结论待核对'}}</h3><p v-if="record.sources_current===false||record.evidence_current===false" class="supply-warning">历史审核记录保留，但当前事实或凭证已经变化，不能沿用旧审核结论。</p><p v-if="data.scope">{{obj(data.scope).business_date}} · {{obj(data.scope).provider}} / {{obj(data.scope).environment}} · {{obj(data.scope).merchant_id}}</p><p>这是账目比对，不代表发起或完成了任何转账。</p><RouterLink :to="`/daily-finance/facts?reportId=${record.id}`" class="button-link outline">查看同轮平台事实</RouterLink> <RouterLink :to="`/daily-finance/history?reportId=${record.id}`" class="button-link outline">查看不可变审核历史</RouterLink></section>
 <section v-if="domain==='redemption'&&notice" class="supply-warning" data-testid="lottery-publication"><h3>本版奖池公示</h3><p>公示：{{date(notice.published_at)}}；公示结束后最早开放：{{date(notice.opens_at)}}。仍需满足活动开始、结束、资格和库存条件。</p><p>{{lotteryReason(record)||'公示期已届满，提交时再次核对当前资格与库存。'}}</p></section>
</template>
