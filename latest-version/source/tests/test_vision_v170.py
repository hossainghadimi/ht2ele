"""Contract/validation tests use explicit fixture model output, NOT an inference accuracy test."""
from pathlib import Path
import base64,io,json,sys,time,threading,copy
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'ai'))
from vision import normalize,prepare,Jobs,LayoutError
W,H=960,600
nodes=[]
def node(id,parent,type,box,text='',layout='column',**style):
    nodes.append({'id':id,'parent':parent,'type':type,'box':[box[0]/W*1000,box[1]/H*1000,(box[0]+box[2])/W*1000,(box[1]+box[3])/H*1000],'text':text,'layout':layout,'style':style})
node('header','','container',[40,24,880,64],layout='row',background='#ffffff',radius=14)
node('brand','header','heading',[64,40,160,30],'STUDIO',font_size=22,font_weight=700,color='#162d50')
node('icon','header','icon',[864,42,24,24],color='#162d50')
node('hero','','container',[40,112,880,360],layout='row',background='#eef3fb',radius=18)
node('copy','hero','container',[64,150,424,244])
node('heading','copy','heading',[64,156,400,90],'Design better.\nBuild faster.',font_size=32,font_weight=700,color='#172f50')
node('text','copy','text',[64,260,400,50],'Editable containers and widgets,\ncreated from your reference image.',font_size=16,color='#405878')
node('button','copy','button',[64,346,180,48],'Start building',font_size=16,font_weight=700,background='#e9387d',color='#ffffff',radius=12)
node('photo','hero','image',[552,154,336,230],'Artwork',radius=16)
node('footer','','container',[40,504,880,60],background='#ffffff')
node('footerText','footer','text',[64,520,700,22],'Every piece stays editable.',font_size=16,color='#405878')
reply={'title':'Vision contract fixture','direction':'ltr','nodes':nodes}
root,warnings,title,direction=normalize(json.dumps(reply),(0,0,W,H,W),0,(W,H))
scene={'schema':1,'image':{'width':W,'height':H},'title':title,'direction':direction,'children':[root],'warnings':warnings,'model':'TEST FIXTURE — NOT ACTUAL INFERENCE'}
(ROOT/'tests/vision-scene-fixture.json').write_text(json.dumps(scene,indent=2))
img=Image.new('RGB',(W,H),'#f6f8fc');draw=ImageDraw.Draw(img)
for n in nodes:
 x,y,w,h=[n['box'][0]*W/1000,n['box'][1]*H/1000,(n['box'][2]-n['box'][0])*W/1000,(n['box'][3]-n['box'][1])*H/1000];s=n['style']
 if s.get('background'):draw.rounded_rectangle([x,y,x+w,y+h],radius=s.get('radius',0),fill=s['background'])
 if n['type'] in ('text','heading','button'):
  font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',int(s.get('font_size',16)))
  draw.multiline_text((x+(16 if n['type']=='button' else 0),y+(12 if n['type']=='button' else 0)),n['text'],font=font,fill=s.get('color','#222222'),spacing=5)
 if n['type']=='icon':draw.rectangle([x,y+4,x+w,y+7],fill='#162d50');draw.rectangle([x,y+14,x+w,y+17],fill='#162d50')
 if n['type']=='image':
  draw.rounded_rectangle([x,y,x+w,y+h],radius=16,fill='#183964');draw.ellipse([x+34,y+28,x+195,y+190],fill='#72cabb');draw.polygon([(x+130,y+190),(x+250,y+20),(x+310,y+190)],fill='#efa58e')
img.save(ROOT/'tests/vision-design-fixture.png')
stream=io.BytesIO();img.save(stream,format='PNG');uri='data:image/png;base64,'+base64.b64encode(stream.getvalue()).decode()
size,tiles=prepare(uri);assert size==(W,H) and len(tiles)==1
# Structured output validation: cycle, non-container parent, duplicate id, NaN, bad bbox.
for change in ['cycle','parent','duplicate','nan','bounds','type']:
 bad=copy.deepcopy(reply)
 if change=='cycle':bad['nodes'][0]['parent']='copy';bad['nodes'][4]['parent']='header'
 if change=='parent':bad['nodes'][1]['parent']='button'
 if change=='duplicate':bad['nodes'][1]['id']='header'
 if change=='nan':bad['nodes'][1]['box'][0]=float('nan')
 if change=='bounds':bad['nodes'][1]['box'][2]=2000
 if change=='type':bad['nodes'][1]['type']='script'
 try:normalize(json.dumps(bad),(0,0,W,H,W),0,(W,H));raise AssertionError(change+' accepted')
 except LayoutError:pass
# The production job logic is exercised with an injected in-process test double only.
requests=[]
def fake_engine(payload):
 requests.append(payload)
 assert payload['messages'][1]['content'][1]['image_url']['url'].startswith('data:image/jpeg;base64,')
 assert payload['response_format']['schema']['properties']['nodes']
 return {'choices':[{'finish_reason':'stop','message':{'content':json.dumps(reply)}}]}
jobs=Jobs(lambda x:None);model={'id':'fixture','name':'TEST FIXTURE','vision':True}
r=jobs.start({'image':uri},model,fake_engine)
for _ in range(100):
 status=jobs.get(r['id'])
 if status['state'] in ('ready','error'):break
 time.sleep(.02)
assert status['state']=='ready',status;assert requests
# Cancellation cannot commit a late result.
gate=threading.Event()
def slow(payload):gate.wait(timeout=3);return fake_engine(payload)
r=jobs.start({'image':uri},model,slow);jobs.cancel(r['id']);gate.set();time.sleep(.1);assert jobs.get(r['id'])['state']=='canceled'
# Truncation retries once, then errors (never silently falls back to raster segmentation).
count=[0]
def truncated(payload):count[0]+=1;return {'choices':[{'finish_reason':'length','message':{'content':'{}'}}]}
r=jobs.start({'image':uri},model,truncated)
for _ in range(100):
 st=jobs.get(r['id'])
 if st['state']=='error':break
 time.sleep(.02)
assert st['state']=='error' and count[0]==2
# Tall screenshot: non-overlapping tiles and correct global coordinates.
f=io.BytesIO();Image.new('RGB',(300,1300),'white').save(f,format='PNG');size,tiles=prepare(base64.b64encode(f.getvalue()).decode());assert len(tiles)==4 and tiles[-1][0][1]==1260
(Path(ROOT/'tests/vision-backend-report-v1.7.0.json')).write_text(json.dumps({'status':'PASS','test_kind':'contract tests with explicitly injected fixture response, not Qwen visual accuracy','checks':['schema validation','cycle/parent/duplicate/type/NaN/bounds rejection','typed base64 image in model request','JSON schema transmitted','asynchronous result creation','cancellation rejects late result','truncation retry/error without fake fallback','tall image tiling coordinates']},indent=2))
print('Vision backend contract tests PASS')
