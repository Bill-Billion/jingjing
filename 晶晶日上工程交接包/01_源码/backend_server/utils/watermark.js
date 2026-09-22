// No file processing or verification exists yet; configuration cannot enable a stub.
async function embedBlindWatermark() {
  return { success: false, watermarkId: null, status: 'not_enabled', code: 'WATERMARK_NOT_IMPLEMENTED' };
}
async function verifyBlindWatermark() {
  return { verified: false, status: 'not_enabled', code: 'WATERMARK_NOT_IMPLEMENTED' };
}
function rejectUnmarkedDelivery(req, res) {
  return res.status(503).json({
    code: 'WATERMARK_NOT_IMPLEMENTED', status: 'not_enabled', delivered: false,
    message: '交付文件的标识处理尚未启用，本次未交付',
  });
}
module.exports = { embedBlindWatermark, verifyBlindWatermark, rejectUnmarkedDelivery };
