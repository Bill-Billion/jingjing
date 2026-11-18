import type {BusinessData} from '@/api/modules/business'
import {uuid} from './model'

type Score = {candidate:number;votes:number;total:number}
export type ChampionSummary = {winner:number;at:string;scores:Score[]}
const object=(value:unknown):value is BusinessData=>!!value&&typeof value==='object'&&!Array.isArray(value)

// A result is displayed only when it is final and agrees with this event's approved candidates.
export function championSummary(record:BusinessData):ChampionSummary|null{
 if(record.status!=='FINALIZED'||!Array.isArray(record.candidates)||!object(record.result))return null
 const candidates=record.candidates,result=record.result
 if(!candidates.length||candidates.length>500||!candidates.every(c=>object(c)&&uuid(c.id)&&uuid(c.person_id)))return null
 if(new Set(candidates.map(c=>c.id)).size!==candidates.length||new Set(candidates.map(c=>c.person_id)).size!==candidates.length)return null
 if(!uuid(result.winner_person_id)||typeof result.at!=='string'||!Number.isFinite(Date.parse(result.at))||!Array.isArray(result.scores)||result.scores.length!==candidates.length)return null
 const winner=candidates.findIndex(c=>c.person_id===result.winner_person_id)
 if(winner<0)return null
 const seen=new Set<number>(),scores:Score[]=[]
 for(const score of result.scores){
  if(!object(score)||!uuid(score.candidate_id)||!uuid(score.person_id)||!Number.isSafeInteger(score.votes)||Number(score.votes)<0||typeof score.total!=='number'||!Number.isFinite(score.total)||score.total<0)return null
  const index=candidates.findIndex(c=>c.id===score.candidate_id&&c.person_id===score.person_id)
  if(index<0||seen.has(index))return null
  seen.add(index);scores.push({candidate:index+1,votes:Number(score.votes),total:score.total})
 }
 return {winner:winner+1,at:result.at,scores}
}

export function championState(record:BusinessData):string|null{
 return record.status==='FINALIZED'?'结果已核定':record.status==='PUBLISHED'?'活动已发布':null
}
