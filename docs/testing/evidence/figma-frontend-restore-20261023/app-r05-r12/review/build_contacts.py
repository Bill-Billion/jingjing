from pathlib import Path
import argparse,hashlib,json,math
from PIL import Image,ImageDraw,ImageFont
parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,default=Path(__file__).resolve().parent.parent)
parser.add_argument('--width',type=int,choices=[320,390,768],default=390)
args=parser.parse_args()
root=args.source.resolve()
out=root/'review'
out.mkdir(exist_ok=True)
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',16)
rows=[]
for domain in ['05','06','07','08','09','10','11','12']:
    files=sorted(root.glob(domain+f'-*-{args.width}-*.png'))
    for offset in range(0,len(files),6):
        batch=files[offset:offset+6]
        w,screen_h=args.width,1024 if args.width>=700 else 844
        h=screen_h+26
        sheet=Image.new('RGB',(w*3,h*math.ceil(len(batch)/3)),'#ffffff')
        draw=ImageDraw.Draw(sheet)
        items=[]
        for i,p in enumerate(batch):
            x=(i%3)*w;y=(i//3)*h
            im=Image.open(p).convert('RGB');assert im.size==(w,screen_h),(p,im.size)
            sheet.paste(im,(x,y+26))
            draw.text((x+5,y+4),p.stem,fill='#111111',font=font)
            items.append({'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
        name=f'contact-{domain}-{args.width}-{offset//6+1:02}.png'
        sheet.save(out/name)
        rows.append({'file':name,'width':args.width,'source_images':items})
(out/f'CONTACTS_{args.width}.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sheets':len(rows),'source_images':sum(len(x['source_images']) for x in rows)}))
