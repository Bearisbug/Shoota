from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import re
from urllib.parse import urlparse
PUBLIC=Path('/Users/leizhang/Documents/shoota/tmp/wt-portrait/public')
GAME=Path('/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-26-d6df70d39527/云际航空.html')
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(PUBLIC),**kw)
 def do_GET(self):
  path=urlparse(self.path).path
  if path == '/qa.html':
   data=(Path(__file__).parent/'fixture.html').read_bytes();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(data)
  elif path in ['/', '/index.html']:
   text=(PUBLIC/'index.html').read_text();text=re.sub(r"(id:'airline-empire'[^\n]*?size:)\d+",lambda m:m.group(1)+str(GAME.stat().st_size),text);data=text.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
  elif path.rstrip('/') in ['/games/airline-empire','/games/airline-empire.html']:
   data=GAME.read_bytes();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
  elif path.startswith('/api/'):
   self.send_response(204);self.end_headers()
  else:super().do_GET()
 def do_POST(self):self.send_response(204);self.end_headers()
ThreadingHTTPServer(('127.0.0.1',8923),Handler).serve_forever()
