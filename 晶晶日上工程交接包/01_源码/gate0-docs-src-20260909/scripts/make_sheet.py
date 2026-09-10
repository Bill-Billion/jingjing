"""把 _isoA_*.png 顶部报告条裁剪并纵向拼接成一张大图，便于一次性读取。

用法：python make_sheet.py
"""
import glob, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
files = sorted(glob.glob(os.path.join(HERE, "_isoA_*.png")))
strips = []
for f in files:
    im = Image.open(f)
    w, h = im.size
    # 报告条：逻辑 top=60 ×dpr2.75 ≈ 设备 y165–245，裁 160..260
    crop = im.crop((0, 160, w, 260)).resize((int(w * 0.72), int(100 * 0.72)))
    strips.append((os.path.basename(f), crop))

if not strips:
    raise SystemExit("no screenshots")

sw, sh_ = strips[0][1].size
LABEL_H = 18
sheet = Image.new("RGB", (sw + 10, (sh_ + LABEL_H) * len(strips) + 10), (24, 24, 24))
from PIL import ImageDraw
d = ImageDraw.Draw(sheet)
y = 5
for name, s in strips:
    d.text((6, y), name, fill=(180, 220, 255))
    y += LABEL_H
    sheet.paste(s, (5, y))
    y += sh_
out = os.path.join(HERE, "_iso_sheet.png")
sheet.save(out)
print("saved", out, sheet.size)
