set -e
cd /opt/jjsr/uploads/samples
mv out/* . && rmdir out
chmod 644 *.mp4 *.jpg
chown root:root *.mp4 *.jpg
echo "=== samples dir ==="
ls -la
cp /opt/jjsr/routes/samples.js /opt/jjsr/routes/samples.js.bak.r41.$(date +%Y%m%d%H%M%S)
echo "=== backup samples.js done ==="
ls -la /opt/jjsr/routes/samples.js.bak.r41.* | tail -3
echo STAGE_DONE
