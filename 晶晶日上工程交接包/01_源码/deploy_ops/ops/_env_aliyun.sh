#!/bin/bash
cd /opt/jjsr
if grep -q '^ALIYUN_ACCESS_KEY_ID=' .env; then
  echo "ALIYUN block already present, skip append"
else
  cp -a .env /opt/jjsr/backups/.env.before_aliyun_$(date +%Y%m%d_%H%M%S)
cat >> .env <<'EOF'

# ===== V12.5 阿里云实人认证+内容安全2.0（全部留空=安全降级到本地词库+人工；填AK与场景ID即自动启用）=====
ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
ALIYUN_REGION=cn-shanghai
CLOUDAUTH_ELEMENT_SCENE_ID=
CLOUDAUTH_FACE_SCENE_ID=
CLOUDAUTH_FACE_PASS_SCORE=80
GREEN_TEXT_SERVICE=comment_detection
GREEN_IMAGE_SERVICE=baselineCheck
GREEN_VIDEO_SERVICE=videoDetection
EOF
  echo "ALIYUN empty block appended"
fi
echo "=aliyun_key_lines="; grep -c 'ALIYUN\|CLOUDAUTH\|GREEN_' .env
echo "=confirm_empty_AK="; grep '^ALIYUN_ACCESS_KEY_ID=' .env
