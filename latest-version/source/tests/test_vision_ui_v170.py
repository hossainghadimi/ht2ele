"""Browser integration with MOCKED model-job endpoints. No claim of Qwen accuracy."""
from playwright.sync_api import sync_playwright,expect
from pathlib import Path
import json,zipfile,io
scene=json.loads(Path('tests/vision-scene-fixture.json').read_text())
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox']);page=b.new_page(viewport={'width':1750,'height':1080});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));calls=[]
 def route(r):
  path=r.request.url.split('/api/ai/')[-1];data=r.request.post_data_json if r.request.method=='POST' else None;calls.append((path,data))
  result={}
  if path=='models':result={'models':[{'id':'fixture','name':'TEST MODEL FIXTURE','projector':'fixture-mmproj.gguf'}]}
  elif path=='status':result={'engine':'ready','active_model':{'id':'fixture','vision':True,'mode':'cpu'},'samples':0,'python':'test','vision':'Pillow','ml':'micrograd','training':{'state':'idle'},'logs':[]}
  elif path=='vision/analyze':
   assert data['image'].startswith('data:image/');result={'id':'fixture-job','state':'queued','total':1}
  elif path=='vision/jobs/fixture-job':result={'state':'ready','done':1,'total':1,'result':scene}
  elif path=='vision/cancel':result={'state':'canceled'}
  r.fulfill(status=200,content_type='application/json',body=json.dumps(result))
 page.route('**/api/ai/**',route);page.goto('http://127.0.0.1:7788');page.locator('#fileInput').set_input_files('tests/vision-design-fixture.png');expect(page.locator('#pane-vision')).to_be_visible();page.locator('#visionRun').click()
 out=page.frame_locator('#liveDocument');expect(out.locator('.elementor-widget-button')).to_have_count(1,timeout=15000)
 expect(page.locator('#pane-live')).to_be_visible();expect(out.locator('.elementor-widget-heading')).to_have_count(2);expect(out.locator('.elementor-widget-text-editor')).to_have_count(2);expect(out.locator('.elementor-widget-image')).to_have_count(1);expect(out.locator('.elementor-widget-html')).to_have_count(0)
 assert abs(out.locator('#vl-t0-button .elementor-button').evaluate('e=>e.getBoundingClientRect().width')-180)<.2;expect(out.locator('#vl-t0-button .elementor-button')).to_have_css('height','48px')
 # Native output remains editable, deletable, resizeable and synchronized.
 out.locator('#vl-t0-button').click();page.locator('input[data-k="text"]').fill('Edited CTA');expect(out.locator('#vl-t0-button .elementor-button')).to_have_text('Edited CTA')
 page.click('[data-tab="json"]');result=json.loads(page.locator('#jsonHost pre').inner_text());assert result['version']=='0.4'
 def walk(nodes):
  for n in nodes:yield n;yield from walk(n.get('elements',[]))
 flat=list(walk(result['content']));icon=next(n for n in flat if n.get('widgetType')=='icon');assert icon['settings']['selected_icon']=={'value':'','library':''};button=next(n for n in flat if n.get('widgetType')=='button');assert button['settings']['text']=='Edited CTA' and button['settings']['link']['url']==''
 page.click('[data-tab="live"]');page.click('[data-device="mobile"]');out.locator('.elementor-widget-heading').first.wait_for();assert page.locator('#liveDocument').evaluate('f=>f.contentWindow.innerWidth')==375
 width=out.locator('body').evaluate('()=>({scroll:document.scrollingElement.scrollWidth,width:innerWidth})');assert width['scroll']<=width['width']+1,width
 page.click('[data-tab="vision"]');expect(page.locator('.vision-box')).to_have_count(12);page.locator('#visionNode').select_option('t0-text');page.locator('#visionNodeType').select_option('heading');page.locator('#visionNodeText').fill('Reclassified heading');page.click('#visionApply');page.once('dialog',lambda d:d.accept());page.click('#visionRebuild');expect(out.locator('.elementor-widget-heading')).to_have_count(3)
 page.click('[data-tab="convert"]')
 with page.expect_download() as download:page.locator('[data-act="zip"]').first.click()
 raw=Path(download.value.path()).read_bytes()
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  assert z.testzip() is None;names=z.namelist();assert any(n.startswith('images/') for n in names);assert any(n.endswith('.vision-layout.json') for n in names);assert any(n.endswith('.reconstructed.html') for n in names)
  template=json.loads(z.read(next(n for n in names if n.endswith('.json') and '.vision-layout.' not in n and '.clipboard.' not in n)));assert sum(n.get('widgetType')=='heading' for n in walk(template['content']))==3
 page.click('[data-tab="vision"]');page.screenshot(path='tests/vision-workspace-v1.7.png',full_page=True)
 assert not errors,errors
 report={'status':'PASS','test_kind':'browser integration with mock job endpoints; fixture scene, not real Qwen inference','checks':['image upload opens vision workspace','analysis job requested with real data URI','semantic containers and native heading/text/button/image/empty-icon, no HTML fallback','native button width and height','live text edit + JSON sync','375px mobile flow without horizontal overflow in fixture','overlay boxes','reclassify recognized node + rebuild','ZIP includes cropped image, analysis, reconstructed HTML, JSON and CSS'],'widget_counts':{t:sum(n.get('widgetType')==t for n in flat) for t in ['heading','text-editor','button','image','icon']},'mobile':width,'consoleErrors':errors}
 Path('tests/report-v1.7.0.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2));b.close()
