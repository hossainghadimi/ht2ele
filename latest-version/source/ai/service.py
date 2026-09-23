"""Offline local AI service. No shell commands, remote downloads, or pickle models."""
import argparse, base64, hashlib, io, json, math, os, random, secrets, socket, struct, subprocess, sys, threading, time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image, ImageStat, ImageFilter
from micrograd.nn import MLP
from vision import Jobs

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get('H2E_DATA', str(Path(os.environ.get('LOCALAPPDATA', str(ROOT))) / 'HTML2Elementor-data')))
DATA.mkdir(parents=True, exist_ok=True)
LOCK = threading.RLock()
LOG = deque(maxlen=250)
PROC = None
ENGINE_PORT = 0
ENGINE_KEY = secrets.token_urlsafe(24)
ACTIVE_MODEL = None
TRAIN = {'state':'idle'}
FEATURES = 32

def load(name, default):
    p = DATA / name
    return json.loads(p.read_text('utf-8')) if p.exists() else default

def save(name, value):
    p = DATA / name
    t = p.with_suffix('.tmp')
    t.write_text(json.dumps(value, ensure_ascii=False), 'utf-8'); t.replace(p)

def log(text):
    LOG.append(time.strftime('%H:%M:%S')+' '+str(text)[:2000])

VISION_JOBS = Jobs(log)

def gguf_path(value):
    p=Path(str(value or '').strip().strip(chr(34))).expanduser().resolve()
    if not p.is_file() or p.suffix.lower()!='.gguf':raise ValueError('مسیر فایل محلی GGUF معتبر نیست؛ URL پذیرفته نمی‌شود.')
    with p.open('rb') as f:
        if f.read(4)!=b'GGUF':raise ValueError('سرآیند فایل GGUF معتبر نیست')
    return p

def gguf_blocks(path):
    """Transformer block count from GGUF metadata (for hybrid ngl). None if unavailable."""
    try:
        with open(path,'rb') as f:
            head=f.read(24)
            if len(head)<24 or head[:4]!=b'GGUF':return None
            kvcount=int.from_bytes(head[16:24],'little')
            if kvcount<=0 or kvcount>4096:return None
            widths={0:1,1:1,2:2,3:2,4:4,5:4,6:8,7:8,8:4,9:8,10:1}
            for _ in range(kvcount):
                klen_b=f.read(8)
                if len(klen_b)<8:break
                klen=int.from_bytes(klen_b,'little')
                if klen>1_000_000:break
                key=f.read(klen)
                if len(key)<klen:break
                vt_b=f.read(4)
                if len(vt_b)<4:break
                vt=int.from_bytes(vt_b,'little')
                if vt==11:
                    slen_b=f.read(8)
                    if len(slen_b)<8:break
                    slen=int.from_bytes(slen_b,'little')
                    if slen>1_000_000:break
                    f.seek(slen,1)
                elif vt in widths:
                    raw=f.read(widths[vt])
                    if len(raw)<widths[vt]:break
                    if key.endswith(b'block_count') and vt in (4,5,6,7):
                        v=int.from_bytes(raw,'little')
                        if 0<v<100000:return v
                else:break
    except OSError:
        pass
    return None

def scan_gguf_dirs():
    cands=[]
    la=os.environ.get('LOCALAPPDATA')
    if la:cands.append(Path(la)/'HTML2Elementor-models')
    home=Path.home()
    cands += [DATA/'models', ROOT/'models', home/'models', home/'Downloads'/'models']
    for drv in ('C','D','E','F','G'):
        cands.append(Path(drv+':/Models'))
    seen=set();models=[];dirs=[]
    for d in cands:
        try:
            if not d.is_dir():continue
            r=d.resolve()
            if r in seen:continue
        except OSError:continue
        seen.add(r);dirs.append(str(d))
        try:
            entries=sorted(d.iterdir())
        except OSError:continue
        for f in entries:
            if f.suffix.lower()!='.gguf':continue
            try:
                if not f.is_file():continue
                st=f.stat()
            except OSError:continue
            models.append({'path':str(f),'name':f.name,'bytes':st.st_size,'blocks':gguf_blocks(f),'projector':f.name.lower().startswith('mmproj')})
            if len(models)>=100:break
        if len(models)>=100:break
    return {'dirs':dirs,'models':models}

def import_upload(name,b64):
    base=Path(str(name or '')).name
    if not base or Path(base).suffix.lower()!='.gguf':raise ValueError('فایل باید GGUF باشد (پسوند .gguf)')
    if not isinstance(b64,str) or len(b64)>10_000_000:raise ValueError('سقف ایمپورت مستقیم: ۸ مگابایت؛ مدل‌های بزرگ‌تر را از مسیر فایل ثبت کنید یا اسکن دیسک را بزنید.')
    try:raw=base64.b64decode(b64,validate=True)
    except Exception:raise ValueError('داده base64 نامعتبر است')
    if len(raw)<24 or raw[:4]!=b'GGUF':raise ValueError('فایل GGUF معتبر نیست (سرآیند GGUF پیدا نشد)')
    if len(raw)>8_000_000:raise ValueError('فایل بزرگ‌تر از ۸ مگابایت است')
    target=DATA/'models';target.mkdir(parents=True,exist_ok=True)
    dest=target/base
    if dest.exists():dest=target/(base[:-4]+'-'+secrets.token_hex(3)+'.gguf')
    dest.write_bytes(raw)
    log('Model imported: '+str(dest))
    return {'path':str(dest),'bytes':len(raw)}

def model_request(port,payload,timeout=900):
    req=Request(f'http://127.0.0.1:{port}/v1/chat/completions',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+ENGINE_KEY})
    try:
        with urlopen(req,timeout=timeout) as r:return json.load(r)
    except Exception as e:
        import urllib.error
        if isinstance(e,urllib.error.HTTPError):
            detail=e.read(4096).decode('utf-8','replace')
            raise ValueError('خطای موتور بینایی: '+detail)
        raise ValueError('ارتباط با موتور قطع شد یا زمان پاسخ تمام شد: '+str(e))

class Tags(HTMLParser):
    def __init__(self):
        super().__init__(); self.tags=[]; self.attrs=[]; self.text=''
    def handle_starttag(self,t,a): self.tags.append(t); self.attrs.extend(k for k,v in a)
    def handle_data(self,d): self.text+=d

def features(item):
    if item.get('kind') == 'image':
        raw = base64.b64decode(item.get('data','').split(',')[-1], validate=True)
        if len(raw)>8_000_000: raise ValueError('حد تصویر: ۸ مگابایت')
        with Image.open(io.BytesIO(raw)) as im:
            if im.format not in ('PNG','JPEG','WEBP','BMP','GIF'):raise ValueError('قالب تصویر پشتیبانی نمی‌شود')
            if im.width*im.height>16_000_000: raise ValueError('حد تصویر: ۱۶ مگاپیکسل')
            ratio = min(8,im.width/max(1,im.height))/8
            im=im.convert('RGB'); thumb=im.resize((4,4)).convert('L')
            f=[1,ratio]+[x/255 for x in thumb.getdata()]+[x/255 for x in ImageStat.Stat(im.resize((32,32))).mean]
            f += [ImageStat.Stat(im.resize((32,32)).convert('L').filter(ImageFilter.FIND_EDGES)).mean[0]/255]
    else:
        text=str(item.get('html',''))
        if not text or len(text)>200_000: raise ValueError('HTML خالی یا بیش از حد بزرگ است')
        h=Tags();h.feed(text)
        names=['button','a','h1','h2','h3','p','span','div','svg','i','img','input','ul','section','form','table']
        f=[0]+[min(5,h.tags.count(n))/5 for n in names]+[float(a in h.attrs) for a in ['href','src','viewbox','role','style']]
        f += [min(1,len(h.text)/300), min(1,len(h.tags)/20)]
    return (f+[0]*FEATURES)[:FEATURES]

def network():
    random.seed(42)
    return MLP(FEATURES,[8,6])

def new_network(labels):
    random.seed(42)
    return MLP(FEATURES,[8,len(labels)])

def train_worker(rows, epochs):
    global TRAIN
    try:
        labels=sorted(set(x['label'] for x in rows)); net=new_network(labels)
        params=net.parameters(); rng=random.Random(42)
        for ep in range(epochs):
            rng.shuffle(rows); total=0
            for item in rows:
                outputs=net(item['features']); outputs=outputs if isinstance(outputs,list) else [outputs]
                target=labels.index(item['label'])
                loss=sum((v-(1.0 if j==target else -1.0))**2 for j,v in enumerate(outputs))/len(labels)
                net.zero_grad();loss.backward()
                for p in params: p.data-=0.025*max(-5,min(5,p.grad))
                total+=loss.data
            TRAIN={'state':'training','epoch':ep+1,'epochs':epochs,'loss':round(total/len(rows),6)}
        correct=0
        for item in rows:
            out=net(item['features']);guess=max(range(len(labels)),key=lambda j:out[j].data)
            correct+=labels[guess]==item['label']
        artifact={'schema':1,'features':FEATURES,'labels':labels,'weights':[p.data for p in params],'samples':len(rows),'trained_at':time.time()}
        with LOCK: save('classifier.json',artifact)
        TRAIN={'state':'ready','samples':len(rows),'training_accuracy':round(correct/len(rows),3),'note':'امتیاز روی داده آموزشی است؛ ارزیابی مستقل نیست.'}
        log('Classifier saved. '+json.dumps(TRAIN,ensure_ascii=False))
    except Exception as e:
        TRAIN={'state':'error','error':str(e)};log(str(e))

def engine_status():
    if PROC is None or PROC.poll() is not None:return 'stopped'
    try:
        with urlopen(Request(f'http://127.0.0.1:{ENGINE_PORT}/health',headers={'Authorization':'Bearer '+ENGINE_KEY}),timeout=.4) as r:
            return 'ready' if r.status==200 else 'loading'
    except Exception:return 'loading'

def stop_engine():
    global PROC, ACTIVE_MODEL
    VISION_JOBS.cancel()
    if PROC is not None and PROC.poll() is None:
        PROC.terminate()
        try:PROC.wait(timeout=4)
        except subprocess.TimeoutExpired:PROC.kill();PROC.wait(timeout=4)
    PROC=None;ACTIVE_MODEL=None;log('Model stopped')

def engine_log(proc):
    for line in proc.stdout: log(line.rstrip())
    log('Engine exit: '+str(proc.wait()))

def dispatch(path, data=None):
    global PROC, ENGINE_PORT, TRAIN, ACTIVE_MODEL
    with LOCK:
        if path=='status':
            engine_exe=Path(os.environ.get('H2E_ENGINE_ROOT',str(ROOT)))/'engine-cuda'/('llama-server.exe' if os.name=='nt' else 'llama-server')
            return {'ok':True,'python':sys.version.split()[0],'vision':'Pillow','ml':'micrograd','offline':True,'engine':engine_status(),'training':TRAIN,'samples':len(load('samples.json',[])),'data_dir':str(DATA),'model':load('classifier.json',{}).get('labels',[]),'logs':list(LOG),'active_model':ACTIVE_MODEL,'vision_busy':VISION_JOBS.busy(),'cuda_engine':engine_exe.is_file()}
        if path=='models':
            rows=load('models.json',[])
            for row in rows:
                row['blocks']=gguf_blocks(row.get('path',''))
            return {'models':rows}
        if path=='models/scan':return scan_gguf_dirs()
        if path=='models/upload':return import_upload(data.get('name'),data.get('b64'))
        if path=='models/register':
            p=gguf_path(data.get('path'))
            projector=gguf_path(data.get('projector')) if data.get('projector') else None
            if projector and projector==p:raise ValueError('فایل مدل و mmproj باید جدا باشند')
            rows=load('models.json',[]);ident=hashlib.sha256((str(p)+'|'+str(projector or '')).encode()).hexdigest()[:12]
            rows=[x for x in rows if x['id']!=ident];rows.append({'id':ident,'name':p.name,'path':str(p),'bytes':p.stat().st_size,'projector':str(projector) if projector else '', 'vision':bool(projector)});save('models.json',rows)
            return {'models':rows,'id':ident}
        if path=='models/start':
            model=next((m for m in load('models.json',[]) if m['id']==data.get('id')),None)
            if not model:raise ValueError('ابتدا فایل GGUF را ثبت کنید.')
            mode=str(data.get('mode') or 'cpu')
            if mode not in ('cpu','cuda','hybrid'):raise ValueError('موتور باید cpu، cuda یا hybrid باشد.')
            folder='engine-cuda' if mode in ('cuda','hybrid') else 'engine'
            exe=Path(os.environ.get('H2E_ENGINE_ROOT',str(ROOT)))/folder/('llama-server.exe' if os.name=='nt' else 'llama-server')
            if not exe.is_file():
                if mode in ('cuda','hybrid'):raise ValueError('موتور CUDA موجود نیست؛ حالت «GPU+CPU همزمان» (hybrid) همان موتور engine-cuda با تعداد لایهٔ کمتر است و جدا از موتور CPU لازم دارد. تا نصبش، حالت CPU را استفاده کنید.')
                raise ValueError('موتور '+folder+' موجود نیست. بسته سبک موتور CPU دارد؛ CUDA جداگانه اضافه می‌شود.')
            gguf_path(model['path'])
            if model.get('projector'):gguf_path(model['projector'])
            stop_engine()
            with socket.socket() as s:s.bind(('127.0.0.1',0));ENGINE_PORT=s.getsockname()[1]
            context=16384
            blocks=gguf_blocks(model['path'])
            vram=0.0;ngl=0;proj_gb=0.0
            if mode!='cpu':
                try:vram=max(2.0,min(96.0,float(data.get('vram_gb') or 8.0)))
                except Exception:vram=8.0
                try:proj_gb=max(0.0,float(os.path.getsize(model['projector']) if model.get('projector') else 0))/1_073_741_824
                except Exception:proj_gb=0.0
                ngl_req=data.get('ngl')
                if isinstance(ngl_req,(int,float)) and not isinstance(ngl_req,bool) and int(ngl_req)>=0:
                    ngl=int(ngl_req)
                elif blocks:
                    per_layer=max(1.0,float(model.get('bytes') or 0)/blocks)
                    usable_gb=max(0.5,vram*0.70-1.0-proj_gb*0.9)
                    ngl=max(0,min(blocks,int(usable_gb*1_000_000_000//per_layer)))
                else:
                    ngl=20
                if blocks:ngl=min(ngl,blocks)
            args=[str(exe),'-m',model['path'],'--host','127.0.0.1','--port',str(ENGINE_PORT),'--api-key',ENGINE_KEY,'-c',str(context),'--parallel','1','--offline','-t',str(max(1,min(8,os.cpu_count() or 2))),'-ngl',str(ngl)]
            if model.get('projector'):
                args.extend(['--mmproj',model['projector'],'--image-min-tokens','128','--image-max-tokens','1536','--mtmd-batch-max-tokens','512'])
                if mode=='cpu':args.append('--no-mmproj-offload')
            ACTIVE_MODEL={'id':model['id'],'name':model['name'],'vision':bool(model.get('projector')),'mode':mode,'ngl':ngl,'vram_gb':vram,'blocks':blocks,'context':context}
            PROC=subprocess.Popen(args,cwd=exe.parent,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            threading.Thread(target=engine_log,args=(PROC,),daemon=True).start()
            log('Loading '+model['name']+' / '+mode+(' / ngl='+str(ngl)+' از '+str(blocks) if blocks and mode!='cpu' else '')+(' / VRAM تخمینی '+str(vram)+'GB' if vram else ''))
            return {'state':'loading','mode':mode,'ngl':ngl,'blocks':blocks}
        if path=='models/stop':stop_engine();return {'state':'stopped'}
        if path.startswith('vision/jobs/'):
            return VISION_JOBS.get(path.rsplit('/',1)[-1])
        if path=='vision/analyze':
            if engine_status()!='ready' or not ACTIVE_MODEL or not ACTIVE_MODEL.get('vision'):
                raise ValueError('ابتدا مدل بینایی را همراه mmproj ثبت و اجرا کنید؛ مدل متنی تصویر نمی‌خواند.')
            port=ENGINE_PORT
            return VISION_JOBS.start(data,ACTIVE_MODEL,lambda payload:model_request(port,payload))
        if path=='vision/cancel':
            VISION_JOBS.cancel(data.get('id'));stop_engine();return {'state':'canceled','engine':'stopped'}
        if path=='samples':return {'schema':1,'samples':load('samples.json',[])}
        if path=='samples/add':
            label=str(data.get('label','')).strip()
            if not label or len(label)>48:raise ValueError('برچسب معتبر لازم است')
            rows=load('samples.json',[])
            if len(rows)>=300:raise ValueError('حد نسخه سبک: ۳۰۰ نمونه')
            rows.append({'id':secrets.token_hex(6),'label':label,'kind':data.get('kind','html'),'features':features(data)})
            save('samples.json',rows);return {'samples':len(rows)}
        if path=='samples/delete':
            rows=[x for x in load('samples.json',[]) if x['id']!=data.get('id')];save('samples.json',rows);return {'samples':len(rows)}
        if path=='samples/import':
            rows=data.get('samples',[])
            if not isinstance(rows,list) or len(rows)>300:raise ValueError('بانک نمونه نامعتبر است')
            for x in rows:
                if not isinstance(x.get('label'),str) or not 1<=len(x['label'])<=48 or len(x.get('features',[]))!=FEATURES or not all(isinstance(v,(int,float)) and math.isfinite(v) and -10<=v<=10 for v in x['features']):raise ValueError('ویژگی نمونه نامعتبر است')
            rows=[{'id':secrets.token_hex(6),'label':x['label'],'kind':x.get('kind','html'),'features':x['features']} for x in rows];save('samples.json',rows);return {'samples':len(rows)}
        if path=='train':
            if TRAIN.get('state')=='training':raise ValueError('آموزش در حال اجراست')
            rows=load('samples.json',[]);labels=set(x['label'] for x in rows)
            if len(labels)<2 or len(labels)>20 or any(sum(x['label']==l for x in rows)<2 for l in labels):raise ValueError('حداقل دو برچسب و دو نمونه برای هر برچسب لازم است؛ حداکثر ۲۰ برچسب.')
            TRAIN={'state':'training','epoch':0};threading.Thread(target=train_worker,args=(rows,max(1,min(60,int(data.get('epochs',25))))),daemon=True).start();return TRAIN
        if path=='predict':
            model=load('classifier.json',{})
            if not model:raise ValueError('ابتدا دسته‌بند را آموزش دهید')
            net=new_network(model['labels'])
            if len(net.parameters())!=len(model['weights']):raise ValueError('مدل محلی ناسازگار است')
            for p,v in zip(net.parameters(),model['weights']):p.data=v
            out=net(features(data));rank=sorted(zip(model['labels'],[round(x.data,4) for x in out]),key=lambda x:-x[1]);return {'label':rank[0][0],'ranking':rank,'note':'پیشنهاد دسته‌بند؛ امتیازها احتمال کالیبره‌شده نیستند.'}
    if path=='chat':
        if VISION_JOBS.busy():raise ValueError('تحلیل تصویر در حال اجراست؛ برای گفت‌وگو صبر کنید یا تحلیل را لغو کنید')
        messages=data.get('messages')
        if messages is None:
            prompt=data.get('prompt')
            if isinstance(prompt,str):
                if not prompt.strip() or len(prompt)>60000:raise ValueError('پیام خالی یا بیش از حد بزرگ است')
                messages=[{'role':'user','content':prompt}]
            elif isinstance(prompt,list):
                messages=[{'role':'user','content':prompt}]
            else:
                raise ValueError('prompt لازم است (متن یا آرایهٔ بخش‌های text/image_url)')
        if not isinstance(messages,list) or not 1<=len(messages)<=64:raise ValueError('messages نامعتبر است (حداکثر ۶۴ پیام)')
        for m in messages:
            if not isinstance(m,dict) or m.get('role') not in ('system','user','assistant'):raise ValueError('role پیام نامعتبر است')
            c=m.get('content')
            if isinstance(c,str):
                if not c.strip() or len(c)>120000:raise ValueError('محتوای پیام خالی یا بیش از حد بزرگ است')
            elif isinstance(c,list) and c:
                for part in c:
                    if not isinstance(part,dict) or part.get('type') not in ('text','image_url'):raise ValueError('بخش پیام نامعتبر است')
                    if part.get('type')=='text' and len(str(part.get('text','')))>120000:raise ValueError('بخش متنی بیش از حد بزرگ است')
            else:
                raise ValueError('محتوای پیام نامعتبر است')
        system=data.get('system')
        if isinstance(system,str) and system.strip():
            messages=[{'role':'system','content':system[:4000]}]+messages
        try:max_tokens=max(64,min(16384,int(data.get('max_tokens') or 4096)))
        except Exception:raise ValueError('max_tokens نامعتبر است')
        try:temperature=max(0.0,min(2.0,float(data.get('temperature') or 0.3)))
        except Exception:temperature=0.3
        if engine_status()!='ready':raise ValueError('مدل آماده نیست؛ لاگ را بررسی کنید')
        payload={'messages':messages,'max_tokens':max_tokens,'temperature':temperature,'stream':False}
        req=Request(f'http://127.0.0.1:{ENGINE_PORT}/v1/chat/completions',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+ENGINE_KEY})
        with urlopen(req,timeout=900) as r:result=json.load(r)
        return {'text':result['choices'][0]['message']['content']}
    raise ValueError('مسیر ناشناخته')

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):self.handle_api(False)
    def do_POST(self):self.handle_api(True)
    def handle_api(self,post):
        if self.headers.get('X-H2E-Token')!=self.server.token:self.send_error(403);return
        try:
            path=self.path.split('?',1)[0].removeprefix('/api/ai/')
            if not post and path not in ('status','models','samples','models/scan') and not path.startswith('vision/jobs/'):raise ValueError('POST لازم است')
            length=int(self.headers.get('Content-Length','0'))
            if length>12_000_000:raise ValueError('درخواست بیش از حد بزرگ است')
            data=json.loads(self.rfile.read(length)) if post else None
            result=dispatch(path,data);status=200
        except Exception as e:result={'error':str(e)};status=400
        raw=json.dumps(result,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers()
        try:self.wfile.write(raw)
        except BrokenPipeError:pass

def main():
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=0);p.add_argument('--token',required=True);p.add_argument('--parent',type=int,default=0);a=p.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',a.port),Handler);server.token=a.token
    if a.parent:
        def parent_watch():
            while True:
                time.sleep(3)
                if os.name=='nt':
                    import ctypes
                    h=ctypes.windll.kernel32.OpenProcess(0x1000,False,a.parent)
                    if h:ctypes.windll.kernel32.CloseHandle(h)
                    else:stop_engine();os._exit(0)
                else:
                    try:os.kill(a.parent,0)
                    except ProcessLookupError:stop_engine();os._exit(0)
        threading.Thread(target=parent_watch,daemon=True).start()
    print(server.server_port,flush=True)
    try:server.serve_forever()
    finally:stop_engine()
if __name__=='__main__':main()
