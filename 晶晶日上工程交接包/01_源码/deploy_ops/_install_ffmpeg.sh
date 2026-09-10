export DEBIAN_FRONTEND=noninteractive
echo "=== apt update ==="
apt-get update -qq 2>&1 | tail -2
echo "=== install ffmpeg ==="
apt-get install -y -qq ffmpeg 2>&1 | tail -6
echo "=== verify ==="
which ffmpeg ffprobe
ffmpeg -version 2>/dev/null | head -1
echo "FF_INSTALL_DONE"
