from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json

def walk(ns):
    for n in ns:
        yield n
        yield from walk(n.get('elements',[]))

with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox'])
    page=b.new_page(viewport={'width':1700,'height':1080});errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:7788')
    page.evaluate('''()=>{const fn=H2E.convertHtml;H2E.convertHtml=(...args)=>window.lastResult=fn(...args);}''')
    page.locator('#fileInput').set_input_files(['tests/fixtures-v1.5.html','tests/fixtures-v1.5.css'])
    expect(page.locator('#pane-source')).to_be_visible()
    source=page.frame_locator('#sourceFrame')
    source.locator('#stack').wait_for()
    assert page.evaluate('typeof window.lastResult')=='undefined','No output before Convert'
    assert not source.locator('body').evaluate('()=>Boolean(window.inputExecuted)')
    # Browser cascade and input preview, before any conversion.
    expect(source.locator('#first')).to_have_css('font-size','18px')
    expect(source.locator('#first')).to_have_css('padding-top','0px')
    # Manually classify a DIV as Button and edit its text/link.
    source.locator('#convertme').click()
    page.locator('#sourceType').select_option('button')
    page.locator('#sourceText').fill('Chosen button')
    page.locator('#sourceLink').fill('https://example.com/chosen')
    page.click('#sourceApply')
    expect(source.locator('#convertme')).to_have_text('Chosen button')
    # Add a mobile-only spacing edit without damaging desktop CSS.
    page.click('[data-source-width="375"]')
    source.locator('#second').click()
    page.locator('#sourceScope').select_option('mobile')
    page.locator('[data-source-style="margin"]').fill('0 0 7px 0')
    page.click('#sourceApply')
    expect(source.locator('#second')).to_have_css('margin-bottom','7px')
    page.click('[data-source-width="1200"]')
    expect(source.locator('#second')).to_have_css('margin-bottom','24px')
    page.click('#sourceConvert')
    output=page.frame_locator('#liveDocument')
    output.locator('#stack').wait_for()
    result=page.evaluate('lastResult');nodes=list(walk(result['template']['content']))
    byid=lambda id:next(n for n in nodes if n['settings'].get('_element_id')==id)
    button=byid('convertme')
    assert button['widgetType']=='button'
    assert button['settings']['text']=='Chosen button'
    assert button['settings']['link']['url']=='https://example.com/chosen'
    assert byid('raw')['widgetType']=='html','Explicit HTML override wins heuristic SVG recognition'
    assert byid('generic-icon')['widgetType']=='icon'
    assert byid('remix')['widgetType']=='icon'
    assert sum(n.get('widgetType')=='icon' for n in nodes)>=3
    assert byid('rank')['settings']['_element_custom_width']['size']==40,byid('rank')
    assert byid('first')['settings']['typography_font_size']['size']==18
    assert byid('second')['settings']['_margin_mobile']['bottom']=='7'
    # Compare real source and output in identical viewport widths, excluding intentionally retyped nodes.
    comparisons={}
    rect='''e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,padding:s.padding,margin:s.margin,font:s.fontSize,display:s.display}}'''
    for device,width in [('desktop',1200),('tablet',768),('mobile',375)]:
        page.click('[data-tab="source"]')
        page.locator('#sourceWidth').fill(str(width));page.locator('#sourceWidth').dispatch_event('change')
        expect(source.locator('body')).to_be_visible()
        expected={id:source.locator('#'+id).evaluate(rect) for id in ['title','first','second']}
        actualSourceWidth=page.locator('#sourceFrame').evaluate('e=>e.contentWindow.innerWidth');assert actualSourceWidth==width
        page.click('[data-tab="live"]');page.click('[data-device="'+device+'"]')
        expect(output.locator('#first')).to_be_visible()
        page.wait_for_timeout(100)
        assert page.locator('#liveDocument').evaluate('e=>e.contentWindow.innerWidth')==width
        actual={id:output.locator('#'+id).evaluate(rect) for id in expected}
        for id in expected:
            for key in ['x','y','width','height']:
                assert abs(actual[id][key]-expected[id][key])<=1.1,(device,id,key,expected[id],actual[id])
        comparisons[device]={'source':expected,'output':actual}
    # Output text -> native button -> undo restores original type/content/spacing.
    page.click('[data-device="desktop"]')
    page.evaluate('id=>H2EPreview.select(id)',byid('first')['id'])
    page.locator('#widgetTypeTarget').select_option('button');page.click('#applyWidgetType')
    expect(output.locator('#first .elementor-button')).to_be_visible()
    changed=page.evaluate('lastResult.template');changedNodes=list(walk(changed['content']))
    first=next(n for n in changedNodes if n['id']==byid('first')['id'])
    assert first['widgetType']=='button' and first['settings']['text']=='First paragraph for comparison.'
    assert 'button' in page.evaluate('lastResult.jsonText')
    assert page.evaluate('JSON.stringify(lastResult.clipboard.elements)===JSON.stringify(lastResult.template.content)')
    page.click('#undoWidgetType')
    expect(output.locator('#first .elementor-text-editor')).to_be_visible()
    restored=page.evaluate('lastResult.template');restoredFirst=next(n for n in walk(restored['content']) if n['id']==byid('first')['id'])
    assert restoredFirst==byid('first')
    # HTML containing SVG -> empty native Icon; undo preserves exact original HTML.
    page.evaluate('id=>H2EPreview.select(id)',byid('raw')['id'])
    page.locator('#widgetTypeTarget').select_option('icon');page.click('#applyWidgetType')
    expect(output.locator('#raw .h2e-icon-placeholder')).to_be_visible()
    raw=next(n for n in walk(page.evaluate('lastResult.template.content')) if n['id']==byid('raw')['id'])
    assert raw['widgetType']=='icon' and raw['settings']['selected_icon']=={'value':'','library':''}
    assert 'html' not in raw['settings']
    page.click('#undoWidgetType')
    raw=next(n for n in walk(page.evaluate('lastResult.template.content')) if n['id']==byid('raw')['id'])
    assert raw==byid('raw')
    assert not output.locator('body').evaluate('()=>Boolean(window.inputExecuted)')
    assert any('inputExecuted' in n['settings'].get('html','') for n in nodes)
    scroll=output.locator('body').evaluate('()=>{document.scrollingElement.scrollTop=2000;return {top:document.scrollingElement.scrollTop,height:document.scrollingElement.scrollHeight,client:document.scrollingElement.clientHeight}}')
    assert scroll['top']>0
    # Undo source edit invalidates stale exports; current input stays editable.
    page.click('[data-tab="source"]');page.click('#sourceUndo')
    page.click('[data-source-width="375"]')
    expect(source.locator('#second')).to_have_css('margin-bottom','10px')
    page.screenshot(path='tests/preview-v1.5.png',full_page=True)
    assert not errors,errors
    report={'status':'PASS','checks':['input preview before conversion','source widget type override','source text and URL edit','device-specific source spacing edits','CSS link/style order','CSS specificity + important for percentage widths','generic SVG and nav inline icons are native empty icons','source/output pixel rect comparison at 1200/768/375','output text-to-button and undo','output HTML-to-icon and undo','JSON and clipboard live sync','script retention/no execution in either frame','iframe page scroll','source undo and stale-output invalidation'], 'comparisons':comparisons,'scroll':scroll,'consoleErrors':errors}
    Path('tests/report-v1.5.0.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
    b.close()
