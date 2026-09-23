from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json

def walk(nodes):
    for n in nodes:
        yield n
        yield from walk(n.get('elements', []))

with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox'])
    page=b.new_page(viewport={'width':1600,'height':1000})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:7788')
    result=page.evaluate('''h=>{window.result=H2E.convertHtml(h,[],{mode:'hybrid'},'responsive.html');H2EPreview.setResults([result]);return result;}''',Path('tests/fixtures-v1.4.html').read_text())
    nodes=list(walk(result['template']['content']))
    byid=lambda id:next(n for n in nodes if n['settings'].get('_element_id')==id)
    bycls=lambda c:next(n for n in nodes if c in n['settings'].get('_css_classes','').split())
    assert not result['warnings'],result['warnings']
    icons=[n for n in nodes if n.get('widgetType')=='icon']
    assert len(icons)>=8,len(icons)
    for n in icons:
        assert n['settings']['selected_icon']=={'value':'','library':''}
        assert not n['settings'].get('icon')
    for id in ['empty-fa','empty-material','empty-bi','empty-svg','social-one','social-two']:
        assert byid(id)['widgetType']=='icon',byid(id)
    assert not any(n.get('widgetType') in ['icon-list','social-icons','icon-box'] for n in nodes)
    for id in ['svgbutton','rolebutton','submitbutton','linkbutton']:
        assert byid(id)['widgetType']=='button',byid(id)
    assert byid('linkbutton')['settings']['link']['url']=='#end'
    button=byid('svgbutton')['settings']
    assert button['button_text_padding']['left']=='22'
    assert button['button_text_padding_tablet']['left']=='15'
    assert button['button_text_padding_mobile']['left']=='12'
    assert button['border_width']['left']=='4'
    assert button['_margin_mobile']['left']=='0'
    assert button['border_width_mobile']['left']=='0'
    row=bycls('row')['settings']
    assert row['flex_direction']=='row-reverse'
    assert row['flex_direction_tablet']=='column'
    assert row['flex_gap_mobile']['size']==0
    assert row['padding']=={'unit':'custom','top':'12px','right':'4%','bottom':'12px','left':'4%','isLinked':False},row
    assert row['margin']['left']=='auto',row
    assert row['padding_mobile']['left']=='0' and row['border_width_mobile']['left']=='0',row
    assert row['border_radius']['right']=='20',row
    assert row['border_radius_mobile']['right']=='0'
    assert bycls('only-mobile')['settings']['hide_desktop']=='hidden-desktop'
    assert bycls('only-mobile')['settings']['hide_mobile']==''
    assert bycls('hide-mobile')['settings']['hide_mobile']=='hidden-mobile'
    assert bycls('desktop-width')['settings']['_element_custom_width_mobile']=={'unit':'custom','size':'auto'},bycls('desktop-width')
    assert bycls('grid')['settings']['grid_columns_grid_mobile']['size']==1
    assert any('window.inputScriptRan' in n['settings'].get('html','') for n in nodes)
    assert not page.evaluate('!!window.inputScriptRan')
    page.click('[data-tab="live"]')
    def loc(n):return page.frame_locator('#liveDocument').locator('[data-id="'+n['id']+'"]')
    expect(loc(bycls('only-mobile'))).to_have_css('display','none')
    assert page.frame_locator('#liveDocument').locator('.h2e-icon-placeholder').count()>=8
    expect(loc(byid('svgbutton')).locator('.elementor-button')).to_have_css('border-left-style','double')
    assert 'h2e-icon-placeholder' not in json.dumps(result['template'])
    samples={}
    for device in ['desktop','tablet','mobile']:
        page.click('[data-device="'+device+'"]')
        page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        samples[device]=loc(bycls('row')).evaluate('''e=>{const s=getComputedStyle(e);return {direction:s.flexDirection,gap:s.rowGap,padding:s.paddingLeft,border:s.borderLeftWidth,radius:s.borderTopRightRadius,width:e.getBoundingClientRect().width}}''')
    assert samples['desktop']['border']=='3px',samples
    assert samples['tablet']['border']=='2px',samples
    assert samples['mobile']['border']=='0px' and samples['mobile']['gap']=='0px',samples
    assert samples['mobile']['padding']=='0px'
    expect(loc(bycls('only-mobile'))).to_have_css('display','block')
    expect(loc(bycls('hide-mobile'))).to_have_css('display','none')
    inner=loc(byid('svgbutton')).locator('.elementor-button')
    assert inner.evaluate('e=>getComputedStyle(e).paddingLeft')=='12px'
    assert inner.evaluate('e=>getComputedStyle(e).borderLeftWidth')=='0px'
    # Manual icon choice really becomes a selected native icon in the JSON.
    page.evaluate('id=>H2EPreview.select(id)',byid('empty-fa')['id'])
    page.locator('.live-insp [data-k="selected_icon.value"]').fill('fas fa-heart')
    page.wait_for_timeout(250)
    chosen=page.evaluate('id=>{let found;function w(ns){for(const n of ns){if(n.id===id)found=n;w(n.elements||[])}}w(result.template.content);return found.settings.selected_icon}',byid('empty-fa')['id'])
    assert chosen=={'value':'fas fa-heart','library':'fa-solid'},chosen
    assert loc(byid('empty-fa')).locator('.fa-heart').count()==1
    # Editing only mobile dimensions must not mutate desktop.
    page.evaluate('id=>H2EPreview.select(id)',bycls('row')['id'])
    page.locator('.live-insp [data-tab="advanced"]').count() # tab selector differs by UI; use visible tab text below
    page.locator('.live-insp .itab').filter(has_text='پیشرفته').click()
    box=page.locator('.live-insp .ctl-box[data-k="padding"]')
    box.locator('[data-side="top"]').fill('17')
    page.wait_for_timeout(250)
    settings=page.evaluate('id=>{let found;function w(ns){for(const n of ns){if(n.id===id)found=n;w(n.elements||[])}}w(result.template.content);return found.settings}',bycls('row')['id'])
    assert settings['padding']['top']=='12px' and settings['padding_mobile']['top']=='17',settings
    # Desktop dimensions must remain responsive when preview is switched back.
    page.click('[data-device="desktop"]')
    scroll=page.evaluate('''()=>{const s=document.querySelector('#liveDocument').contentDocument.scrollingElement;s.scrollTop=2000;return {height:s.scrollHeight,client:s.clientHeight,top:s.scrollTop}}''')
    assert scroll['top']>0 and scroll['height']>scroll['client']
    page.evaluate("document.querySelector('#liveDocument').contentDocument.scrollingElement.scrollTop=0")
    page.screenshot(path='tests/regression-v1.5-v140.png',full_page=True)
    assert not errors,errors
    # Nonstandard source breakpoints must not be stretched to Elementor defaults.
    custom = page.evaluate("""() => H2E.convertHtml(`<style>body{margin:0}.breakbox{display:flex;flex-direction:row;padding:20px;border:3px solid red}.small{display:none}@media(max-width:900px){.breakbox{flex-direction:column;padding:10px}}@media(max-width:600px){.breakbox{padding:0;border:0}.small{display:block}}</style><div class="breakbox"><h2>A</h2><p>B</p></div><p class="small">Small only</p>`,[],{},'custom.html')""")
    cn=list(walk(custom['template']['content']))
    target=next(n for n in cn if 'breakbox' in n['settings'].get('_css_classes','').split())
    small=next(n for n in cn if 'small' in n['settings'].get('_css_classes','').split())
    testpage=b.new_page()
    # Emulate native Elementor stylesheet (not inline preview styles).
    markup='<div class="elementor"><div id="testbox" class="elementor-element '+target['settings']['_css_classes']+'">Box</div><div id="testsmall" class="elementor-element elementor-hidden-tablet '+small['settings']['_css_classes']+'">Small</div></div>'
    native='.elementor .elementor-element.breakbox{display:flex;flex-direction:row}@media(max-width:1024px){.elementor .elementor-element.breakbox{flex-direction:column}}@media(min-width:768px) and (max-width:1024px){.elementor-hidden-tablet{display:none!important}}'
    testpage.set_content('<style>'+native+'</style><style>'+custom['css']+'</style>'+markup)
    exported={}
    for width in [1100,950,850,650,500]:
        testpage.set_viewport_size({'width':width,'height':900})
        exported[width]=testpage.locator('#testbox').evaluate('e=>{const s=getComputedStyle(e);return [s.flexDirection,s.paddingLeft,s.borderLeftWidth]}')
        expect(testpage.locator('#testbox')).to_have_css('flex-direction','row' if width>900 else 'column')
        expect(testpage.locator('#testsmall')).to_have_css('display','none' if width>600 else 'block')
    assert exported[950][0]=='row' and exported[850][0]=='column',exported
    assert exported[500][1:]==['0px','0px'],exported
    assert exported[650][2]=='3px',exported
    testpage.close()
    report={'status':'PASS','checks':['native empty icons: FA/material/SVG/Bootstrap/social/list','native buttons: button/role/input/anchor/SVG','device padding-margin-border-radius and zero resets','mixed percent/px spacing and auto margins','grid and flex mobile settings','mobile-only content preserved','auto width restores on mobile','live mobile rendering','manual icon selection reflected in JSON','mobile editing does not mutate desktop','scripts retained without preview execution','vertical scroll','exported CSS: exact 900px/600px source breakpoints'], 'sourceBreakpoints':exported, 'iconCount':len(icons),'computedPreview':samples,'scroll':scroll,'consoleErrors':errors}
    Path('tests/regression-report-v1.5-v140.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
    b.close()
