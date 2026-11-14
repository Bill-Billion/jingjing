from pathlib import Path
from PIL import Image,__version__
import json,hashlib,sys,datetime
directory=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.local')
expected=json.loads((directory/'cover-label-records.json').read_text(encoding='utf8'))
p=directory/'cover-label-delivered.jpg'
assert hashlib.sha256(p.read_bytes()).hexdigest()==expected['cover_sha256']
with Image.open(p) as im:
 assert im.format=='JPEG';im.load();comment=json.loads(im.info['comment'].decode('utf8'));assert comment==expected['jpeg_comment'];assert im.size==(320,180)
 result={'result':'PASS','reader':'Pillow','reader_version':__version__,'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'file_sha256':expected['cover_sha256'],'jpeg_size':list(im.size),'embedded_comment':comment,'scope':'Independent reader of exact HTTP-delivered JPEG captured from this run; not legal certification'}
(directory/'pillow-cover-verification.json').write_bytes((json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode('utf8'))
print(json.dumps(result,ensure_ascii=True))
