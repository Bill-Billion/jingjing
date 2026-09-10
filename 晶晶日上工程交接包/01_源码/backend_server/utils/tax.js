// utils/tax.js - 个人所得税计算（劳务报酬所得）
// 单位：分（整数）
const config = require('../config');

/**
 * 计算劳务报酬所得应预扣预缴税额
 * @param {number} incomeFen - 每次收入（分）
 * @returns {{taxableIncome: number, tax: number, afterTax: number}}
 *
 * 规则：
 * - 每次收入≤4000元：应纳税所得额 = 收入 - 800元
 * - 每次收入>4000元：应纳税所得额 = 收入 × (1-20%)
 * - 应纳税额 = 应纳税所得额 × 税率 - 速算扣除数
 *   - ≤2万：20%，扣除0
 *   - 2万-5万：30%，扣除2000
 *   - >5万：40%，扣除7000
 */
function calcLaborServiceTax(incomeFen) {
  if (!incomeFen || incomeFen <= 0) {
    return { taxableIncome: 0, tax: 0, afterTax: 0 };
  }

  const cfg = config.tax;
  let taxableIncome;

  if (incomeFen <= 400000) {
    // ≤4000元，减800元
    taxableIncome = Math.max(0, incomeFen - cfg.deductionPerTime);
  } else {
    // >4000元，减20%
    taxableIncome = Math.floor(incomeFen * (1 - cfg.deductionRate));
  }

  if (taxableIncome <= 0) {
    return { taxableIncome: 0, tax: 0, afterTax: incomeFen };
  }

  // 三级累进
  let tax = 0;
  for (const bracket of cfg.brackets) {
    if (taxableIncome <= bracket.maxTaxableIncome) {
      tax = Math.floor(taxableIncome * bracket.rate) - bracket.deduction;
      break;
    }
  }

  tax = Math.max(0, tax);
  return {
    taxableIncome,
    tax,
    afterTax: incomeFen - tax,
  };
}

/**
 * 计算艺人订单实际到手金额
 * 1. 订单金额扣除AI成本（由艺人承担）
 * 2. 扣除平台服务费
 * 3. 扣除支付通道费
 * 4. 扣除个税
 */
function calcTalentPayout(orderAmountFen, businessType) {
  const aiCost = businessType === 'endorsement'
    ? config.aiCost.endorsement
    : config.aiCost.video;

  // 平台服务费费率
  let commissionRate;
  if (businessType === 'endorsement') {
    commissionRate = config.commission.endorsement;
  } else if (orderAmountFen <= config.videoPricing.minPrice) {
    commissionRate = config.commission.videoBasic; // 99元档0%
  } else {
    commissionRate = config.commission.videoStandard;
  }

  // 1. 扣除AI成本
  const afterAiCost = orderAmountFen - aiCost;

  // 2. 扣除平台服务费
  const platformFee = Math.floor(afterAiCost * commissionRate);
  const afterCommission = afterAiCost - platformFee;

  // 3. 扣除支付通道费（0.6%）
  const channelFee = Math.floor(orderAmountFen * config.commission.withdrawal);
  const afterChannel = afterCommission - channelFee;

  // 4. 个税计算（以扣除AI成本和平台费后的金额为收入额）
  const { tax, afterTax } = calcLaborServiceTax(Math.max(0, afterChannel));

  return {
    orderAmount: orderAmountFen,
    aiCost,
    platformFee,
    channelFee,
    tax,
    talentIncome: afterTax,
    platformRevenue: platformFee,
  };
}

module.exports = { calcLaborServiceTax, calcTalentPayout };
