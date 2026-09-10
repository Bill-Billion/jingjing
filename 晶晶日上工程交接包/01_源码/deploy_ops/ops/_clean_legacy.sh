#!/bin/bash
# 归档历史一次性临时脚本（不删除，可回滚）
cd /opt/jjsr
echo '== 引用检查（业务代码不应 require 这些临时脚本）=='
HIT=0
for f in _inspect_tmp _patch_endorse _patch_mcn _patch_mcn2 _patch_videos; do
  R=$(grep -rEln "$f" app.js config.js db.js routes services utils jobs middleware 2>/dev/null)
  if [ -n "$R" ]; then echo "REFERENCED $f -> $R"; HIT=1; else echo "orphan(ok): $f"; fi
done
if [ "$HIT" = "0" ]; then
  mkdir -p ops/legacy_patches
  mv _inspect_tmp.js _patch_endorse.cjs _patch_mcn.cjs _patch_mcn2.cjs _patch_videos.cjs ops/legacy_patches/
  echo 'moved to ops/legacy_patches:'
  ls -la ops/legacy_patches
else
  echo 'ABORT: referenced files found'
fi
