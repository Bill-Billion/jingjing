<script setup lang="ts">
import { artistServiceKinds, type ArtistServiceTerms } from '@/api/modules/trade'
defineProps<{service:ArtistServiceTerms}>()
const units={PERSON_FIRST:'按该真人首次创建',AVATAR_MONTH:'按指定数字人月数',HALO_APPLICATION:'按本次认证申请'}
</script>
<template><div><dt>数字人服务</dt><dd>{{artistServiceKinds[service.kind]}} · {{units[service.unit]}}</dd></div><div v-if="service.hosting_months!==null"><dt>约定托管期限</dt><dd>{{service.hosting_months}} 个月；首次核实收款后起算，续期接已有期限，以服务记录为准</dd></div><div v-if="service.halo_level!==null"><dt>审核等级</dt><dd>L{{service.halo_level}}；付费不等于审核通过</dd></div><div v-if="service.kind==='AVATAR_CREATION'"><dt>约定重试次数</dt><dd>{{service.retry_limit}} 次；交付档案不代表长期模型训练成功</dd></div><div><dt>失败处理</dt><dd>未交付部分按原订单办理退款；待退款与到账分别核对</dd></div><div><dt>服务规则版本与来源</dt><dd class="identifier">{{service.rule_version}} · {{service.source_ref}}</dd></div></template>
