/* Input-first editor. The original document is kept separately from the inert iframe. */
(function (global) {
  'use strict';
  const TYPES = [['auto','تشخیص خودکار'],['container','کانتینر'],['heading','تیتر'],['text-editor','متن'],['button','دکمه'],['icon','آیکن خالی'],['image','تصویر'],['html','HTML'],['ignore','نادیده گرفتن']];
  const state = {files:[],css:[],images:[],records:new WeakMap(),index:0,width:1200,selected:null,onChange:null};
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key = () => 'h2es-'+Math.random().toString(16).slice(2,10);
  function rec() {
    const f = state.files[state.index]; if (!f) return null;
    let r=state.records.get(f);
    if (!r) {r={file:f,doc:new DOMParser().parseFromString(f.content,'text/html'),undo:[]};state.records.set(f,r);}
    [r.doc.body,...r.doc.body.querySelectorAll('*')].forEach(el=>{if(!el.hasAttribute('data-h2e-node'))el.setAttribute('data-h2e-node',key());});
    return r;
  }
  function original() {const r=rec(); return r && Array.from(r.doc.querySelectorAll('[data-h2e-node]')).find(n=>n.getAttribute('data-h2e-node')===state.selected);}
  function snapshot() {const r=rec(); if(r){r.undo.push(r.doc.documentElement.outerHTML);if(r.undo.length>30)r.undo.shift();}}
  function commit() {const r=rec();if(!r)return;r.file.content='<!doctype html>\n'+r.doc.documentElement.outerHTML;r.file.size=new TextEncoder().encode(r.file.content).length;if(state.onChange)state.onChange(r.file);paint();}
  function mount() {
    const host=$('#sourceHost');if(!host)return;
    host.innerHTML=`<div class="source-shell"><div class="source-toolbar"><select id="sourceFile" aria-label="فایل ورودی"></select><button type="button" data-source-width="1200">دسکتاپ ۱۲۰۰</button><button type="button" data-source-width="768">تبلت ۷۶۸</button><button type="button" data-source-width="375">موبایل ۳۷۵</button><label>عرض واقعی <input id="sourceWidth" type="number" min="240" max="2560" value="1200"/> px</label><button type="button" id="sourceUndo">بازگشت تغییر ورودی</button><button type="button" id="sourceConvert" class="btn btn-primary">تبدیل همین ورودی‌ها</button></div><p id="sourceNotice" class="source-notice">قبل از تبدیل، فایل را ببینید؛ برای تعیین نوع ویجت و اصلاح استایل روی المان کلیک کنید. اسکریپت‌ها در این پیش‌نمایش اجرا نمی‌شوند.</p><div class="source-body"><aside id="sourceInspector" class="source-inspector"></aside><div class="source-stage"><iframe id="sourceFrame" title="پیش‌نمایش و ویرایش ورودی پیش از تبدیل" sandbox="allow-same-origin"></iframe></div></div></div>`;
    $('#sourceFile').onchange=e=>{state.index=Number(e.target.value);state.selected=null;paint();};
    host.querySelectorAll('[data-source-width]').forEach(b=>b.onclick=()=>resize(Number(b.dataset.sourceWidth)));
    $('#sourceWidth').onchange=e=>resize(Number(e.target.value));
    $('#sourceUndo').onclick=()=>{const r=rec();if(r && r.undo.length){r.doc=new DOMParser().parseFromString(r.undo.pop(),'text/html');state.selected=null;commit();}};
    $('#sourceConvert').onclick=()=>$('#btnConvert').click();
    paint();
  }
  function resize(width) {state.width=Math.max(240,Math.min(2560,width||1200));$('#sourceWidth').value=state.width;$('#sourceFrame').style.width=state.width+'px';document.querySelectorAll('[data-source-width]').forEach(b=>b.classList.toggle('on',Number(b.dataset.sourceWidth)===state.width));setTimeout(inspect,60);}
  function cssForPreview(doc) {
    const base=n=>String(n||'').split(/[?#]/)[0].split(/[\\/]/).pop().toLowerCase();
    const used=new Set();const missing=[];
    doc.querySelectorAll('link[rel~="stylesheet"]').forEach(link=>{
      const f=state.css.find(f=>base(f.name)===base(link.getAttribute('href')));
      if(f){const style=doc.createElement('style');style.textContent=f.content;if(link.media)style.media=link.media;link.replaceWith(style);used.add(f);}else{missing.push(link.getAttribute('href'));link.remove();}
    });
    state.css.filter(f=>!used.has(f)).forEach(f=>{const st=doc.createElement('style');st.textContent=f.content;doc.head.appendChild(st);});
    return missing;
  }
  function paint() {
    if(!$('#sourceFrame'))return;
    const r=rec();const select=$('#sourceFile');
    select.innerHTML=state.files.map((f,i)=>`<option value="${i}" ${i===state.index?'selected':''}>${esc(f.name)}</option>`).join('');
    $('#sourceUndo').disabled=!r || !r.undo.length;
    $('#sourceConvert').disabled=!r && !state.images.length;
    const frame=$('#sourceFrame');
    if(!r){
      $('#sourceInspector').innerHTML='<p>برای شروع HTML و CSSهای مرتبط را اضافه کنید. تبدیل هنوز انجام نشده است.</p>';
      frame.srcdoc=state.images.length?`<html><body style="margin:0"><img style="max-width:100%" src="${esc(state.images[0].dataUrl)}"/><p>ورودی تصویر: فقط پیش‌نمایش؛ ویرایش ویجت پس از تبدیل ممکن است.</p></body></html>`:'<html dir="rtl"><body style="font:16px Tahoma;padding:36px;color:#777">پیش‌نمایش ورودی، قبل از تبدیل</body></html>';
      return;
    }
    const d=new DOMParser().parseFromString(r.doc.documentElement.outerHTML,'text/html');
    const missing=cssForPreview(d);
    d.querySelectorAll('script,base,meta[http-equiv],iframe,object,embed').forEach(n=>n.remove());
    d.querySelectorAll('*').forEach(n=>Array.from(n.attributes).forEach(a=>{if(/^on/i.test(a.name)||a.name==='srcdoc'||(/^(href|src|action|xlink:href)$/i.test(a.name)&&/^\s*javascript:/i.test(a.value)))n.removeAttribute(a.name);}));
    const csp=d.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="script-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";d.head.prepend(csp);
    const fallback=d.createElement('style');fallback.textContent=(global.H2E_ICON_CSS||'');d.head.prepend(fallback);
    const editing=d.createElement('style');editing.textContent='[data-h2e-node]{cursor:pointer}[data-h2e-selected]{outline:2px solid #ad1457!important;outline-offset:2px!important}';d.head.appendChild(editing);
    $('#sourceNotice').textContent=missing.length?'CSS همراه پیدا نشد: '+missing.join('، ')+' — این فایل‌ها را هم وارد کنید.':'قبل از تبدیل: روی المان کلیک کنید، نوع ویجت و استایل را اصلاح کنید. تغییرات فقط روی نسخه کاری است؛ فایل اصلی دیسک عوض نمی‌شود.';
    const oldScroll=frame.contentDocument && frame.contentDocument.scrollingElement ? frame.contentDocument.scrollingElement.scrollTop:0;
    frame.onload=()=>{
      const fd=frame.contentDocument;if(!fd)return;
      fd.addEventListener('click',e=>{if(e.target.closest('#h2e-canvas-tools'))return;e.preventDefault();e.stopPropagation();let n=e.target.closest('svg')||e.target.closest('[data-h2e-node]');if(!n)return;state.selected=n.getAttribute('data-h2e-node');mark();inspect();},true);
      fd.addEventListener('submit',e=>e.preventDefault());fd.scrollingElement.scrollTop=oldScroll;mark();inspect();if(global.H2ECanvas)H2ECanvas.bind(fd,{selector:'[data-h2e-node]',node:()=>fd.querySelector('[data-h2e-selected]'),move:(n,t)=>moveSource(n,t),resize:(n,w,h)=>resizeSource(n,w,h)});
    };
    frame.srcdoc='<!doctype html>'+d.documentElement.outerHTML;resize(state.width);
  }
  function mark(){const fd=$('#sourceFrame').contentDocument;if(!fd)return;fd.querySelectorAll('[data-h2e-selected]').forEach(n=>n.removeAttribute('data-h2e-selected'));const n=Array.from(fd.querySelectorAll('[data-h2e-node]')).find(n=>n.getAttribute('data-h2e-node')===state.selected);if(n)n.setAttribute('data-h2e-selected','');fd.h2ePositionTools?.();}
  function inspect() {
    const host=$('#sourceInspector');if(!host)return;const n=original();
    if(!n){host.innerHTML='<h3>ویرایش ورودی</h3><p>روی یک المان در صفحه کلیک کنید. تغییرات نوع ویجت هنگام تبدیل اعمال می‌شود.</p><p>عرض iframe واقعی است؛ CSS ریسپانسیو ورودی با همان مرورگر اجرا می‌شود.</p>';return;}
    const fd=$('#sourceFrame').contentDocument;const view=fd && Array.from(fd.querySelectorAll('[data-h2e-node]')).find(e=>e.getAttribute('data-h2e-node')===state.selected);
    const cs=view?fd.defaultView.getComputedStyle(view):null;
    const type=n.getAttribute('data-h2e-widget')||'auto';const plain=n.children.length===0;
    host.innerHTML=`<h3>${esc(n.tagName.toLowerCase())}${n.id?' #'+esc(n.id):''}</h3><p class="muted">تشخیص پیشنهادی: ${esc(global.H2E && H2E.suggestWidget ? H2E.suggestWidget(n):'auto')}</p><label>نوع ویجت خروجی<select id="sourceType">${TYPES.map(([v,l])=>`<option value="${v}" ${type===v?'selected':''}>${l}</option>`).join('')}</select></label><p class="muted">«آیکن خالی» هرگز به HTML یا نماد از پیش انتخاب‌شده تبدیل نمی‌شود.</p><label>متن${plain?'':' (دارای فرزند؛ ویرایش کد را استفاده کنید)'}<textarea id="sourceText" rows="3" ${plain?'':'disabled'}>${esc(n.textContent)}</textarea></label><label>پیوند دکمه / لینک<input id="sourceLink" dir="ltr" value="${esc(n.getAttribute('href')||n.getAttribute('data-h2e-link')||'')}"/></label><label>دامنه تغییر استایل<select id="sourceScope"><option value="all">همه اندازه‌ها</option><option value="tablet" ${state.width<=1024&&state.width>767?'selected':''}>تبلت — ۷۶۸ تا ۱۰۲۴</option><option value="mobile" ${state.width<=767?'selected':''}>موبایل — تا ۷۶۷</option></select></label><p class="muted">مقدار خالی یعنی بدون تغییر. واحد CSS مثل px، %، rem یا auto را بنویسید.</p>${[['margin','Margin'],['padding','Padding'],['gap','Gap'],['border','Border'],['font-size','Font size'],['width','Width'],['height','Height'],['display','Display'],['flex-direction','Flex direction']].map(([k,l])=>`<label>${l}<input data-source-style="${k}" dir="ltr" placeholder="${esc(cs?cs.getPropertyValue(k):'')}"/></label>`).join('')}<button type="button" class="btn btn-primary" id="sourceApply">اعمال روی ورودی</button><button type="button" class="btn btn-ghost danger" id="sourceDelete">حذف المان</button><button type="button" class="btn btn-ghost" id="sourceParent">انتخاب والد</button><details><summary>ویرایش HTML داخلی</summary><textarea id="sourceMarkup" dir="ltr" rows="8">${esc(n.innerHTML)}</textarea><button type="button" class="btn btn-ghost" id="sourceApplyMarkup">اعمال کد داخلی</button><small>این کار فرزندان انتخاب‌شده را جایگزین می‌کند؛ بازگشت تغییر در دسترس است.</small></details>`;
    $('#sourceDelete').onclick=()=>{if(n===rec().doc.body){alert('حذف کل بدنه مجاز نیست. فرزند را انتخاب کنید.');return}snapshot();n.remove();state.selected=null;commit();};
    $('#sourceParent').onclick=()=>{if(n.parentElement && n.parentElement.hasAttribute('data-h2e-node')){state.selected=n.parentElement.getAttribute('data-h2e-node');mark();inspect();}};
    $('#sourceApply').onclick=()=>{
      const values=Array.from(host.querySelectorAll('[data-source-style]')).filter(x=>x.value.trim());
      host.querySelectorAll('[data-source-style]').forEach(x=>x.setCustomValidity(''));
      for(const input of values)if(!CSS.supports(input.dataset.sourceStyle,input.value.trim())){input.setCustomValidity('مقدار CSS معتبر نیست');input.reportValidity();return;}
      snapshot();const chosen=$('#sourceType').value;if(chosen==='auto')n.removeAttribute('data-h2e-widget');else n.setAttribute('data-h2e-widget',chosen);
      if(plain)n.textContent=$('#sourceText').value;
      const url=$('#sourceLink').value.trim();if(url)n.setAttribute(n.tagName==='A'?'href':'data-h2e-link',url);else{n.removeAttribute('href');n.removeAttribute('data-h2e-link');}
      const scope=$('#sourceScope').value;
      if(values.length)sourceCSS(n,Object.fromEntries(values.map(x=>[x.dataset.sourceStyle,x.value.trim()])),scope);
      commit();
    };
    $('#sourceApplyMarkup').onclick=()=>{snapshot();n.innerHTML=$('#sourceMarkup').value;commit();};
  }
  function sourceNode(id){return rec().doc.querySelector('[data-h2e-node="'+id+'"]');}
  function device(){return state.width<=767?'mobile':state.width<=1024?'tablet':'desktop';}
  function sourceCSS(n,props,dev=device()){
    const cls=n.getAttribute('data-h2e-node');n.classList.add(cls);
    const selector=':is(#h2e-edit-a#h2e-edit-b#h2e-edit-c,.'+cls+')';
    const baseline={};for(const k of Object.keys(props))if(n.style.getPropertyPriority(k)==='important'){baseline[k]=n.style.getPropertyValue(k);n.style.removeProperty(k);}
    const rule=p=>selector+'{'+Object.entries(p).map(([k,v])=>k+':'+v+'!important').join(';')+'}';
    const st=rec().doc.createElement('style');st.dataset.h2eEdit='';st.textContent=(Object.keys(baseline).length?rule(baseline):'')+(dev==='all'?rule(props):'@media '+H2ECanvas.media[dev]+'{'+rule(props)+'}');rec().doc.head.appendChild(st);
  }
  function resizeSource(view,w,h){const n=sourceNode(view.dataset.h2eNode);if(n===rec().doc.body)throw new Error('اندازهٔ فرزند را تغییر دهید، نه بدنهٔ کل صفحه');snapshot();sourceCSS(n,{width:w+'px',height:h+'px','box-sizing':'border-box','flex-shrink':'0','max-width':'none'});commit();}
  function moveSource(view,target){const n=sourceNode(view.dataset.h2eNode),t=sourceNode(target.dataset.h2eNode);if(n===rec().doc.body||n.parentElement!==t.parentElement)throw new Error('فقط المان‌های هم‌سطح قابل جابه‌جایی‌اند');const cs=view.ownerDocument.defaultView.getComputedStyle(view);if(/absolute|fixed/.test(cs.position))throw new Error('المان با موقعیت absolute/fixed: از تنظیمات موقعیت استفاده کنید');const par=n.parentElement,pv=view.parentElement,fd=view.ownerDocument;const nodes=[...par.children].filter(e=>e.hasAttribute('data-h2e-node'));nodes.sort((a,b)=>{const A=fd.querySelector('[data-h2e-node="'+a.dataset.h2eNode+'"]'),B=fd.querySelector('[data-h2e-node="'+b.dataset.h2eNode+'"]');return (parseInt(fd.defaultView.getComputedStyle(A).order)||0)-(parseInt(fd.defaultView.getComputedStyle(B).order)||0)});const to=nodes.indexOf(t);nodes.splice(nodes.indexOf(n),1);nodes.splice(to,0,n);snapshot();if(!/flex|grid/.test(fd.defaultView.getComputedStyle(pv).display))sourceCSS(par,{display:'flex','flex-direction':'column'});nodes.forEach((e,i)=>sourceCSS(e,{order:i}));commit();}
  function selection(){const n=original();if(!n)return null;return {kind:'html',html:n.outerHTML};}
  function current(){return state.files[state.index]||null;}
  function replaceCurrent(html){
    const f=state.files[state.index];
    if(!f||typeof html!=='string'||!html.trim())return false;
    const r=rec();
    snapshot();
    const doc=new DOMParser().parseFromString(html,'text/html');
    [doc.body,...doc.body.querySelectorAll('*')].forEach(el=>{if(!el.hasAttribute('data-h2e-node'))el.setAttribute('data-h2e-node',key());});
    r.doc=doc;
    state.selected=null;
    commit();
    return true;
  }
  function applyType(type){const n=original();if(!n||!TYPES.some(t=>t[0]===type))return false;snapshot();n.setAttribute('data-h2e-widget',type);commit();return true;}
  function setFiles(files,css,images,onChange){state.files=files||[];state.css=css||[];state.images=images||[];state.onChange=onChange||state.onChange;state.index=Math.min(state.index,Math.max(0,state.files.length-1));if(!$('#sourceFrame'))mount();else paint();}
  global.H2ESource={mount,setFiles,refresh:paint,selection,applyType,current,replaceCurrent};
})(window);
