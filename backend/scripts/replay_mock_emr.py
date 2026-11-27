"""Send one synthetic canonical EMR event; never connects to hospital EMR."""
import argparse
import json
import os
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from uuid import uuid4
from backend.app.config import REPO
from scripts.serve_api import load_local_env


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:8000')
    args=parser.parse_args()
    load_local_env()
    golden=json.loads((REPO/'tests/fixtures/sepsis_scoring_golden.json').read_text())['cases'][0]['input']
    local=datetime.utcnow()+timedelta(hours=7)
    profile=golden['profile'] | {'id':'HS-'+uuid4().hex[:8].upper(),'t0':(local-timedelta(hours=2)).isoformat(timespec='seconds')}
    observed=(local-timedelta(minutes=30)).isoformat(timespec='seconds')
    entry=golden['entries'][0] | {'hour':2,'measuredAt':observed,'availableAt':observed,'collectedAt':observed,'labAvailableAt':observed}
    body={'source':'mock-emr','eventId':str(uuid4()),'eventVersion':1,'encounterId':profile['id'],
        'profile':profile,'entry':entry,'units':{code:unit for code,unit in
            {'WBC':'10^9/L','platelets':'10^9/L','creatinine':'mg/dL','bilirubin_total':'mg/dL','CRP':'mg/L','procalcitonin':'ng/mL'}.items() if code in entry['labs']}}
    request=Request(args.url+'/api/emr/events',data=json.dumps(body).encode(),
        headers={'Content-Type':'application/json','Authorization':'Bearer '+os.environ['SEPSIS_EMR_KEY']})
    with urlopen(request,timeout=30) as response:
        print(response.read().decode())
