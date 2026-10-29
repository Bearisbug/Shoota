from pathlib import Path
import hashlib,json,zipfile,tempfile,shutil,subprocess
r=Path('/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-29-bfaca668cd9e')
root=Path('/Users/leizhang/Documents/ChatGPT/shoota')
e=Path(__file__).resolve().parent
h=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((r/'manifest.json').read_text())
for p,v in m.items():
 b=(r/p).read_bytes();assert h(b)==v['sha256'] and len(b)==v['bytes'],p
files={}
for n in ['云际航空.html','云际航空-离线版.zip']:
 b=(r/n).read_bytes();assert b==(root/n).read_bytes(),n
 files[n]={'bytes':len(b),'sha256':h(b),'rootMatches':True}
assert files['云际航空.html']=={'bytes':1414610,'sha256':'bfaca668cd9e887964909bc8550083d3de6dc6858b7ba8a534c720576274f932','rootMatches':True}
with zipfile.ZipFile(r/'云际航空-离线版.zip') as z:
 entries=[n for n in z.namelist() if n.endswith('.html')];assert len(entries)==1
 assert z.read(entries[0])==(r/'云际航空.html').read_bytes()
with tempfile.TemporaryDirectory(prefix='airline-bfaca-rebuild-') as temp:
 src=Path(temp)/'source';shutil.copytree(r/'source',src)
 built=subprocess.run(['python3',str(src/'build-local.py')],capture_output=True,text=True,check=True)
 assert (Path(temp)/'云际航空.html').read_bytes()==(r/'云际航空.html').read_bytes()
 (e/'rebuild.txt').write_text(built.stdout+'Rebuilt HTML exactly matches frozen HTML. ZIP container timestamps are not used for rebuild equality.\n')
result={'release':str(r),'verifiedManifestEntries':len(m),'manifestSha256':h((r/'manifest.json').read_bytes()),'files':files,'zipHtmlMatches':True,'rebuildHtmlMatches':True}
(e/'source-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
for a,b in [('manifest.json','developer-manifest-snapshot.json'),('release-handoff.md','developer-handoff-snapshot.md'),('evidence/report.md','developer-report-snapshot.md')]: (e/b).write_bytes((r/a).read_bytes())
print(json.dumps(result,ensure_ascii=False,indent=2))
