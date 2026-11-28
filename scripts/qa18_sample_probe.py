"""Read-only technical checks of the three supplied acceptance sample files.

This does not approve content, likeness rights, model quality or publication.
Originals and decoded frames are never copied into the evidence directory.
"""
import argparse
import hashlib
import json
import math
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-directory', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--ffmpeg', required=True, type=Path)
    parser.add_argument('--ffprobe', required=True, type=Path)
    args = parser.parse_args()
    source, out = args.source_directory.resolve(strict=True), args.out.resolve()
    if out == source or source in out.parents:
        parser.error('Evidence must be outside the original source directory')
    if out.exists() and any(out.iterdir()):
        parser.error('Refusing to overwrite an existing execution')
    files = sorted(p for p in source.iterdir() if p.is_file() and re.fullmatch(r'[a-f0-9]{31,32}\.mp4', p.name))
    if len(files) != 3:
        parser.error('Exactly the three supplied MP4 filenames are required')
    tools = {key: value.resolve(strict=True) for key, value in [('ffmpeg', args.ffmpeg), ('ffprobe', args.ffprobe)]}
    out.mkdir(parents=True, exist_ok=True)
    root = Path(__file__).resolve().parents[1]
    result = {
        'kind': 'ORIGINAL_SAMPLE_TECHNICAL_CHECK', 'started_at': datetime.now(timezone.utc).isoformat(),
        'script_source': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
        'script_sha256': digest(Path(__file__)), 'source_directory': str(source),
        'network_calls': False, 'product_business_execution': False, 'originals_copied': False,
        'tools': {}, 'samples': [],
        'limits': ['Technical readability only; no arbitrary resolution/duration requirement is invented.',
                   'Content, model/likeness quality, authorization scope and human sign-off remain NOT_AUTOMATABLE.',
                   'No claim that the current QA synthetic fixtures contain these original bytes.'],
    }
    for key, tool in tools.items():
        version = subprocess.run([str(tool), '-version'], capture_output=True, text=True, timeout=30, check=True)
        (out / (key + '-version.log')).write_text(version.stdout, encoding='utf-8', newline='\n')
        result['tools'][key] = {'path': str(tool), 'sha256': digest(tool), 'version': version.stdout.splitlines()[0]}
    for index, original in enumerate(files, 1):
        prefix = 'sample-' + str(index)
        before = digest(original)
        row = {'sample_id': prefix, 'source_filename': original.name, 'sha256_before': before,
               'size_bytes': original.stat().st_size, 'business_id': None, 'result': 'FAIL'}
        result['samples'].append(row)
        # Select only technical fields: do not export embedded titles, authors or locations.
        probe_args = [str(tools['ffprobe']), '-v', 'error', '-count_frames', '-show_entries',
                      'format=format_name,duration,size:stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,duration,nb_read_frames,sample_rate,channels',
                      '-of', 'json', str(original)]
        decode_args = [str(tools['ffmpeg']), '-nostdin', '-hide_banner', '-loglevel', 'error', '-xerror',
                       '-err_detect', 'explode', '-i', str(original), '-map', '0:v:0', '-map', '0:a?', '-f', 'null', '-']
        row['commands'] = {'probe': probe_args, 'full_decode': decode_args}
        try:
            probe = subprocess.run(probe_args, capture_output=True, text=True, timeout=300)
            (out / (prefix + '-probe.json')).write_text(probe.stdout, encoding='utf-8', newline='\n')
            (out / (prefix + '-probe.stderr.log')).write_text(probe.stderr, encoding='utf-8', newline='\n')
            row['probe_exit'] = probe.returncode
            if probe.returncode:
                raise ValueError('FFPROBE_FAILED')
            info = json.loads(probe.stdout)
            videos = [s for s in info.get('streams', []) if s.get('codec_type') == 'video']
            duration = float(info['format']['duration'])
            if not videos or not math.isfinite(duration) or duration <= 0:
                raise ValueError('NO_VALID_VIDEO_DURATION')
            if any(int(v.get('width', 0)) <= 0 or int(v.get('height', 0)) <= 0 or int(v.get('nb_read_frames', 0)) <= 0 for v in videos):
                raise ValueError('NO_DECODABLE_VIDEO_FRAMES')
            decoded = subprocess.run(decode_args, capture_output=True, text=True, timeout=300)
            (out / (prefix + '-decode.stderr.log')).write_text(decoded.stderr, encoding='utf-8', newline='\n')
            row['decode_exit'] = decoded.returncode
            if decoded.returncode:
                raise ValueError('FULL_DECODE_FAILED')
            row['technical'] = info
            row['sha256_after'] = digest(original)
            if row['sha256_after'] != before:
                raise ValueError('ORIGINAL_CHANGED_DURING_CHECK')
            row['result'] = 'PASS_TECHNICAL_ONLY'
            row['manual_quality'] = 'NOT_AUTOMATABLE'
        except (ValueError, OSError, subprocess.TimeoutExpired) as error:
            row['error'] = type(error).__name__ + ': ' + str(error)
        dump(out / (prefix + '-QUALITY.json'), row)
        print(json.dumps({'sample': prefix, 'result': row['result']}, ensure_ascii=False), flush=True)
    result['ended_at'] = datetime.now(timezone.utc).isoformat()
    result['passed'] = sum(s['result'] == 'PASS_TECHNICAL_ONLY' for s in result['samples'])
    result['failed'] = len(files) - result['passed']
    result['formal_acceptance_updated'] = False
    dump(out / 'SAMPLE_TECHNICAL_RESULT.json', result)
    return 1 if result['failed'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
