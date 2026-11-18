import {onScopeDispose,ref,watch} from 'vue'
import {listArtistCatalog,type ArtistCatalogItem,type ArtistPage} from '@/api/modules/artists'
import type {SupplyIdentity} from '@/api/modules/supply'
import {uuid} from '@/business/model'

export interface ChampionNameContext {token:string|null;accountId:string;partyId:string;revision:number;eventId:string;city:string;personIds:string[];enabled:boolean;record:object|null}
type Loader=(identity:SupplyIdentity,filters:{city:string;tag:string;audition:string},cursor:string|null)=>Promise<ArtistPage<ArtistCatalogItem>>

// Only public catalog names can be used. A late response must not cross an event or session.
export function useChampionNames(context:()=>ChampionNameContext,loader:Loader=listArtistCatalog){
 const names=ref<Record<string,string>>({});let ticket=0,active=false,disposed=false
 const contextKey=()=>{const c=context();return JSON.stringify([c.token,c.accountId,c.partyId,c.revision,c.eventId,c.city,c.personIds,c.enabled])}
 function clear(){ticket++;names.value={}}
 async function load(){
  clear();const c=context(),key=contextKey(),mine=ticket
  if(!c.enabled||!c.token||!c.accountId||!uuid(c.eventId)||!c.city||!c.personIds.length||!c.personIds.every(uuid))return
  const current=()=>!disposed&&mine===ticket&&key===contextKey()&&c.record===context().record,wanted=new Set(c.personIds),found:Record<string,string>={},seen=new Set<string>();let cursor:string|null=null
  try{
   for(let page=0;page<50;page++){
    const result=await loader({token:c.token,accountId:c.accountId,partyId:null},{city:c.city,tag:'',audition:''},cursor)
    if(!current())return
    for(const item of result.items)if(item.city===c.city&&wanted.has(item.person_id)&&!found[item.person_id])found[item.person_id]=item.display_name
    if(Object.keys(found).length===wanted.size||!result.next_cursor)break
    if(result.next_cursor===cursor||seen.has(result.next_cursor))throw Error('catalog cursor did not advance')
    seen.add(result.next_cursor);cursor=result.next_cursor
   }
   if(current())names.value=found
  }catch{if(current())names.value={}}
 }
 function activate(){if(active||disposed)return;active=true;void load()}
 watch(()=>[contextKey(),context().record],()=>{clear();if(active)void load()},{flush:'sync'})
 onScopeDispose(()=>{disposed=true;clear()})
 return {names,load,activate,clear}
}
