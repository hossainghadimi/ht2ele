#!/usr/bin/env python3
"""Maintainer-only online preparation. End users do NOT run this script.
Creates build/offline, which package_release.py embeds alongside the Windows EXE.
"""
from pathlib import Path
import hashlib,json,subprocess,sys,urllib.request,zipfile
ROOT=Path(__file__).resolve().parent
CACHE=ROOT/'build/downloads';CACHE.mkdir(parents=True,exist_ok=True)
OUT=ROOT/'build/offline';OUT.mkdir(parents=True,exist_ok=True)
URLS={
 'python.zip':'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip',
 'llama.zip':'https://github.com/ggml-org/llama.cpp/releases/download/b11095/llama-b11095-bin-win-cpu-x64.zip',
 'vclibs.appx':'https://aka.ms/Microsoft.VCLibs.x64.14.00.Desktop.appx',
 'LICENSE-llama.cpp.txt':'https://raw.githubusercontent.com/ggml-org/llama.cpp/b11095/LICENSE',
}
records=[]
for name,url in URLS.items():
 p=CACHE/name
 if not p.exists():urllib.request.urlretrieve(url,p)
 records.append({'file':name,'url':url,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
subprocess.run([sys.executable,'-m','pip','download','--dest',str(CACHE),'--only-binary=:all:','--platform','win_amd64','--python-version','312','--implementation','cp','--abi','cp312','Pillow==11.3.0','micrograd==0.1.0'],check=True)
with zipfile.ZipFile(CACHE/'python.zip') as z:z.extractall(OUT/'runtime')
for p in CACHE.glob('*.whl'):
 with zipfile.ZipFile(p) as z:z.extractall(OUT/'runtime/Lib/site-packages')
 records.append({'file':p.name,'source':'PyPI','bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(OUT/'runtime/python312._pth').write_text('python312.zip\n.\nLib/site-packages\n../ai\nimport site\n')
engine=OUT/'engine';engine.mkdir(exist_ok=True)
with zipfile.ZipFile(CACHE/'llama.zip') as z:
 for n in z.namelist():
  if (n.endswith('.dll') and not any(p in n for p in ['batched-bench','llama-cli-','llama-bench-','llama-completion-','fit-params','perplexity','quantize-'])) or n in ('llama-server.exe','LICENSE-LLVM-OpenMP'):z.extract(n,engine)
with zipfile.ZipFile(CACHE/'vclibs.appx') as z:
 for n in z.namelist():
  if n.startswith(('msvcp140','vcruntime140')):z.extract(n,engine)
(engine/'LICENSE-llama.cpp.txt').write_bytes((CACHE/'LICENSE-llama.cpp.txt').read_bytes())
(OUT/'DEPENDENCIES.json').write_text(json.dumps({'platform':'Windows x64','python':'3.12.10','Pillow':'11.3.0','micrograd':'0.1.0','llama.cpp':'b11095 CPU','downloads':records,'note':'Recorded source artifact hashes; no model weights bundled. Build script needs internet; the resulting app does not.'},indent=2))
(engine/'NOTICE-Microsoft.txt').write_text((ROOT/'docs/NOTICE-MICROSOFT.txt').read_text())
print('Prepared',OUT)
