'use strict';

// A valid hash identifies bytes; it does not assert that required labels were embedded.
// Use this check for new output, upload recovery, and publication of historical output.
function completeMarkingReceipt(receipt, variant, byteSize) {
 return Boolean(receipt && ['preview', 'final'].includes(variant)
  && receipt.variant === variant
  && receipt.visual_ai_label === true
  && receipt.metadata_ai_label === true
  && receipt.commercial_watermark === (variant === 'preview')
  && Number.isSafeInteger(receipt.output_bytes) && receipt.output_bytes > 0
  && receipt.output_bytes === byteSize);
}

module.exports = { completeMarkingReceipt };
