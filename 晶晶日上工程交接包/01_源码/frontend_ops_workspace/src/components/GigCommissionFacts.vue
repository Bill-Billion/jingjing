<script setup lang="ts">
import type {CommissionTerms,MarketplaceTerms,SupplyShareTerms} from '@/api/modules/gigs'
defineProps<{commission:CommissionTerms;marketplace?:MarketplaceTerms;v5?:SupplyShareTerms}>()
</script>
<template><div data-testid="gig-commission-facts">
<template v-if="marketplace||v5"><dl class="supply-facts"><div><dt>商单平台费用</dt><dd>{{(marketplace?.platform_bps??2200)/100}}%</dd></div><div><dt>机构占供给收益</dt><dd>{{(marketplace?.mcn_supply_bps??v5!.supply_share_bps)/100}}%</dd></div></dl><p>先从成交净额计平台费用，剩余供给收益再由艺人与机构分配。机构比例不是成交额比例，也不从平台费用中划分。</p><p v-if="(marketplace?.mcn_supply_bps??v5?.supply_share_bps)===2000">100元且无退款时：平台22元，供给收益78元；机构15.60元，艺人62.40元。实际金额以原订单和财务记录为准。</p><p v-if="v5">须艺人本人明确接受本版比例；旧协议与历史订单保持原快照。</p></template>
<template v-else><dl class="supply-facts"><div><dt>平台费率</dt><dd>{{commission.platform_bps}} bps / {{commission.platform_bps/100}}%</dd></div><div><dt>MCN 费率（从平台费用中划分）</dt><dd>{{commission.mcn_bps}} bps / {{commission.mcn_bps/100}}%</dd></div></dl><p>本记录按历史约定计算，MCN 从平台费用中划分。</p></template></div></template>
