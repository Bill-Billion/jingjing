import type {BusinessData} from '@/api/modules/business'
export function validateExplanation(d:BusinessData,id:string):void{
 if(d.snapshot_id!==id||!['RECORDED_VERSION','CURRENT_FORMULA_REFERENCE_ONLY'].includes(String(d.formula_scope))||d.personalized!==false||d.paid_advertising!==false||typeof d.rule_version!=='string'||d.formula_scope==='RECORDED_VERSION'&&d.calculation_version!=='ENGAGEMENT_SCORING_V1'||d.formula_scope==='CURRENT_FORMULA_REFERENCE_ONLY'&&d.calculation_version!=='LEGACY_UNVERSIONED'||!d.formulas||typeof d.formulas!=='object'||Array.isArray(d.formulas)||Object.values(d.formulas).some(v=>typeof v!=='string'))throw new Error('本期榜单说明未通过核对，请重新读取。')
}
export const boardNames:Record<string,string>={sales:'成交榜',reviews:'评价榜',repeat:'复购榜',popularity:'人气榜',levels:'等级榜',newcomers:'新人榜',composite:'综合榜'}
