from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
root=Path(__file__).resolve().parents[3]/'public'
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(root),**kw)
 def do_GET(self):
  path=urlsplit(self.path).path
  if not Path(path).suffix and (root/(path.lstrip('/')+'.html')).is_file():self.path=path+'.html'
  super().do_GET()
 def do_POST(self):self.send_response(204);self.end_headers()
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',8844),Handler).serve_forever()
