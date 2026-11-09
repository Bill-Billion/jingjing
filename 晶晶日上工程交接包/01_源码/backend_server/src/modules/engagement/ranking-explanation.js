"use strict";
const {error}=require('../party/policy'),P=require('./policy');
const VERSION='ENGAGEMENT_SCORING_V1';
function explain(snapshot){
 const saved=snapshot.data.rule_snapshot;
 if(!saved||saved.id!==snapshot.parent_id||saved.kind!=='RULE'||saved.current_status!=='EFFECTIVE'||!Number.isSafeInteger(saved.object_version)||saved.object_version<1)throw error('STORED_CONTENT_MISMATCH',503);
 let rule;try{rule=P.rules(saved.data.rule);}catch{throw error('STORED_CONTENT_MISMATCH',503);}
 const v=snapshot.data.calculation_version;
 if(v!==undefined&&v!==VERSION)throw error('RANKING_CALCULATION_VERSION_UNSUPPORTED',503);
 return {snapshot_id:snapshot.id,rule_id:saved.id,rule_version:rule.version,rule_object_version:saved.object_version,
  contract_policy:rule.ranking_contract_policy||'LEGACY_UNMARKED',calculation_version:v||'LEGACY_UNVERSIONED',
  formula_scope:v?'RECORDED_VERSION':'CURRENT_FORMULA_REFERENCE_ONLY',personalized:false,paid_advertising:false,
  rank_parameters:structuredClone(rule.rank),growth_parameters:{gp:structuredClone(rule.gp),thresholds:[...rule.thresholds],retention_days:rule.retention_days,retention_bps:rule.retention_bps},
  components:['NET_SALES','BAYESIAN_REVIEWS','REPEAT_BUYERS','VALID_ACTIVITY','COMPLIANCE'].map((key,i)=>({key,weight_bps:rule.rank.weights[i]})),
  formulas:{sales:'成交榜按统计期有效净成交金额排序；冷启动天数内不入成交榜。',reviews:'好评榜按(先验样本数×先验均分＋有效评分总和)/(先验样本数＋评价数)排序；须满足最少评价数。',repeat:'复购榜按复购买家数/有效买家数排序；须满足最少买家数。',popularity:'人气榜按有效浏览1分、试听3分、收藏5分累计；同日同账号或同安装标识去重，设备真实性另核。',levels:'等级榜按累计成长值排序；成交基础值、五星/带图/复购奖励及退款扣分按本规则，最低为0。',newcomers:'新秀榜限定注册天数，按成交归一分40%＋评价分40%＋活跃归一分20%排序。',composite:'成交和活跃按本次合格候选最大值归一为100分；好评分/5×100，复购率×100，合规为max(0,100-处罚分)。五项按权重加总，再乘等级曝光系数。'},
  risk_policy:{first_penalty:rule.risk_first_penalty,penalty_days:30,exclude_at_risk_count:2},
  tie_break:'PERSON_ID_ASC',visibility:'RECHECK_CURRENT_AUTHORIZATION_WITHOUT_RESCORED_HISTORY',
  participation_control:'OWN_RANK_PROFILE_OPT_IN',eligibility:'ADULT_ACTIVE_ACCOUNT_L1_PLUS_PUBLIC_DISPLAY_CONSENT_AND_OPT_IN',
  limitations:['NOT_A_PROFESSIONAL_QUALIFICATION','NO_PRIVATE_ORDERS_OR_REVIEW_EVIDENCE','LEGACY_FORMULA_NOT_RETROACTIVELY_CERTIFIED']};
}
module.exports={VERSION,explain};
