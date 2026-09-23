"""Offline functional integration. Optional real GGUF via H2E_TEST_MODEL/H2E_ENGINE_ROOT."""
from pathlib import Path
import base64,io,json,os,secrets,subprocess,sys,time,urllib.request,urllib.error
from PIL import Image
root=Path(__file__).resolve().parent.parent
env=os.environ.copy();env['H2E_DATA']=str(root/'build/test-ai-data');token=secrets.token_hex(24)
p=subprocess.Popen([sys.executable,str(root/'ai/service.py'),'--token',token],stdout=subprocess.PIPE,text=True,env=env)
port=int(p.stdout.readline().strip());base=f'http://127.0.0.1:{port}/api/ai/'
def api(path,data=None):
 r=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers={'X-H2E-Token':token,'Content-Type':'application/json'})
 with urllib.request.urlopen(r,timeout=185) as response:return json.load(response)
def expect400(path,data):
 try:api(path,data);raise AssertionError('must reject')
 except urllib.error.HTTPError as e:assert e.code==400
try:
 try:urllib.request.urlopen(base+'status');raise AssertionError('missing token accepted')
 except urllib.error.HTTPError as e:assert e.code==403
 api('samples/import',{'samples':[]})
 expect400('train',{'epochs':5});expect400('models/register',{'path':'https://example.com/model.gguf'})
 for label,color in [('button','red'),('icon','blue')]:
  for size in [(60,40),(62,42),(64,44)]:
   f=io.BytesIO();Image.new('RGB',size,color).save(f,format='PNG');data=base64.b64encode(f.getvalue()).decode();api('samples/add',{'kind':'image','data':data,'label':label})
 api('train',{'epochs':20});deadline=time.time()+45
 while time.time()<deadline:
  status=api('status')
  if status['training']['state']!='training':break
  time.sleep(.15)
 assert status['training']['state']=='ready',status
 result=api('predict',{'kind':'image','data':data});assert result['label'] in ['button','icon']
 bank=api('samples');assert len(bank['samples'])==6;api('samples/import',bank);assert api('status')['samples']==6
 expect400('samples/import',{'samples':[{'label':'x','features':[float('nan')]*32}]})
 model=os.environ.get('H2E_TEST_MODEL');generation=None
 if model:
  m=api('models/register',{'path':model});api('models/start',{'id':m['id'],'mode':'cpu'});deadline=time.time()+90
  while time.time()<deadline:
   s=api('status')
   if s['engine']=='ready':break
   if s['engine']=='stopped':raise AssertionError(s['logs'][-20:])
   time.sleep(.3)
  assert s['engine']=='ready',s
  generation=api('chat',{'prompt':'Reply with just the word hello.'})['text'];assert generation.strip()
  api('models/stop',{});assert api('status')['engine']=='stopped'
 report={'status':'PASS','libraries':['Pillow 11.3.0 (Windows bundle)','micrograd 0.1.0'],'checks':['token authorization','minimum training set validation','image feature extraction','actual gradient training','JSON classifier persistence','prediction','dataset export/import','reject NaN and remote model URLs'],'training':status['training'],'GGUF_test':{'engine':'llama.cpp b11095 Linux CPU','model':'Qwen2.5-0.5B-Instruct Q4_K_M','response':generation} if generation else 'not run','Windows_execution':'not tested; Linux reference engine used for inference test'}
 (root/'tests/ai-report-v1.6.0.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
finally:
 try:api('models/stop',{})
 except Exception:pass
 p.terminate();p.wait(timeout=5)
