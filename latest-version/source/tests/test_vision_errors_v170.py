"""Negative UI workflow tests with explicitly mocked model/job endpoints."""
from playwright.sync_api import sync_playwright,expect
import re,json
from pathlib import Path
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox']);page=b.new_page();calls=[];mode={'value':'missing'};errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def handle(r):
  path=r.request.url.split('/api/ai/')[-1];calls.append(path)
  if path=='models':data={'models':[] if mode['value']=='missing' else [{'id':'test','name':'MOCK VISION','projector':'test-mmproj'}]}
  elif path=='status':data={'engine':'ready','active_model':{'id':'test','vision':True,'mode':'cpu'},'samples':0,'training':{},'logs':[]}
  elif path=='vision/analyze':data={'id':'test-job','state':'queued','total':1}
  elif path=='vision/jobs/test-job':data={'state':'analyzing','done':0,'total':1,'message':'TEST MOCK WORKER'}
  elif path=='vision/cancel':data={'state':'canceled'}
  else:data={}
  r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
 page.route('**/api/ai/**',handle);page.goto('http://127.0.0.1:7788');page.locator('#fileInput').set_input_files('tests/vision-design-fixture.png');page.click('#visionRun');expect(page.locator('#visionStatus')).to_have_class(re.compile('error'));assert 'vision/analyze' not in calls;expect(page.locator('#resultList [data-act="zip"]')).to_have_count(0)
 mode['value']='running';page.click('[data-tab="vision"]');expect(page.locator('#visionModel')).to_have_value('test')
 with page.expect_response('**/vision/jobs/test-job'):page.click('#visionRun')
 page.click('#visionCancel');expect(page.locator('#visionRun')).to_be_enabled();assert 'vision/cancel' in calls;expect(page.locator('#visionStatus')).to_contain_text('لغو');expect(page.locator('#resultList [data-act="zip"]')).to_have_count(0);assert not errors
 report={'status':'PASS','test_kind':'mocked negative UI integration','checks':['missing vision model blocks analysis instead of raster fallback','cancel calls backend and re-enables run','canceled job does not create output'],'pageErrors':errors};Path('tests/vision-error-report-v1.7.0.json').write_text(json.dumps(report,indent=2));print(report);b.close()
