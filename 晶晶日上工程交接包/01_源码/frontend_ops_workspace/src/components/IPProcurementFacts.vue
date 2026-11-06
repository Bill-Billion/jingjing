<script setup lang="ts">
import type {Procurement} from '@/api/modules/procurement'
import {procurementAssets} from '@/api/modules/procurement'
defineProps<{procurement:Procurement;busy?:boolean}>()
defineEmits<{download:[string]}>()
</script>
<template><section class="supply-card" data-testid="ip-procurement-facts"><h2>{{procurement.mode==='BUYOUT'?'本合同 IP 买断':'本合同 IP 分红采购'}}</h2><p>{{procurement.mode==='BUYOUT'?'本份合同价款人民币50,000元，分红0%，永久全球独家；须核实全额款项及双方签署才生效。':'前置0元，约定净收益8%；5个日历年授权、2年开发期，无项目和集数上限。零前置不是免费买断。'}}</p><p>指定平台采购方：{{procurement.buyer_party_id}}</p><p>署名：{{procurement.attribution_terms}}</p><p>合同允许转许可；下游授权仍须另行建立和审核。出镜人的人格权另行取得。</p><template v-if="procurement.settlement_annex"><h3>原结算附件</h3><p>周期：{{({MONTHLY:'每月',QUARTERLY:'每季度',ANNUAL:'每年',AGREED:'按附件约定'})[procurement.settlement_annex.cycle]}}</p><p>{{procurement.settlement_annex.terms_text}}</p><p>净收益按全部发行及衍生收入，减平台佣金、税费、发行成本和制作成本核对；累计应计、此次调整与实际转账分开。</p></template><h3>分类权属及结算依据</h3><p>{{procurement.rights_evidence.has_coauthors?'存在共同作者，须逐项核对同意':'已申明没有共同作者，仍须核查原始权属'}}</p><div v-for="id in procurementAssets(procurement)" :key="id"><span class="identifier">{{id}}</span><button class="outline" :disabled="busy" @click="$emit('download',id)">受控读取本份采购依据</button></div><p>上传完成不等于审核通过；原始存储地址不公开。</p></section></template>
