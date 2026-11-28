import json,sys
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts'));import validate_contract
out=r/'.local/qa18/rollback-20261126-41';files=[out/'attempt02'/(p+'-http.json')for p in ['candidate-before','rollback','candidate-after']]
report=validate_contract.validate(files);(out/'contract-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({k:report[k]for k in ['result','runtime_response_cases','contract_version','failures']}));sys.exit(0 if report['result']=='PASS' else 1)
