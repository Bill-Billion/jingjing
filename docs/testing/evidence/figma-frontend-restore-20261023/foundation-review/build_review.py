from pathlib import Path
import json, shutil, hashlib
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[5]
OUT=Path(__file__).resolve().parent
REF=ROOT/'docs/testing/evidence/figma-remaining-calibration-20261023'
SOURCE=ROOT/'output/playwright/figma-frontend-restore'
for d in ['screenshots','references','contact']: (OUT/d).mkdir(exist_ok=True)
rows=json.loads((REF/'REVIEWS.json').read_text()); rows=rows.get('screens',rows.get('reviews',[])); refs={r['id']:r for r in rows}
fontpath='/System/Library/Fonts/STHeiti Light.ttc'
font=ImageFont.truetype(fontpath,16)
small=ImageFont.truetype(fontpath,13)
allshots=[];allcases=[];sources=[]
for group,filename in [('story','STORY_RESULTS.json'),('extra','EXTRA_RESULTS.json')]:
 data=json.loads((SOURCE/group/filename).read_text());sources.append({'group':group,'file':filename,'sha256':hashlib.sha256((SOURCE/group/filename).read_bytes()).hexdigest(),'app_bundle_sha256':data.get('app_bundle_sha256')})
 for case in data['results']: allcases.append({'group':group,**case})
 for shot in data['screenshots']:
  source=SOURCE/group/shot['file'];target=OUT/'screenshots'/f'{group}-{shot["file"]}'
  shutil.copyfile(source,target)
  sha=hashlib.sha256(target.read_bytes()).hexdigest()
  assert sha==shot['sha256'],source
  ref=refs[shot['figmaId']];rname=f'{shot["figmaId"].replace(":","-")}.png'
  shutil.copyfile(REF/ref['finalScreenshot'],OUT/'references'/rname)
  allshots.append({'group':group,**shot,'copiedFile':str(target.relative_to(OUT)),'referenceName':ref['name'],'referenceFile':f'references/{rname}','referenceSha256':ref['finalSha256']})
# Actual images are kept complete. Captures wider than 390px are scaled
# only on contact sheets; their full-resolution originals stay linked.
for group in ['story','extra']:
 shots=[s for s in allshots if s['group']==group]
 for offset in range(0,len(shots),3):
  batch=shots[offset:offset+3];ims=[]
  for s in batch:
   im=Image.open(OUT/s['copiedFile']).convert('RGB')
   if im.width>390:
    im=im.resize((390,round(im.height*390/im.width)))
   elif im.width<390:
    box=Image.new('RGB',(390,im.height),'#ffffff');box.paste(im,((390-im.width)//2,0));im=box
   ims.append(im)
  canvas=Image.new('RGB',(len(batch)*410+20,max(im.height for im in ims)+80),'#dedbd2');draw=ImageDraw.Draw(canvas)
  for n,(s,im) in enumerate(zip(batch,ims)):
   x=20+n*410;draw.text((x,10),f'{s["name"]} · {s["width"]}px · scroll {s["position"]}',font=font,fill='#151515');draw.text((x,34),f'{s["figmaId"]} / {group}',font=small,fill='#66645f');canvas.paste(im,(x,60))
  canvas.save(OUT/'contact'/f'{group}-{offset//3+1:02}.png')
# 3 full designs per sheet; their CSS-width scaling is explicit.
refnames=[]
for s in allshots:
 if s['referenceFile'] not in refnames:refnames.append(s['referenceFile'])
for offset in range(0,len(refnames),3):
 batch=refnames[offset:offset+3];ims=[]
 for name in batch:
  im=Image.open(OUT/name).convert('RGB');im=im.resize((390,round(im.height*390/im.width)))
  ims.append(im)
 canvas=Image.new('RGB',(len(batch)*410+20,max(im.height for im in ims)+60),'#dedbd2');draw=ImageDraw.Draw(canvas)
 for n,(name,im) in enumerate(zip(batch,ims)):
  x=20+n*410;draw.text((x,10),Path(name).stem,font=font,fill='#151515');canvas.paste(im,(x,40))
 canvas.save(OUT/'contact'/f'reference-{offset//3+1:02}.png')
(OUT/'CAPTURE_INVENTORY.json').write_text(json.dumps({'sources':sources,'caseCount':len(allcases),'screenshotCount':len(allshots),'referenceCount':len(refnames),'cases':allcases,'screenshots':allshots},ensure_ascii=False,indent=2)+'\n')
print('ROOT',ROOT,'cases',len(allcases),'screenshots',len(allshots),'references',len(refnames))
