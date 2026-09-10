set -e
cd /opt/jjsr/uploads/samples
mkdir -p out
echo "=== [1/4] huangdi HEVC -> H264 720p faststart ==="
ffmpeg -y -i src/huangdi_src.mp4 -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p -crf 26 -preset veryfast -c:a aac -b:a 128k -movflags +faststart out/huangdi_ttx.mp4 2>&1 | tail -3
echo "=== [2/4] huangdi cover ==="
ffmpeg -y -ss 3 -i src/huangdi_src.mp4 -frames:v 1 -q:v 3 out/huangdi_ttx_cover.jpg 2>&1 | tail -2
echo "=== [3/4] renxingju remux faststart ==="
ffmpeg -y -i src/renxingju_src.mp4 -c copy -movflags +faststart out/renxingju_7sins.mp4 2>&1 | tail -3
echo "=== [4/4] renxingju cover ==="
ffmpeg -y -ss 3 -i src/renxingju_src.mp4 -frames:v 1 -q:v 3 out/renxingju_7sins_cover.jpg 2>&1 | tail -2
echo "=== RESULT ==="
ls -la out
for f in out/*.mp4; do ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,pix_fmt -of default=noprint_wrappers=1 "$f"; done
echo TRANSCODE_DONE
