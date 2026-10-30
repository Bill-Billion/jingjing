"use strict";
const { createHash } = require('node:crypto');
const { error } = require('../party/policy');
const sha = value => createHash('sha256').update(value).digest('hex');
function createStockPublicMedia({ repository, storage, authorizeRead, env = {}, processor = require('../media/video-preview').describeVideo }) {
  // Small process-local cache; no public URL or persistent copy. Authorization and
  // byte integrity are rechecked even on a hit, including after slow processing.
  const cache = new Map(), pending = new Map();
  let active = 0;
  const fingerprint = files => JSON.stringify([files.listing_id, files.listing_version, files.full.id, files.full.content_sha256, files.preview.id, files.preview.content_sha256]);
  async function read(file) {
    if (!Number.isInteger(file.byte_size) || file.byte_size < 1 || file.byte_size > 50 * 1024 * 1024) throw error('MEDIA_INPUT_INVALID', 400);
    const bytes = await authorizeRead(file.object_key, context => storage.getBuffer(file.object_key, context));
    if (!Buffer.isBuffer(bytes) || bytes.length !== file.byte_size || sha(bytes) !== file.content_sha256) throw error('PRIVATE_CONTENT_MISMATCH', 503);
    return bytes;
  }
  return { async get(ctx, input) {
    if (active >= 2) throw error('MEDIA_PROCESS_BUSY', 503);
    active++;
    try {
      const files = await repository.catalogMediaSources(ctx, input), identity = fingerprint(files);
      const full = await read(files.full), preview = await read(files.preview);
      let result = cache.get(identity);
      if (!result || result.expires <= Date.now()) {
        cache.delete(identity);
        let processing = pending.get(identity);
        if (!processing) {
          processing = processor(full, preview, { ffmpeg: env.MEDIA_FFMPEG, ffprobe: env.MEDIA_FFPROBE });
          pending.set(identity, processing);
        }
        try {
          const output = await processing;
          if (!Buffer.isBuffer(output.body) || output.body.length >= 2 * 1024 * 1024 || output.metadata.source_sha256 !== files.full.content_sha256 || output.metadata.preview_sha256 !== files.preview.content_sha256 || output.metadata.cover.content_sha256 !== sha(output.body)) throw error('MEDIA_OUTPUT_NOT_VERIFIED', 503);
          result = { ...output, expires: Date.now() + 300000 };
          cache.set(identity, result);
          while (cache.size > 16) cache.delete(cache.keys().next().value);
        } finally { if (pending.get(identity) === processing) pending.delete(identity); }
      }
      if (fingerprint(await repository.catalogMediaSources(ctx, input)) !== identity) throw error('MEDIA_SOURCE_CHANGED', 409);
      return { body: result.body, metadata: { listing_id: files.listing_id, listing_version: files.listing_version, ...result.metadata } };
    } finally { active--; }
  } };
}
module.exports = { createStockPublicMedia };
