"""Freeze reviewed synthetic mobile routes. Requires existing contract PyYAML tooling."""
from pathlib import Path
import hashlib,json,sys,yaml
root=Path(__file__).resolve().parents[1]
p=root/'contracts/openapi.yaml'
raw=p.read_bytes().replace(b'\r\n',b'\n')
spec=yaml.safe_load(raw)
routes=[]
for route,ops in spec['paths'].items():
    if not route.startswith('/api/v1/') or any(x in route for x in ('/admin/','/callbacks','/webhooks','/trade/notifications/')):
        continue
    for method in ops:
        if method in ('get','post','put','patch','delete'):
            routes.append([method.upper(),route])
result={'contract_sha256':hashlib.sha256(raw).hexdigest(),'routes':routes}
out=root/'scripts/test-fixtures/mobile-routes.json'
if '--check' in sys.argv:
    assert json.loads(out.read_text(encoding='utf-8'))==result,'Mobile routes need review and refresh'
else:
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'{len(routes)} reviewed method/path pairs; admin and provider callbacks excluded')
