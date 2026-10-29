// Independent local origin for public CJ1 restore; beforeTitles fixture changes only catalog title strings.
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../../../public');
http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end('{}');}
 let f=path.join(root,decodeURIComponent(u.pathname)==='/'?'index.html':decodeURIComponent(u.pathname));
 if(!fs.existsSync(f)&&fs.existsSync(f+'.html'))f+='.html';
 if(!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end('not found');}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml'})[path.extname(f)]||'application/octet-stream');
 let body=fs.readFileSync(f);
 if(path.basename(f)==='index.html'&&u.searchParams.has('beforeTitles'))body=body.toString().replace("title:'我在LOL建银河战队'","title:'lol电竞经理'").replace("title:'我是职业通天代'","title:'LOL 选手生涯'");
 res.end(body);
}).listen(0,'127.0.0.1',function(){console.log('PREVIEW http://127.0.0.1:'+this.address().port);});
