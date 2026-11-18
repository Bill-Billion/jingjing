"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createStockPublicMedia } = require('../src/modules/stock/public-media');
const { describeVideo, videoInfo } = require('../src/modules/media/video-preview');
const sha = b => createHash('sha256').update(b).digest('hex');
function setup() {
  const full = Buffer.from('private full'), preview = Buffer.from('public preview');
  let allowed = true, corrupt = false, calls = 0, reads = 0, afterRead = null, release = null;
  const files = { listing_id: 'listing', listing_version: 3,
    full: { id: 'full', object_key: 'full', byte_size: full.length, content_sha256: sha(full) },
    preview: { id: 'preview', object_key: 'preview', byte_size: preview.length, content_sha256: sha(preview) } };
  const service = createStockPublicMedia({
    repository: { async catalogMediaSources() { if (!allowed) throw Object.assign(Error('withdrawn'), { code: 'STOCK_NOT_LISTED' }); return files; } },
    storage: { async getBuffer(key) { reads++; if (afterRead) { const hook = afterRead; afterRead = null; hook(); } return corrupt ? Buffer.from('corrupt') : key === 'full' ? full : preview; } },
    authorizeRead: async (key, read) => read({}),
    processor: async () => { calls++; if (release) await release; const body = Buffer.from('synthetic cover'); return { body, metadata: { source_sha256: sha(full), preview_sha256: sha(preview), cover: { content_sha256: sha(body) } } }; },
  });
  return { service, files, allow: v => { allowed = v; }, corrupt: () => { corrupt = true; }, afterRead: f => { afterRead = f; }, wait: p => { release = p; }, calls: () => calls, reads: () => reads };
}
test('preview cache still rechecks current permission and storage bytes', async () => {
  const f = setup(); await f.service.get({}, {}); await f.service.get({}, {});
  assert.equal(f.calls(), 1); assert.equal(f.reads(), 4);
  f.corrupt(); await assert.rejects(f.service.get({}, {}), { code: 'PRIVATE_CONTENT_MISMATCH' });
  f.allow(false); await assert.rejects(f.service.get({}, {}), { code: 'STOCK_NOT_LISTED' });
});
test('withdrawal during storage access blocks a newly generated cover', async () => {
  const f = setup(); f.afterRead(() => f.allow(false));
  await assert.rejects(f.service.get({}, {}), { code: 'STOCK_NOT_LISTED' });
});
test('same source shares processing and concurrent request count is bounded', async () => {
  const f = setup(); let finish; f.wait(new Promise(r => { finish = r; }));
  const a = f.service.get({}, {}), b = f.service.get({}, {});
  await assert.rejects(f.service.get({}, {}), { code: 'MEDIA_PROCESS_BUSY' });
  finish(); await Promise.all([a, b]); assert.equal(f.calls(), 1);
  f.allow(false); await assert.rejects(f.service.get({}, {}), { code: 'STOCK_NOT_LISTED' });
});
test('changed listing version cannot reuse a previous rendering', async () => {
  const f = setup(); await f.service.get({}, {}); f.files.listing_version++; await f.service.get({}, {}); assert.equal(f.calls(), 2);
});
test('invalid video claims do not create duration or image metadata', () => {
  const valid = { streams: [{ codec_type: 'video', width: 320, height: 180 }], format: { format_name: 'mov,mp4', duration: '1.25' } };
  assert.equal(videoInfo(valid).duration_ms, 1250);
  for (const invalid of [ { ...valid, streams: [] }, { ...valid, streams: [...valid.streams, { codec_type: 'attachment' }] }, { ...valid, format: { ...valid.format, duration: 'NaN' } }, { ...valid, format: { ...valid.format, duration: '1801' } } ]) assert.throws(() => videoInfo(invalid), { code: 'MEDIA_FORMAT_UNSUPPORTED' });
});
test('missing tools cannot return fabricated cover or duration', async () => {
  await assert.rejects(describeVideo(Buffer.from('full'), Buffer.from('preview')), { code: 'MEDIA_PROCESS_NOT_CONFIGURED' });
});

test('thumbnail dimensions preserve non-square pixels and quarter-turn orientation', () => {
  const info = { streams: [{ codec_type: 'video', width: 320, height: 180, sample_aspect_ratio: '2:1' }], format: { format_name: 'mov,mp4', duration: '1' } };
  const landscape = videoInfo(info); assert.equal(landscape.cover_width,640);assert.equal(landscape.cover_height,180);
  info.streams[0].side_data_list = [{ rotation: 90 }];
  const portrait = videoInfo(info); assert.equal(portrait.cover_width,180);assert.equal(portrait.cover_height,640);
});
