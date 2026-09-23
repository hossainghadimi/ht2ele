/* HTML2Elementor 1.8 — shared AI chat + HTML editing for stage 1 (image→HTML) and stage 2 (HTML→Elementor). */
(function(g){
'use strict';

const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

async function api(path,data){
const response=await fetch('/api/ai/'+path,{
method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-H2E-Client':'1'},
body:data===undefined?undefined:JSON.stringify(data)}
);
const value=await response.json().catch(()=>({}));
if(!response.ok)throw Error(value.error||('خطای سرویس AI ('+response.status+')'));
return value;
}

const SYS='شما ویراستار HTML/CSS یک طراحی وب هستید که خروجی‌اش وارد المنتور می‌شود. قواعد: ۱) فقط یک سند HTML کامل و به‌روز داخل یک بلوک ```html برگردانید و هیچ توضیح بیرونی ننویسید. ۲) ساختار کلی، کلاس‌ها (به‌ویژه کلاس‌های vl-*) و استایل‌های اینلاین را حفظ کنید و فقط چیزی که کاربر خواسته را تغییر دهید. ۳) متن فارسی/عربی را دقیق حفظ کنید مگر کاربر خواسته باشد. ۴) اسکریپت، iframe یا URL خارجی جدید اضافه نکنید. ۵) اگر درخواست قابل اجرا نیست، سند را بدون تغییر برگردانید.';

function extractHTML(text){
const t=String(text??'');
const fences=[...t.matchAll(/```(?:html)?\s*([\s\S]*?)```/gi)].map(m=>m[1].trim()).filter(s=>s.includes('<'));
if(fences.length){
fences.sort((a,b)=>b.length-a.length);
if(/<!doctype|<html|<body/i.test(fences[0]))return fences[0];
}
const m=t.match(/<!doctype html[\s\S]*<\/html>/i)||t.match(/<html[\s\S]*<\/html>/i);
if(m)return m[0];
const s=t.trim();
if(s.length>200&&/^<(?:!doctype|html)/i.test(s))return s;
throw Error('پاسخ مدل HTML کامل نبود؛ درخواست را واضح‌تر تکرار کنید (دقیقاً بگویید کدام بخش تغییر کند).');
}

async function status(){return api('status');}

async function editHTML(instruction,html,opts={}){
const st=await status();
if(!st||st.engine!=='ready')throw Error('ابتدا یک مدل GGUF را در «کارگاه AI» اجرا کنید؛ برای چت، مدل متنی روی CPU کافی است.');
const parts=[{type:'text',text:'سند فعلی:\n<<<HTML\n'+String(html).slice(0,80000)+'\nHTML>>>\n\nدرخواست کاربر: '+String(instruction)}];
if(opts.image&&st.active_model&&st.active_model.vision)parts.push({type:'image_url',image_url:{url:opts.image}});
const history=(Array.isArray(opts.history)?opts.history:[]).slice(-6);
const messages=[{role:'system',content:SYS},...history,{role:'user',content:parts}];
const r=await api('chat',{messages,max_tokens:8192,temperature:0.2});
return {html:extractHTML(r.text),raw:r.text||''};
}

function mount(host,ctx){
if(!host||host.dataset.h2eChatMounted)return null;
host.dataset.h2eChatMounted='1';
host.innerHTML='<div class="h2e-chat" dir="rtl"><div class="h2e-chat-head"><b>'+(ctx.title||'ویرایش با هوش مصنوعی')+'</b><small>مدل کاملاً محلی؛ خروجی مدل همیشه پیش از اعمال نمایش داده می‌شود</small><button type="button" class="mini" data-act="clear">پاک کردن گفت‌وگو</button></div><div class="h2e-chat-msgs" role="log" aria-live="polite"><div class="h2e-chat-bubble hint">تغییر موردنظر را بنویسید؛ مثلاً: «دکمه‌ها را آبی کن» یا «یک سکشن تماس با ما پایین صفحه اضافه کن». (Ctrl+Enter برای ارسال)</div></div><textarea class="h2e-chat-input" rows="2" placeholder="تغییر موردنظر را بنویسید…"></textarea><div class="h2e-chat-actions"><button type="button" class="btn btn-primary" data-act="send">ارسال به مدل</button><span class="muted" data-role="hint"></span></div></div>';
const msgs=host.querySelector('.h2e-chat-msgs');
const input=host.querySelector('.h2e-chat-input');
const sendBtn=host.querySelector('[data-act="send"]');
let history=[];
let pending=null;
function say(kind,text){
const d=document.createElement('div');
d.className='h2e-chat-bubble '+kind;
d.textContent=text;
msgs.appendChild(d);
msgs.scrollTop=msgs.scrollHeight;
return d;
}
function preview(html){
if(pending)pending.remove();
const box=document.createElement('div');
box.className='h2e-chat-pending';
box.innerHTML='<div class="h2e-chat-pending-body"><small>پیش‌نمایش تغییر مدل — هنوز اعمال نشده است:</small><iframe sandbox="allow-same-origin" title="پیش‌نمایش تغییر"></iframe></div><div class="h2e-chat-actions"><button type="button" class="btn btn-primary" data-p="apply">اعمال تغییر</button><button type="button" class="btn btn-ghost danger" data-p="discard">رد کردن</button></div>';
box.querySelector('iframe').srcdoc=html;
box.querySelector('[data-p="apply"]').onclick=()=>{
try{ctx.applyHtml(html);}
catch(e){say('error',e.message);return;}
box.remove();pending=null;
say('ok','تغییر اعمال شد.'+(ctx.afterApply||''));
history.push({role:'assistant',content:'(تغییر اعمال شد)'});
};
box.querySelector('[data-p="discard"]').onclick=()=>{
box.remove();pending=null;
say('ok','تغییر رد شد؛ سند قبلی حفظ شد.');
};
msgs.appendChild(box);
msgs.scrollTop=msgs.scrollHeight;
pending=box;
}
async function send(){
const text=input.value.trim();
if(!text||sendBtn.disabled)return;
input.value='';
say('user',text);
sendBtn.disabled=true;
const wait=say('ai','در حال پردازش توسط مدل محلی…');
try{
let html;
try{html=ctx.getHtml();}
catch(e){wait.remove();say('error',e.message);sendBtn.disabled=false;return;}
const r=await editHTML(text,html,{image:ctx.getImage?ctx.getImage():null,history});
wait.remove();
history.push({role:'user',content:text});
preview(r.html);
}
catch(e){
wait.remove();
say('error',e.message);
}
finally{sendBtn.disabled=false;}
}
sendBtn.addEventListener('click',send);
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();send();}});
host.querySelector('[data-act="clear"]').addEventListener('click',()=>{
if(pending){pending.remove();pending=null;}
history=[];
msgs.replaceChildren();
const d=document.createElement('div');
d.className='h2e-chat-bubble hint';
d.textContent='گفت‌وگو پاک شد.';
msgs.appendChild(d);
});
ctx.onMount&&ctx.onMount();
return {send};
}

g.H2EChat={mount,editHTML,extractHTML,api,status};
})(window);
