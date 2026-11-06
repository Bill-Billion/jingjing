<script setup lang="ts">
import type { StockEligibility } from '@/api/modules/stockEligibility'
import type { ApiError } from '@/api/client'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'
defineProps<{people:Array<{id:string;label:string}>;entries:Record<string,StockEligibility>;errors:Record<string,ApiError>;busy:boolean;ready:boolean;disabled:boolean}>()
defineEmits<{read:[]}>()
</script>
<template>
<section class="business-availability" data-testid="stock-eligibility">
  <h4>逐人核对上架资格</h4>
  <p>卖方和每位出镜人都须具备有效实名、L1及主角光环人工审核。缴费、待审或补件不等于通过；提交时重新核验，内容、媒体及授权仍须独立审核。</p>
  <p v-if="!people.length">请先选择卖方具体真人，再选择本次出镜人物。</p>
  <div v-for="person in people" :key="person.id">
    <strong>{{person.label}}</strong>
    <template v-if="entries[person.id]">
      <p>实名认证：{{entries[person.id]!.identity_verified?'已满足':'未满足'}}；L1记录：{{entries[person.id]!.l1_verified?'已满足':'未满足'}}；主角光环人工审核：{{entries[person.id]!.manual_review_approved?'已满足':'未满足'}}</p>
    </template>
    <ApiErrorAlert v-else-if="errors[person.id]" :error="errors[person.id]!"/>
    <p v-else>尚未核对本人的当前资格。</p>
  </div>
  <p v-if="!ready">资格未完整核对或有缺项，暂不能提交新上架；原购买按原订单办理。</p>
  <button type="button" :disabled="busy||disabled||!people.length" @click="$emit('read')">{{busy?'正在逐人核对…':'重新核对上架资格'}}</button>
  <RouterLink to="/artists/people">查看人物与认证</RouterLink>
</section>
</template>
