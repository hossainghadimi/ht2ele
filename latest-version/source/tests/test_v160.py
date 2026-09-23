from playwright.sync_api import sync_playwright,expect
from pathlib import Path
import json
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox']);page=b.new_page(viewport={'width':1750,'height':1050});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:7788')
 page.evaluate('()=>{const fn=H2E.convertHtml;H2E.convertHtml=(...args)=>window.result=fn(...args)}')
 page.locator('#fileInput').set_input_files('tests/fixtures-v1.6.html');source=page.frame_locator('#sourceFrame');source.locator('#a').click()
 page.click('#sourceDelete');expect(source.locator('#a')).to_have_count(0);page.click('#sourceUndo');expect(source.locator('#a')).to_have_count(1)
 page.click('[data-source-width="375"]');source.locator('#b').click();h=source.locator('[data-tool="resize"]').bounding_box();page.mouse.move(h['x']+10,h['y']+10);page.mouse.down();page.mouse.move(h['x']-30,h['y']+30,steps=8);page.mouse.up();expect(source.locator('#b')).to_have_css('width','160px')
 source.locator('#c').click();h=source.locator('[data-tool="move"]').bounding_box();t=source.locator('#b').bounding_box();page.mouse.move(h['x']+10,h['y']+10);page.mouse.down();page.mouse.move(t['x']+40,t['y']+15,steps=8);page.mouse.up();expect(source.locator('#c')).to_have_css('order','1')
 page.click('[data-source-width="1200"]');expect(source.locator('#b')).to_have_css('width','280px');expect(source.locator('#c')).to_have_css('order','0');page.click('#sourceUndo');page.click('#sourceUndo')
 page.click('#btnConvert');out=page.frame_locator('#liveDocument');out.locator('#a').wait_for()
 ids=out.locator('#a,#b,#c').evaluate_all('(es)=>Object.fromEntries(es.map(e=>[e.id,e.dataset.id]))')
 props='''e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {width:r.width,height:r.height,padding:s.padding,margin:s.margin,border:s.border,borderRadius:s.borderRadius,background:s.backgroundImage,shadow:s.boxShadow,color:s.color}}'''
 before={}
 for dev in ['desktop','tablet','mobile']:
  page.click('[data-device="'+dev+'"]');out.locator('#a').wait_for();before[dev]=out.locator('#a').evaluate(props)
 page.click('[data-device="desktop"]');page.evaluate('id=>H2EPreview.select(id)',ids['a']);page.locator('#widgetTypeTarget').select_option('button');page.click('#applyWidgetType');expect(out.locator('#a .elementor-button')).to_be_visible(timeout=10000)
 after={}
 for dev in ['desktop','tablet','mobile']:
  page.click('[data-device="'+dev+'"]');out.locator('#a .elementor-button').wait_for();after[dev]=out.locator('#a').evaluate(props)
  for key in ['width','height']:assert abs(before[dev][key]-after[dev][key])<1.1,(dev,key,before[dev],after[dev])
  for key in ['padding','margin','border','borderRadius','background','shadow','color']:assert before[dev][key]==after[dev][key],(dev,key,before[dev],after[dev])
 # Device-specific resize via numeric controls, sibling reorder using actual drag handle.
 page.evaluate('id=>H2EPreview.select(id)',ids['a']);page.click('[data-itab="style"]');page.locator('input[type="text"][data-k="button_text_color"]').fill('#ff0000');expect(out.locator('#a .elementor-button')).to_have_css('color','rgb(255, 0, 0)')
 page.evaluate('id=>H2EPreview.select(id)',ids['b']);page.locator('#editWidth').fill('180');page.locator('#editHeight').fill('80');page.click('#applyElementSize');expect(out.locator('#b')).to_have_css('width','180px');expect(out.locator('#b')).to_have_css('height','80px')
 assert page.evaluate('id=>{let found;function walk(ns){for(const n of ns){if(n.id===id)found=n;walk(n.elements||[])}}walk(result.template.content);return found.settings._element_custom_width_mobile.size}',ids['b'])==180
 page.click('[data-device="desktop"]');expect(out.locator('#b')).to_have_css('width','280px');page.click('[data-device="mobile"]');out.locator('#b').wait_for();page.evaluate('id=>H2EPreview.select(id)',ids['c']);handle=out.locator('[data-tool="move"]');target=out.locator('#b');box=handle.bounding_box();tb=target.bounding_box();page.mouse.move(box['x']+12,box['y']+12);page.mouse.down();page.mouse.move(tb['x']+50,tb['y']+20,steps=12);page.mouse.up();expect(out.locator('#c')).to_have_css('order','1');expect(out.locator('#b')).to_have_css('order','2')
 page.click('[data-device="desktop"]');expect(out.locator('#b')).to_have_css('order','0');page.click('[data-device="mobile"]');out.locator('#c').wait_for();page.evaluate('id=>H2EPreview.select(id)',ids['c']);page.click('#btnDel');expect(out.locator('#c')).to_have_count(0);page.click('#undoCanvasAction');expect(out.locator('#c')).to_have_count(1)
 # Pointer resize, not just direct API/numeric input.
 page.evaluate('id=>H2EPreview.select(id)',ids['b']);out.locator('[data-tool="resize"]').wait_for();r=out.locator('[data-tool="resize"]').bounding_box();page.mouse.move(r['x']+10,r['y']+10);page.mouse.down();page.mouse.move(r['x']+30,r['y']+30,steps=8);page.mouse.up();expect(out.locator('#b')).to_have_css('width','200px')
 assert page.evaluate('JSON.stringify(result.template.content)===JSON.stringify(result.clipboard.elements)')
 page.click('[data-tab="ai"]');expect(page.locator('#aiHealth')).to_contain_text('آماده',timeout=15000);page.screenshot(path='tests/ai-workspace-v1.6.png',full_page=True)
 assert not errors,errors
 report={'status':'PASS','checks':['source deletion + undo','source pointer resize and sibling reorder, mobile only','manual style editing after retype','three-device appearance preservation on text-to-button: box/color/border/padding/margin/gradient/shadow','responsive size controls','actual pointer sibling drag/drop','desktop unchanged after mobile order edit','delete + undo output','actual pointer resize','live JSON/clipboard','AI workspace online local service'],'appearanceBefore':before,'appearanceAfter':after,'errors':errors}
 Path('tests/report-v1.6.0.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2));b.close()
