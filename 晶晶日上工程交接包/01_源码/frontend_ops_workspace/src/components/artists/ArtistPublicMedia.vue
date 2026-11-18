<script setup lang="ts">
import { computed } from 'vue'
import { artistMediaTypes,type ArtistPublicMedia } from '@/api/modules/artists'
const props=defineProps<{media:ArtistPublicMedia;portrait:{url:string;assetId:string}|null;name:string;disabled:boolean}>()
defineEmits<{preview:[assetId:string];reload:[];portraitFailed:[]}>()
const labels={IMAGE:'图片',AUDIO:'声音',VIDEO:'视频',DOCUMENT:'文档'} as const
const groups=computed(()=>Object.entries(labels).map(([kind,label])=>({kind,label,items:props.media.items.filter(item=>item.media_kind===kind)})))
const size=(bytes:number)=>bytes<1024?bytes+' B':bytes<1024*1024?(bytes/1024).toFixed(1)+' KB':(bytes/1024/1024).toFixed(1)+' MB'
</script>
<template>
 <div class="artist-public-media" data-testid="artists-public-media">
  <figure class="artist-public-portrait">
   <img v-if="portrait&&portrait.assetId===media.primary_portrait_asset_id" :src="portrait.url" :alt="name+'已获准的主肖像'" @error="$emit('portraitFailed')">
   <div v-else class="artist-portrait-placeholder" data-testid="artists-portrait-placeholder" role="status">{{media.primary_portrait_asset_id?'主肖像暂无法显示，请重新读取。':'本次公开资料未设置主肖像'}}</div>
   <figcaption>主肖像</figcaption>
   <button v-if="media.primary_portrait_asset_id" class="outline" type="button" :disabled="disabled" @click="$emit('reload')">重新读取主肖像与公开资料</button>
  </figure>
  <div class="artist-media-groups">
   <section v-for="group in groups" :key="group.kind" :data-testid="'artists-media-'+group.kind">
    <h3>{{group.label}} <span class="muted">{{group.items.length}} 份</span></h3>
    <p v-if="!group.items.length" class="muted">本次未公开{{group.label}}。</p>
    <div v-for="(asset,index) in group.items" :key="asset.asset_id" class="artist-media-row">
     <div><strong>{{group.label}} {{index+1}}</strong><span v-if="asset.asset_id===media.primary_portrait_asset_id"> · 主肖像</span><p class="muted">{{artistMediaTypes[asset.media_type]}} · {{size(asset.byte_size)}}</p><small class="identifier">{{asset.asset_id}}</small></div>
     <button class="outline" type="button" :disabled="disabled" :data-testid="'artists-catalog-preview-'+asset.asset_id" @click="$emit('preview',asset.asset_id)">{{group.kind==='DOCUMENT'?'读取后保存文档':group.kind==='AUDIO'?'读取并播放声音':group.kind==='VIDEO'?'读取并播放视频':'读取图片'}}</button>
    </div>
   </section>
  </div>
 </div>
</template>
