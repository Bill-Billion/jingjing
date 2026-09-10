echo "===FFMPEG==="; which ffmpeg || echo NO_FFMPEG
echo "===SQLITE==="; which sqlite3 || echo NO_SQLITE
echo "===JJSR_DIR==="; ls -la /opt/jjsr | head -40
echo "===UPLOADS==="; ls -la /opt/jjsr/uploads 2>/dev/null | head -30; echo "--samples--"; ls -la /opt/jjsr/uploads/samples 2>/dev/null || echo NO_SAMPLES_DIR
echo "===DB_FILES==="; find /opt/jjsr -maxdepth 3 -name '*.db' -exec ls -la {} \;
echo "===DISK==="; df -h / | tail -1
echo "===PM2==="; pm2 list 2>/dev/null | head -20
echo "===NGINX==="; grep -RnE "location|root|client_max" /etc/nginx/sites-enabled/ 2>/dev/null | head -40
echo "===ENV_DB==="; grep -iE "DB_|DATABASE|SQLITE" /opt/jjsr/.env 2>/dev/null | sed 's/PASSWORD=.*/PASSWORD=***/I; s/SECRET=.*/SECRET=***/I'
