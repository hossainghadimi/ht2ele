"""Optional real multimodal CPU transport smoke test (SmolVLM, not Qwen accuracy)."""
import base64,io,json,os,sys,time
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'ai'))
os.environ['H2E_DATA']=str(ROOT/'build/vision-smoke-data')
import service
model=Path(os.environ['H2E_VISION_SMOKE_MODEL']);projector=Path(os.environ['H2E_VISION_SMOKE_PROJECTOR'])
try:
 r=service.dispatch('models/register',{'path':str(model),'projector':str(projector)})
 service.dispatch('models/start',{'id':r['id'],'mode':'cpu'})
 deadline=time.time()+90
 while time.time()<deadline:
  state=service.engine_status()
  if state=='ready':break
  if state=='stopped':raise AssertionError(list(service.LOG)[-30:])
  time.sleep(.25)
 assert state=='ready'
 im=Image.new('RGB',(256,256),'white');draw=ImageDraw.Draw(im);draw.ellipse((25,25,231,231),fill='#00aa00');b=io.BytesIO();im.save(b,format='PNG')
 payload={'messages':[{'role':'user','content':[{'type':'text','text':'What color is the circle? Respond as JSON with a color string.'},{'type':'image_url','image_url':{'url':'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()}}]}],'max_tokens':80,'temperature':.1,'response_format':{'type':'json_object','schema':{'type':'object','required':['color'],'properties':{'color':{'type':'string'}},'additionalProperties':False}},'stream':False}
 r=service.model_request(service.ENGINE_PORT,payload,180);text=r['choices'][0]['message']['content'];parsed=json.loads(text);assert isinstance(parsed.get('color'),str)
 report={'status':'PASS','test_kind':'real multimodal transport + constrained JSON smoke test; NOT Qwen or screenshot reconstruction accuracy','engine':'llama.cpp b11095 Linux CPU','model':model.name,'projector':projector.name,'source':'synthetic green circle image','response':parsed,'active_model_vision':service.ACTIVE_MODEL['vision'],'Windows_CUDA_RTX_Qwen4B':'not tested in this environment'}
 (ROOT/'tests/vision-engine-smoke-v1.7.0.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
finally:service.stop_engine()
