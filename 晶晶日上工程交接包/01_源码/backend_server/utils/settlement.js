// utils/settlement.js - 结算与费用计算（V3，金额单位：分）
const config = require('../config');
const { calcLaborServiceTax } = require('./tax');

function calculateFees(amountFen, identityType = 'personal', aiCostFen = 0, platformRate = config.commission.platform) {
  if (!Number.isInteger(amountFen) || amountFen <= 0) {
    throw new Error('金额必须为正整数（分）');
  }
  const platformFee = Math.floor(amountFen * platformRate);
  const aiCost = aiCostFen;
  // 支付通道费0.6%
  const channelFee = Math.floor(amountFen * config.commission.withdrawal);

  let taxRate = 0, taxAmount = 0;
  if (identityType === 'personal' && config.tax.mode === 'withholding') {
    // 劳务报酬个税：以扣除平台费和AI成本后的金额为收入额
    const talentGross = Math.max(0, amountFen - platformFee - aiCost - channelFee);
    const taxResult = calcLaborServiceTax(talentGross);
    taxAmount = taxResult.tax;
    taxRate = talentGross > 0 ? taxAmount / talentGross : 0;
  }
  const netAmount = amountFen - platformFee - aiCost - channelFee - taxAmount;
  if (netAmount < 0) throw new Error('费用计算异常：到手金额为负');
  return { amount: amountFen, platformFee, aiCost, channelFee, taxRate, taxAmount, netAmount, identityType };
}

// MCN管理服务费模型（V10.1统一口径，以 config.mcn 为准）：
// 免管理费期（入驻前N天）MCN不抽成，艺人得100%；之后MCN按 managementFeeRate 抽取管理服务费，艺人得剩余。
// 入参 opts: { freeTrial: 是否免管理费期, managementFeeRate: 管理费率 }
function splitMcn(netAmountFen, opts = {}) {
  const freeTrial = !!opts.freeTrial;
  const rate = (typeof opts.managementFeeRate === 'number')
    ? opts.managementFeeRate
    : config.mcn.managementFeeRate;
  const mcnAmount = freeTrial ? 0 : Math.floor(netAmountFen * rate);
  const talentAmount = netAmountFen - mcnAmount;
  return { talentAmount, mcnAmount };
}

// 定制剧平台服务费（V10.1 去投资化命名：原 calculateCrowdfundingFee 废弃，保留别名兼容旧引用）
function calculateCustomizationFee(amountFen, rate = config.commission.customization) {
  return Math.floor(amountFen * rate);
}
const calculateCrowdfundingFee = calculateCustomizationFee;

function calculateWithdrawalFee(amountFen) {
  return Math.max(Math.floor(amountFen * config.commission.withdrawal), 0);
}

// 进程内自增序列，避免同毫秒并发下单订单号重复
let _seq = 0;
function nextSeq() {
  _seq = (_seq + 1) % 100000;
  return _seq;
}
function genOrderNo(prefix = 'JJ') {
  const now = new Date();
  const ymd = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  return `${prefix}${ymd}${Date.now()}${String(nextSeq()).padStart(5, '0')}`;
}
const genTxNo = () => 'TX' + Date.now() + String(nextSeq()).padStart(5, '0');
const genRefundNo = () => 'RF' + Date.now() + String(nextSeq()).padStart(5, '0');
const genWithdrawNo = () => 'WD' + Date.now() + String(nextSeq()).padStart(5, '0');

module.exports = {
  calculateFees, splitMcn, calculateCustomizationFee, calculateCrowdfundingFee,
  calculateWithdrawalFee, genOrderNo, genTxNo, genRefundNo, genWithdrawNo,
};
