/* Validated semantic scene -> native Elementor via the measured HTML converter. */
(function(g){
'use strict';
const types=['container','heading','text','button','image','icon','divider'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):min));
const color=v=>/^#[0-9a-f]{6}$/i.test(v||'')?v:null;
function flatten(scene){const a=[];const visit=n=>{a.push(n);(n.children||[]).forEach(visit)};(scene.children||[]).forEach(visit);return a;}
function validate(scene){
 if(scene?.schema!==1||!Array.isArray(scene.children)||!Number.isFinite(scene.image?.width)||!Number.isFinite(scene.image?.height))throw Error('ساختار تحلیل معتبر نیست');
 const seen=new Set();let count=0;
 function walk(n,d){if(d>10||++count>160||!types.includes(n.type)||!/^[-a-zA-Z0-9_]{1,48}$/.test(n.id)||seen.has(n.id))throw Error('نوع، عمق یا شناسهٔ المان معتبر نیست');seen.add(n.id);if(!Array.isArray(n.box)||n.box.length!==4||n.box.some(v=>!Number.isFinite(v))||n.box[2]<=0||n.box[3]<=0)throw Error('کادر المان معتبر نیست');if(n.type!=='container'&&(n.children||[]).length)throw Error('فقط کانتینر می‌تواند فرزند داشته باشد');(n.children||[]).forEach(c=>walk(c,d+1));}
 scene.children.forEach(n=>walk(n,0));return scene;
}
async function imageCanvas(uri){const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error('تصویر خوانده نشد'));i.src=uri});if(img.naturalWidth*img.naturalHeight>60000000||Math.max(img.naturalWidth,img.naturalHeight)>32767)throw Error('تصویر بسیار بزرگ است؛ ابتدا آن را به سکشن‌های کوچک‌تر تقسیم کنید');const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);return canvas;}
async function prepare(file){const c=await imageCanvas(file.dataUrl);if(c.width*c.height>60000000)throw Error('تصویر ورودی بیش از حد بزرگ است؛ ابتدا آن را کوچک‌تر کنید');const scale=Math.min(1,1600/c.width,12000/c.height,Math.sqrt(16000000/(c.width*c.height)));let canvas=c;if(scale<1){canvas=document.createElement('canvas');canvas.width=Math.round(c.width*scale);canvas.height=Math.round(c.height*scale);canvas.getContext('2d').drawImage(c,0,0,canvas.width,canvas.height);}let dataUrl=canvas.toDataURL('image/png');if(dataUrl.length>10500000)dataUrl=canvas.toDataURL('image/jpeg',.88);if(dataUrl.length>10500000)throw Error('تصویر هنوز بزرگ است؛ آن را به سکشن‌های کوچک‌تر تقسیم کنید');return {...file,dataUrl,width:canvas.width,height:canvas.height,resized:scale<1};}
async function build(scene,file,options={}){
 validate(scene);const canvas=await imageCanvas(file.dataUrl);
 if(canvas.width!==scene.image.width||canvas.height!==scene.image.height)throw Error('اندازهٔ تصویر با تحلیل همخوان نیست؛ دوباره تحلیل کنید');
 const W=scene.image.width,S=Math.min(1,1200/W),rtl=(options.visionDirection||scene.direction)==='rtl';const rules=[],mobile=[],assets=[],notes=[...(scene.warnings||[])];
 const css=(cls,props)=>rules.push('.'+cls+'{'+Object.entries(props).map(([k,v])=>k+':'+v).join(';')+'}');
 function crop(n){const [x,y,w,h]=n.box;const left=num(Math.floor(x),0,canvas.width-1),top=num(Math.floor(y),0,canvas.height-1),width=num(Math.ceil(w),1,canvas.width-left),height=num(Math.ceil(h),1,canvas.height-top);const c=document.createElement('canvas');const factor=Math.min(1,1400/width,1400/height);c.width=Math.max(1,Math.round(width*factor));c.height=Math.max(1,Math.round(height*factor));c.getContext('2d').drawImage(canvas,left,top,width,height,0,0,c.width,c.height);const uri=c.toDataURL('image/jpeg',.9);const bin=Uint8Array.from(atob(uri.split(',')[1]),c=>c.charCodeAt(0));if(assets.reduce((sum,a)=>sum+a.data.length,0)+bin.length>12000000)throw Error('حجم عکس‌های استخراج‌شده بیش از ۱۲ مگابایت است؛ تصویر را به سکشن‌های کوچک‌تر تقسیم کنید');assets.push({name:'images/'+n.id+'.jpg',data:bin});return uri;}
 function render(n,parent,relation={}){
  const cls='vl-'+n.id,st=n.style||{},[x,y,w,h]=n.box;const style={'box-sizing':'border-box','min-width':'0','max-width':'100%','flex-shrink':'0',margin:'0',padding:'0',width:(relation.width??100)+'%'};
  if(relation.left>0)style['margin-left']=relation.left+'%';if(relation.right>0)style['margin-right']=relation.right+'%';if(relation.top>0)style['margin-top']=relation.top*S+'px';
  for(const [key,property] of [['color','color'],['background','background-color'],['border_color','border-color']])if(color(st[key]))style[property]=st[key];
  if(st.border_width>0){style['border-width']=num(st.border_width*S,0,16)+'px';style['border-style']='solid';}
  if(st.radius)style['border-radius']=num(st.radius*S,0,200)+'px';
  style['font-family']=rtl?'Tahoma,Arial,sans-serif':'Arial,sans-serif';style['font-size']=num((st.font_size|| (n.type==='heading'?32:16))*S,8,120)+'px';style['font-weight']=num(st.font_weight||(n.type==='heading'?700:400),100,900);style['line-height']='1.35';
  if(['left','right','center'].includes(st.align))style['text-align']=st.align;
  let content='',tag='div',extra='',hint=n.type==='text'?'text-editor':n.type;
  if(n.type==='container'){
   const children=[...(n.children||[])];const row=n.layout==='row';children.sort((a,b)=>row?(rtl?b.box[0]-a.box[0]:a.box[0]-b.box[0]):a.box[1]-b.box[1]);
   const bounds=children.length?{left:Math.min(...children.map(c=>c.box[0])),right:Math.max(...children.map(c=>c.box[0]+c.box[2])),top:Math.min(...children.map(c=>c.box[1])),bottom:Math.max(...children.map(c=>c.box[1]+c.box[3]))}:{left:x,right:x+w,top:y,bottom:y+h};
   const pad=[Math.max(0,bounds.top-y),Math.max(0,x+w-bounds.right),Math.max(0,y+h-bounds.bottom),Math.max(0,bounds.left-x)].map(v=>Math.min(v,300));const innerW=Math.max(1,w-pad[1]-pad[3]);
   style.display='flex';style['flex-direction']=row?'row':'column';style['align-items']='flex-start';style['flex-wrap']=row?'wrap':'nowrap';style.padding=pad.map(v=>Math.round(v*S)+'px').join(' ');style.gap='0';style['min-height']=Math.round(h*S)+'px';
   let previous=null;
   for(const child of children){let left=0,right=0,top=0;
    if(row){const gap=previous?(rtl?previous.box[0]-(child.box[0]+child.box[2]):child.box[0]-(previous.box[0]+previous.box[2])):0;if(gap<-3)notes.push('هم‌پوشانی در '+n.id+'؛ چیدمان جریان عادی نیاز به بازبینی دارد.');if(rtl)right=Math.max(0,gap)/innerW*100;else left=Math.max(0,gap)/innerW*100;top=Math.max(0,child.box[1]-(y+pad[0]));}
    else{top=Math.max(0,child.box[1]-(previous?previous.box[1]+previous.box[3]:y+pad[0]));if(rtl)right=Math.max(0,x+w-pad[1]-(child.box[0]+child.box[2]))/innerW*100;else left=Math.max(0,child.box[0]-(x+pad[3]))/innerW*100;}
    content+=render(child,n,{width:Math.min(100,child.box[2]/innerW*100),left,right,top});previous=child;
   }
   mobile.push('.'+cls+'{display:flex!important;flex-direction:column!important;flex-wrap:nowrap!important;gap:12px!important;padding:'+pad.map(v=>Math.min(20,Math.round(v*S))+'px').join(' ')+'!important}');
  }else if(n.type==='image'){tag='img';extra=' src="'+crop(n)+'" alt="'+esc(n.text||'تصویر استخراج‌شده از طرح')+'"';style.display='block';style.height='auto';}
  else if(n.type==='icon'){tag='i';style.display='block';style.height=Math.round(h*S)+'px';style['font-size']=Math.max(12,Math.min(w,h)*S)+'px';}
  else if(n.type==='divider'){tag='hr';hint='';style.height=Math.max(1,h*S)+'px';style['background-color']=color(st.background)||color(st.color)||'#cccccc';}
  else {tag=n.type==='heading'?'h2':n.type==='button'?'a':'p';content=esc(n.text||'').replace(/\n/g,'<br>');style['min-height']=Math.round(h*S)+'px';if(n.type==='button'){extra=' href=""';style.display='inline-flex';style['align-items']='center';style['justify-content']='center';style['text-decoration']='none';style['background-color']=color(st.background)||'transparent';}}
  css(cls,style);
  if(n.type==='heading')mobile.push('.'+cls+'{font-size:'+Math.min(30,Math.max(18,Number.parseFloat(style['font-size'])))+'px!important}');
  if(n.type==='icon')mobile.push('.'+cls+'{width:'+Math.max(16,Math.round(w*S))+'px!important;min-height:'+Math.round(h*S)+'px!important}');
  const attrs=' id="'+cls+'" class="'+cls+' vl-node '+(n.type==='container'?'vl-container':'')+'"'+(hint?' data-h2e-widget="'+hint+'"':'')+extra;
  return ['img','hr'].includes(tag)?'<'+tag+attrs+'>':'<'+tag+attrs+'>'+content+'</'+tag+'>';
 }
 let body='';let bottom=0;const rootWidth=Math.min(1200,W);for(const n of scene.children){body+=render(n,null,{width:n.box[2]/W*100,top:Math.max(0,n.box[1]-bottom)});bottom=n.box[1]+n.box[3];}
 const authorCSS='body{margin:0;background:#ffffff} .vl-page{width:'+rootWidth+'px;max-width:100%;margin:0 auto;display:flex;flex-direction:column;gap:0;box-sizing:border-box} '+rules.join('\n')+'\n@media(max-width:767px){.vl-node{width:100%!important;max-width:100%!important;min-height:0!important;margin:0!important;height:auto!important}'+mobile.join('\n')+'}';
 const html='<!doctype html><html dir="'+(rtl?'rtl':'ltr')+'"><head><meta charset="utf-8"><style>'+authorCSS+'</style></head><body><main class="vl-page" data-h2e-widget="container">'+body+'</main></body></html>';
 const result=H2E.convertHtml(html,[],{...options,title:scene.title||H2E.slug(file.name),rtl,keepClasses:true,scopeCss:false,mode:'native',layout:'container'},file.name+'.html');
 function walk(nodes){for(const n of nodes){if(n.widgetType==='button')n.settings.link={url:'',is_external:'',nofollow:''};if(n.widgetType==='icon'){n.settings.selected_icon={value:'',library:''};n.settings.icon='';}if(n.widgetType==='image'){n.settings.width={unit:'%',size:100};n.settings.width_tablet={unit:'%',size:100};n.settings.width_mobile={unit:'%',size:100};}walk(n.elements||[]);}}walk(result.template.content);
 result.css+='\n/* AI native button wrapper normalization */\n.elementor .vl-node.elementor-widget-button{padding:0!important;background:none!important;border:0!important;box-shadow:none!important}.elementor .vl-node.elementor-widget-button>.elementor-widget-container{width:100%}.elementor .vl-node.elementor-widget-button .elementor-button{width:100%;display:flex!important;align-items:center;justify-content:center}\n';
 for(const n of flatten(scene).filter(n=>n.type==='button'))result.css+='@media(min-width:768px){.elementor .vl-'+n.id+' .elementor-button{min-height:'+Math.round(n.box[3]*S)+'px}}\n';
 result.warnings=[...new Set([...notes,...(result.warnings||[]),'چیدمان موبایل پیشنهادی است؛ آن را دستی بازبینی کنید. لینک دکمه‌ها از تصویر معلوم نیست و خالی ساخته می‌شود.','تصاویر برش‌خورده در ZIP هستند؛ در وردپرس به رسانه منتقل و آدرس تصویر را جایگزین کنید.'])];
 result.fromImage=true;result.fromVision=true;result.analysis=JSON.parse(JSON.stringify(scene));result.assets=assets;result.reconstructedHTML=html;result.sourceName=file.name;result.base=H2E.slug(file.name);result.rtl=rtl;result.jsonText=JSON.stringify(result.template,null,2);result.clipboard={type:'elementor',siteurl:'',elements:result.template.content};result.clipText=JSON.stringify(result.clipboard,null,2);result.stats.cssBytes=result.css.length;
 return result;
}
g.H2EVisionLayout={prepare,build,validate,flatten};
})(window);
