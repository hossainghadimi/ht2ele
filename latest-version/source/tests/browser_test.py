from playwright.sync_api import sync_playwright
from pathlib import Path
import json

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1600,'height':1000})
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:7788')
    html=Path('tests/fixtures-v1.3.html').read_text()
    r=page.evaluate('''html => { window.testResult = H2E.convertHtml(html, [], {mode:'hybrid',layout:'container'}, 'fixture.html'); H2EPreview.setResults([testResult]); return testResult; }''',html)
    def walk(nodes):
        for n in nodes:
            yield n
            yield from walk(n.get('elements',[]))
    nodes=list(walk(r['template']['content']))
    def find(cls): return next(n for n in nodes if cls in n['settings'].get('_css_classes','').split())
    assert not r['warnings'],r['warnings']
    hero=find('hero'); assert hero['settings']['flex_direction']=='row-reverse', hero
    assert hero['settings']['padding']['top']=='36px',hero
    assert hero['settings']['flex_gap']['column']=='28',hero
    assert len(hero['elements'])==2 and hero['elements'][1]['widgetType']=='icon',hero
    grid=find('cards');assert grid['settings']['container_type']=='grid',grid
    assert grid['settings']['grid_columns_grid']=={'unit':'custom','size':'2fr 1fr'},grid
    assert find('copy')['settings']['width']['size']==62
    heading=next(n for n in nodes if n.get('widgetType')=='heading' and n['settings'].get('_element_id')=='main-title')
    assert heading['settings']['typography_font_size']['size']==40,heading
    assert heading['settings']['_margin']['bottom']=='12',heading
    paragraph=next(n for n in nodes if n.get('widgetType')=='text-editor')
    assert paragraph['settings']['typography_font_size']['size']==20,paragraph
    button=find('btn');assert button['widgetType']=='button'
    assert button['settings']['button_text_padding']['left']=='23',button
    assert button['settings']['selected_icon']['value']=='',button
    kinds=set(n.get('widgetType') for n in nodes)
    expected={'heading','text-editor','button','icon','accordion','tabs','counter','progress','alert','testimonial','star-rating','image-gallery','google_maps','html'}
    assert expected<=kinds,expected-kinds
    assert not page.evaluate('Boolean(window.inputScriptRan)')
    assert any('window.inputScriptRan' in n['settings'].get('html','') for n in nodes)
    assert not any('نباید دیده شود' in str(n['settings']) for n in nodes)
    # Scroll bounded live iframe viewport, not just outer app.
    page.click('[data-tab="live"]')
    page.frame_locator('#liveDocument').locator('.elementor-heading-title').first.wait_for()
    scroll=page.evaluate('''() => {const s=document.querySelector('#liveDocument').contentDocument.scrollingElement;s.scrollTop=2000;return {client:s.clientHeight,height:s.scrollHeight,top:s.scrollTop}}''')
    assert scroll['height']>scroll['client'] and scroll['top']>0,scroll
    page.evaluate("document.querySelector('#liveDocument').contentDocument.scrollingElement.scrollTop=0")
    page.evaluate("document.fonts.ready")
    assert page.frame_locator('#liveDocument').locator('.h2e-icon-placeholder').count() > 0
    page.screenshot(path='tests/regression-v1.5-core.png',full_page=True)
    assert hero['settings']['flex_direction_mobile']=='column', hero
    assert heading['settings']['typography_font_size_mobile']['size']==28, heading
    page.click('[data-device="mobile"]')
    mobile=page.frame_locator('#liveDocument').locator('[data-id="'+hero['id']+'"]')
    assert mobile.evaluate('(e)=>getComputedStyle(e).flexDirection')=='column'
    assert page.frame_locator('#liveDocument').locator('.elementor-heading-title').first.evaluate('(e)=>getComputedStyle(e).fontSize')=='28px'
    page.click('[data-device="desktop"]')
    # Click heading in the actual shadow canvas; edit content; JSON and preview stay in sync.
    page.frame_locator('#liveDocument').locator('[data-id="'+heading['id']+'"]').click()
    field=page.locator('#inspectorBody [data-k="title"]')
    if not field.count(): field=page.locator('.live-insp [data-k="title"]')
    field.fill('عنوان ویرایش‌شده')
    page.wait_for_timeout(400)
    assert 'عنوان ویرایش‌شده' in page.evaluate('testResult.jsonText')
    assert page.frame_locator('#liveDocument').locator('.elementor-heading-title').first.inner_text()=='عنوان ویرایش‌شده'
    # Repeater edits must update real settings, not just UI.
    tabs=next(n for n in nodes if n.get('widgetType')=='tabs')
    page.evaluate('id=>H2EPreview.select(id)',tabs['id'])
    textarea=page.locator('[data-json="tabs"]')
    textarea.fill('[{"_id":"sample","tab_title":"جدید","tab_content":"پاسخ جدید"}]')
    page.wait_for_timeout(300)
    assert 'پاسخ جدید' in page.evaluate('testResult.jsonText')
    assert not errors,errors
    # Flex singleton, specificity/important, grid equal, different units and LTR.
    edge=page.evaluate('''() => H2E.convertHtml(`<html dir="ltr"><style>body{font-size:24px;margin:0}#box{display:flex;flex-direction:column-reverse;padding:10px 5%;margin:2px auto} .x{font-size:12px} #specific{font-size:30px!important} @media(max-width:600px){#box{flex-direction:row}} .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}</style><div id="box"><h2 class="x" id="specific" style="font-size:10px">Title</h2></div><div class="grid"><p>A</p><p>B</p></div><details><summary>Q</summary>A</details><video src="movie.mp4"></video><audio src="sound.mp3"></audio><span hidden>hidden</span></html>`,[],{mode:'native'},'edge.html')''')
    en=list(walk(edge['template']['content']))
    box=next(n for n in en if n['settings'].get('_element_id')=='box')
    assert box['settings']['flex_direction']=='column-reverse',box
    assert next(n for n in en if n.get('widgetType')=='heading')['settings']['typography_font_size']['size']==30
    assert next(n for n in en if n['settings'].get('container_type')=='grid')['settings']['grid_columns_grid']['size']==4
    assert edge['rtl'] is False
    assert not edge['warnings'],edge['warnings']
    assert any(n.get('widgetType')=='video' and n['settings'].get('video_type')=='hosted' for n in en)
    # Bitmap input still produces image-backed Elementor containers.
    image=page.evaluate('''async () => { const c=document.createElement('canvas');c.width=300;c.height=180;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,300,180);x.fillStyle='#592bbd';x.fillRect(12,12,130,150);return await H2E.convertImage(c.toDataURL(),{},'section.png'); }''')
    assert image['template']['version']=='0.4'
    assert any(n.get('widgetType')=='image' for n in walk(image['template']['content']))
    # JSON 0.4 shape/id uniqueness; all widget types are core or HTML fallback.
    assert r['template']['version']=='0.4'
    assert len({n['id'] for n in nodes})==len(nodes)
    report={'status':'PASS','browser':'Chromium','checks':['source tree','row-reverse','column-reverse singleton','RTL/LTR','browser cascade !important','desktop media isolation','grid custom/equal','inherited font size','rem padding','button padding and icon','native widget detection','HTML form/audio fallback','script preservation without preview execution','hidden elements','live canvas scroll','click/edit JSON sync','repeater JSON sync','unique node IDs','empty native icon placeholders','responsive mobile layout and font','image input regression'],'widgets':sorted(k for k in kinds if k),'scroll':scroll,'consoleErrors':errors}
    Path('tests/regression-report-v1.5-core.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
    browser.close()
