/* Reversible widget type mapping. No source script is executed. */
(function(global){
  'use strict';
  const TYPES=[['text-editor','متن'],['heading','تیتر'],['button','دکمه'],['icon','آیکن خالی'],['html','HTML'],['image','تصویر']];
  const clone=x=>JSON.parse(JSON.stringify(x));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function retype(node,type){
    if(node.elType!=='widget'||!TYPES.some(x=>x[0]===type))throw new Error('تغییر نوع فقط برای ویجت‌های محتوایی پشتیبانی می‌شود.');
    if((node.elements||[]).length)throw new Error('برای حفظ محتوا، نوع ویجت دارای فرزند تغییر داده نشد. ابتدا ویجت داخلی را انتخاب کنید.');
    if(node.widgetType===type)return clone(node);
    const s=clone(node.settings||{}), result=clone(node), next={};
    const rich=s.html??s.editor??s.title??s.text??s.description_text??'';
    const doc=new DOMParser().parseFromString(String(rich),'text/html');
    doc.querySelectorAll('script,style').forEach(n=>n.remove());
    const label=doc.body.textContent.trim();
    const a=doc.querySelector('a[href]');
    const link=s.link?clone(s.link):{url:a?a.getAttribute('href'):''};
    const image=s.image?clone(s.image):{url:doc.querySelector('img')?.getAttribute('src')||'',id:0};
    Object.keys(s).forEach(k=>{
      if(k.startsWith('_')||/^hide_/.test(k)||/^typography_/.test(k)||/^(align|text_color|title_color|button_text_color|primary_color)(_|$)/.test(k))next[k]=s[k];
    });
    // Remove type-specific CSS hooks, not the original page's author classes.
    next._css_classes=String(next._css_classes||'').split(/\s+/).filter(c=>c && c!=='h2e-empty-icon'&&!c.startsWith('h2e-button-')).join(' ');
    for(const suffix of ['','_tablet','_mobile']){
      const oldpad=s['button_text_padding'+suffix]||s['_padding'+suffix];
      if(type==='button'){
        if(oldpad)next['button_text_padding'+suffix]=clone(oldpad);
        next['_padding'+suffix]={unit:'px',top:'0',right:'0',bottom:'0',left:'0',isLinked:true};
      }else if(oldpad)next['_padding'+suffix]=clone(oldpad);
      for(const base of ['border_border','border_width','border_color','border_radius']){
        const val=s['_'+base+suffix]??s[base+suffix];
        const k=(type==='button'||type==='image'?'':'_')+base+suffix;
        delete next['_'+base+suffix];if(val!=null)next[k]=clone(val);
      }
    }
    // Map shared surface styles between Advanced controls and native Button/Image groups.
    for(const suffix of ['', '_tablet','_mobile']){
      for(const base of ['background_background','background_color','background_image','background_position','background_size','background_repeat','background_color_b','background_gradient_type','background_gradient_angle','box_shadow_box_shadow','text_shadow_text_shadow']){
        const value=s['_'+base+suffix]??s[base+suffix];if(value!==undefined)next[(type==='button'?'':'_')+base+suffix]=clone(value);
      }
      const color=s['button_text_color'+suffix]||s['title_color'+suffix]||s['text_color'+suffix]||s['primary_color'+suffix];
      if(color)next[(( {button:'button_text_color',heading:'title_color',icon:'primary_color'})[type]||'text_color')+suffix]=color;
    }
    const color=s.button_text_color||s.title_color||s.text_color||s.primary_color;
    if(type==='button'){
      next.text=label||'دکمه';next.link=link;next.selected_icon={value:'',library:''};
      if(color)next.button_text_color=color;
      next.background_color=s.background_color||s._background_color||'transparent';
      next._css_classes=(next._css_classes+' h2e-retyped-button').trim();
    }else if(type==='heading'){
      next.title=esc(label);next.header_size=/^h[1-6]$/.test(s.header_size||'')?s.header_size:'h2';if(link.url)next.link=link;if(color)next.title_color=color;
    }else if(type==='text-editor'){
      next.editor=node.widgetType==='html'?doc.body.innerHTML:(s.editor|| (link.url?`<a href="${esc(link.url)}">${esc(label)}</a>`:esc(label)));if(color)next.text_color=color;
    }else if(type==='icon'){
      next.selected_icon={value:'',library:''};next.icon='';next.view='default';next.size=clone(s.size&&typeof s.size==='object'?s.size:s.typography_font_size||{unit:'px',size:24});if(color)next.primary_color=color;
      next._css_classes=(next._css_classes+' h2e-empty-icon').trim();
    }else if(type==='image'){
      next.image=image;next.image_size='full';next.caption_source='none';if(link.url){next.link=link;next.link_to='custom';}
    }else if(type==='html'){
      next.html=s.html??(node.widgetType==='image'?`<img src="${esc(image.url)}" alt="${esc(image.alt||'')}"/>`:node.widgetType==='button'?`<a href="${esc(link.url)}">${esc(label)}</a>`:s.editor||`<${s.header_size||'div'}>${esc(label)}</${s.header_size||'div'}>`);
    }
    result.widgetType=type;result.settings=next;result.elements=[];return result;
  }
  global.H2EWidgets={types:TYPES,retype};
})(window);
