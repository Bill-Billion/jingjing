"use strict";
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { run } = require('./marking');
const { error } = require('../party/policy');
const sha = value => createHash('sha256').update(value).digest('hex');
const inputOptions = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov', '-enable_drefs', '0'];
function videoInfo(info) {
  const videos = info.streams?.filter(x => x.codec_type === 'video') || [];
  const audio = info.streams?.filter(x => x.codec_type === 'audio') || [];
  const duration = Number(info.format?.duration);
  if (videos.length !== 1 || audio.length > 1 || videos.length + audio.length !== info.streams.length ||
      !info.format?.format_name?.split(',').includes('mp4') || !Number.isFinite(duration) || duration <= 0 || duration > 1800 ||
      !Number.isInteger(videos[0].width) || !Number.isInteger(videos[0].height) ||
      videos[0].width < 1 || videos[0].height < 1 || videos[0].width > 4096 || videos[0].height > 4096) {
    throw error('MEDIA_FORMAT_UNSUPPORTED', 409);
  }
  const video = videos[0], ratio = video.sample_aspect_ratio || '1:1';
  const parts = ratio.split(':').map(Number);
  const sar = ratio === '0:1' ? 1 : parts[0] / parts[1];
  const rotation = Number(video.side_data_list?.find(x => x.rotation !== undefined)?.rotation || 0);
  if (parts.length !== 2 || !Number.isFinite(sar) || sar <= 0 || !Number.isFinite(rotation) || Math.abs(rotation % 90) > 0.01) throw error('MEDIA_FORMAT_UNSUPPORTED', 409);
  let displayWidth = video.width * sar, displayHeight = video.height;
  if (Math.abs(rotation % 180) > 0.01) [displayWidth, displayHeight] = [displayHeight, displayWidth];
  if (displayWidth / displayHeight < 0.01 || displayWidth / displayHeight > 100) throw error('MEDIA_FORMAT_UNSUPPORTED', 409);
  const scale = Math.min(1, 640 / displayWidth, 640 / displayHeight);
  return { duration_ms: Math.max(1, Math.round(duration * 1000)), width: video.width, height: video.height,
    cover_width: Math.max(2, Math.floor(displayWidth * scale / 2) * 2), cover_height: Math.max(2, Math.floor(displayHeight * scale / 2) * 2) };

}
// Derive a cover only from the approved preview; full bytes are inspected for
// duration, never decoded into public images. No caller-provided path or filter.
async function describeVideo(full, preview, { ffmpeg, ffprobe } = {}) {
  for (const body of [full, preview]) if (!Buffer.isBuffer(body) || !body.length || body.length > 50 * 1024 * 1024) throw error('MEDIA_INPUT_INVALID', 400);
  for (const executable of [ffmpeg, ffprobe]) if (typeof executable !== 'string' || !path.isAbsolute(executable)) throw error('MEDIA_PROCESS_NOT_CONFIGURED', 503);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jx-video-preview-'));
  try {
    await fs.writeFile(path.join(dir, 'full.mp4'), full, { flag: 'wx' });
    await fs.writeFile(path.join(dir, 'preview.mp4'), preview, { flag: 'wx' });
    async function probe(file) {
      let data;
      try { data = JSON.parse((await run(ffprobe, ['-v', 'error', ...inputOptions, '-show_streams', '-show_format', '-of', 'json', file], { cwd: dir, timeout: 15000 })).toString('utf8')); }
      catch (err) { if (err.code === 'MEDIA_PROCESS_FAILED' || err instanceof SyntaxError) throw error('MEDIA_FORMAT_UNSUPPORTED', 409); throw err; }
      return videoInfo(data);
    }
    const source = await probe('full.mp4'), sample = await probe('preview.mp4');
    await run(ffmpeg, ['-nostdin', '-v', 'error', ...inputOptions, '-threads', '2', '-i', 'preview.mp4',
      '-map', '0:v:0', '-frames:v', '1', '-an', '-map_metadata', '-1', '-filter_threads', '1',
      '-vf', 'scale=' + sample.cover_width + ':' + sample.cover_height + ',setsar=1',
      '-c:v', 'mjpeg', '-q:v', '3', '-threads', '2', '-fs', '2097152', '-f', 'image2', '-update', '1', 'cover.jpg'], { cwd: dir, timeout: 30000 });
    const body = await fs.readFile(path.join(dir, 'cover.jpg'));
    if (body.length < 4 || body.length >= 2 * 1024 * 1024 || body[0] !== 255 || body[1] !== 216 || body.at(-2) !== 255 || body.at(-1) !== 217) throw error('MEDIA_OUTPUT_NOT_VERIFIED', 503);
    // Decode the result independently before claiming that a usable cover exists.
    const checked = JSON.parse((await run(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-of', 'json', 'cover.jpg'], { cwd: dir, timeout: 15000 })).toString('utf8'));
    const image = checked.streams?.[0];
    if (checked.streams?.length !== 1 || image.codec_name !== 'mjpeg' || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width > 640 || image.height > 640) throw error('MEDIA_OUTPUT_NOT_VERIFIED', 503);
    return { body, metadata: { source_sha256: sha(full), preview_sha256: sha(preview), duration_ms: source.duration_ms,
      preview_duration_ms: sample.duration_ms, preview_width: sample.width, preview_height: sample.height,
      cover: { media_type: 'image/jpeg', byte_size: body.length, content_sha256: sha(body), width: image.width, height: image.height, frame_ms: 0, source: 'REVIEWED_PREVIEW' } } };
  } finally {
    const target = path.resolve(dir);
    if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('jx-video-preview-')) await fs.rm(target, { recursive: true, force: true });
  }
}
module.exports = { describeVideo, videoInfo };
