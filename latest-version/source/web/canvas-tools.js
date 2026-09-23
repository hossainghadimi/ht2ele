/* Handles live only in sandbox preview documents; never in exported HTML. */
(function(g){
 const media={desktop:'(min-width:1025px)',tablet:'(min-width:768px) and (max-width:1024px)',mobile:'(max-width:767px)'};
 function bind(doc,api){
  doc.getElementById('h2e-canvas-tools')?.remove();
  const tools=doc.createElement('div');tools.id='h2e-canvas-tools';tools.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:14px Arial;direction:ltr';
  tools.innerHTML='<button data-tool="move" title="Drag: reorder siblings in this viewport">⠿</button><button data-tool="resize" title="Resize in this viewport">↘</button><span data-tool="note"></span>';
  doc.body.appendChild(tools);let selected=null,busy=false;
  const move=tools.querySelector('[data-tool=move]'),resize=tools.querySelector('[data-tool=resize]'),note=tools.querySelector('[data-tool=note]');
  [move,resize].forEach(b=>{b.type='button';b.style.cssText='all:initial;position:fixed;pointer-events:auto;background:#2563eb;color:white;border:2px solid white;border-radius:6px;width:26px;height:26px;text-align:center;line-height:26px;font:20px Arial;cursor:grab;touch-action:none;box-sizing:border-box;z-index:2147483647';});
  note.style.cssText='position:fixed;top:4px;left:4px;background:#12213b;color:white;padding:5px;border-radius:4px;display:none;font:13px Arial';
  function position(){if(busy)return;const n=api.node();selected=n;if(!n){tools.style.display='none';return}tools.style.display='block';const r=n.getBoundingClientRect();move.style.left=Math.max(0,Math.min(doc.documentElement.clientWidth-28,r.left))+'px';move.style.top=Math.max(0,r.top-28)+'px';resize.style.left=Math.max(0,Math.min(doc.documentElement.clientWidth-28,r.right-14))+'px';resize.style.top=Math.max(0,Math.min(doc.documentElement.clientHeight-28,r.bottom-14))+'px';}
  [move,resize].forEach(button=>button.addEventListener('pointerdown',e=>{
   e.preventDefault();e.stopPropagation();if(!selected)return;busy=true;
   const n=selected,r=n.getBoundingClientRect(),x=e.clientX,y=e.clientY;let width=r.width,height=r.height;
   button.setPointerCapture(e.pointerId);
   const update=e=>{width=Math.max(20,Math.round(r.width+e.clientX-x));height=Math.max(20,Math.round(r.height+e.clientY-y));note.style.display='block';note.textContent=button===resize?`${width} × ${height} px`:'Drop on a sibling / رها کردن روی المان هم‌سطح';if(button===resize){button.style.left=Math.min(doc.documentElement.clientWidth-28,r.left+width-14)+'px';button.style.top=Math.min(doc.documentElement.clientHeight-28,r.top+height-14)+'px';}};
   const finish=e=>{button.removeEventListener('pointermove',update);button.removeEventListener('pointerup',finish);button.removeEventListener('pointercancel',cancel);busy=false;note.style.display='none';try{if(button===resize)api.resize(n,width,height);else{tools.style.visibility='hidden';const target=doc.elementFromPoint(e.clientX,e.clientY)?.closest(api.selector);tools.style.visibility='visible';if(target&&target!==n)api.move(n,target);}}catch(err){note.textContent=err.message;note.style.display='block';}position();};
   const cancel=()=>{busy=false;note.style.display='none';button.removeEventListener('pointermove',update);button.removeEventListener('pointerup',finish);button.removeEventListener('pointercancel',cancel);position();};
   button.addEventListener('pointermove',update);button.addEventListener('pointerup',finish);button.addEventListener('pointercancel',cancel);
  }));
  tools.addEventListener('click',e=>{e.preventDefault();e.stopPropagation()});
  doc.addEventListener('scroll',position,true);doc.defaultView.addEventListener('resize',position);doc.addEventListener('click',()=>setTimeout(position,0));position();doc.h2ePositionTools=position;
 }
 g.H2ECanvas={bind,media};
})(window);
