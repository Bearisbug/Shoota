from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
ROOT=Path(__file__).resolve().parent
GAME=ROOT.parents[2]/'云际航空.html'
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  p=GAME if self.path=='/game.html' else ROOT/'fixture.html'
  data=p.read_bytes();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
ThreadingHTTPServer(('127.0.0.1',8917),Handler).serve_forever()
