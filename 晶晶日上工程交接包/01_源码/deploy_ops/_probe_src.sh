cd /opt/jjsr/uploads/samples/src
for f in huangdi_src renxingju_src; do
  echo "=== $f video ==="
  ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,width,height,r_frame_rate,pix_fmt -show_entries format=duration,bit_rate -of default=noprint_wrappers=1 "$f.mp4"
  echo "=== $f audio ==="
  ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,channels,sample_rate,bit_rate -of default=noprint_wrappers=1 "$f.mp4"
done
echo PROBE_DONE
