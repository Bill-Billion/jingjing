#!/bin/bash
echo "--mem--"; free -h
echo "--disk--"; df -h /
echo "--swap--"; swapon --show || echo "no swap"
echo "--tools--"
for c in node npm nginx git sqlite3 python3 make g++ ufw curl; do
  printf "%s: " "$c"; command -v "$c" || echo none
done
echo "--listen--"; ss -tlnp | head -20
