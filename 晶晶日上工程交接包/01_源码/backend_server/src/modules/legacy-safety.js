'use strict';
// Legacy routes have no verified provider/evidence binding. Environment flags cannot enable them.
function paymentUnavailable() {
  return Object.assign(new Error('支付服务尚未启用，不能确认付款或退款成功。'), {code:'PAYMENT_NOT_READY',status:503});
}
function rejectLegacyPayment(req,res) {
  return res.status(503).json({code:'PAYMENT_NOT_READY',status:'not_enabled',paid:false,demo:false,message:paymentUnavailable().message});
}
function rejectLegacyCallback(req,res) {
  return res.status(503).type('text/plain').send('fail');
}
function rejectLegacyIdentity(req,res) {
  return res.status(503).json({code:'IDENTITY_NOT_READY',status:'pending',verified:false,submitted:false,message:'实名服务尚未启用，本次未保存或提交证件，不能认定实名通过。'});
}
function assessLegacyIdentity(identity) {
  if (!identity) return {verified:false,status:'none',recordedStatus:null,verificationStatus:'not_submitted'};
  // The old schema never stored verifiedBy/evidence. Do not invent provenance or alter the old row.
  const status=identity.status === 'rejected' ? 'rejected' : 'pending';
  return {verified:false,status,recordedStatus:identity.status,verificationStatus:'legacy_unverified'};
}
function assessLegacyPayment(status) {
  return {status:'unverified',recordedStatus:status,paid:false,paymentVerified:false,verificationStatus:'legacy_unverified'};
}
module.exports={paymentUnavailable,rejectLegacyPayment,rejectLegacyCallback,rejectLegacyIdentity,assessLegacyIdentity,assessLegacyPayment};
