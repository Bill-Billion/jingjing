import { ApiError, request, type ApiResult } from '../client'
import { validSupplyId, type SupplyIdentity } from './supply'
export interface AgencyArtist {listing_id:string;person_id:string;avatar_id:string;artist_party_id:string;display_name:string;city:string}
export interface AgencyRelation {id:string;organization_party_id:string;display_name:string;valid_from:string;valid_until:string}
export interface AgencyEvidence {id:string;purpose:'CONSENT_EVIDENCE';media_type:string;byte_size:number;content_sha256:string}
const bad=()=>new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'合作资料无法核实，请重新读取。'})
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export async function agencyOptions(i:SupplyIdentity,kind:'ARTIST',person?:string,signal?:AbortSignal):Promise<AgencyArtist[]>
export async function agencyOptions(i:SupplyIdentity,kind:'RELATION',person:string,signal?:AbortSignal):Promise<AgencyRelation[]>
export async function agencyOptions(i:SupplyIdentity,kind:'EVIDENCE',person:string,signal?:AbortSignal):Promise<AgencyEvidence[]>
export async function agencyOptions(i:SupplyIdentity,kind:'ARTIST'|'RELATION'|'EVIDENCE',person?:string,signal?:AbortSignal):Promise<unknown[]>{
 if(!i.partyId||kind!=='ARTIST'&&!validSupplyId(person))throw bad()
 const out:unknown[]=[],seen=new Set<string>(),ids=new Set<string>();let cursor:string|null=null
 do{const q=new URLSearchParams({limit:'20'});if(cursor)q.set('cursor',cursor);if(kind!=='ARTIST')q.set('kind',kind)
  const path:string=kind==='ARTIST'?'/gigs/relation-options':`/artists/people/${person}/delegation-options`;const r:ApiResult<unknown>=await request<unknown>(path+'?'+q,{token:i.token,actingParty:i.partyId,signal,cache:'no-store'});const d:unknown=r.data
  if(r.meta.actor?.account_id!==i.accountId||r.meta.acting_party!==i.partyId||!object(d)||!Array.isArray(d.items)||kind==='ARTIST'&&d.party_id!==i.partyId||kind!=='ARTIST'&&(d.person_id!==person||d.kind!==kind)||!(d.next_cursor===null||validSupplyId(d.next_cursor)))throw bad()
  for(const row of d.items){if(!object(row))throw bad();const key=kind==='ARTIST'?row.listing_id:row.id;if(!validSupplyId(key)||ids.has(key as string))throw bad();ids.add(key as string)
   if(kind==='ARTIST'&&(!['person_id','avatar_id','artist_party_id'].every(k=>validSupplyId(row[k]))||typeof row.display_name!=='string'||typeof row.city!=='string'))throw bad()
   if(kind==='RELATION'&&(!validSupplyId(row.organization_party_id)||typeof row.display_name!=='string'||!['valid_from','valid_until'].every(k=>typeof row[k]==='string'&&Number.isFinite(Date.parse(row[k] as string)))))throw bad()
   if(kind==='EVIDENCE'&&(row.purpose!=='CONSENT_EVIDENCE'||typeof row.media_type!=='string'||!Number.isSafeInteger(row.byte_size)||Number(row.byte_size)<0||typeof row.content_sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.content_sha256)))throw bad()
   out.push(row)
  }cursor=d.next_cursor as string|null;if(cursor){if(seen.has(cursor))throw bad();seen.add(cursor)}
 }while(cursor)
 return out
}
