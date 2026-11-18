<script setup lang="ts">
import { commercialUses } from '@/api/modules/rights'
import type { StockLicense } from '@/api/modules/trade'
defineProps<{license:StockLicense}>()
</script>
<template><section class="supply-card" data-testid="stock-license-facts"><h3>{{license.scope==='COMMERCIAL_LIMITED'?'独立商用许可':'个人非商用许可'}}</h3><template v-if="license.scope==='COMMERCIAL_LIMITED'"><p>获准用途：{{license.commercial_uses.map(x=>commercialUses[x]).join('、')}}</p><p>地域：{{license.territory}} · 非独家，仅限本单买受人</p><p>有效期：{{license.valid_from}} 至 {{license.valid_until}}（UTC）</p><p>不包含转售、再许可、改编、发行、声音单独使用、重新生成、模型源文件或版权买断；商业广告仅在获准用途明确列出时允许。</p></template><p v-else>非独家 · 全球 · 永久 · 本人收藏与个人社交分享 · 非商用。广告、改编、发行、训练、声音单独使用和买断均不包含。</p><p>{{license.acceptance_policy==='CONTRACT_20261029'?'本单从下单时起核对验收期限；未付、未交付或争议时不得自动结算':'本单按明确收讫后的验收期限'}}：{{license.acceptance_hours}} 小时</p><p>{{license.aftercare_terms}}</p><p>原订单保留购买时约定；付款、许可生效和允许下载分别核对，停止新售不会改写历史许可。</p></section></template>
