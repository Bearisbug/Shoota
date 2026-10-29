const fs=require('fs'),cp=require('child_process'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const base='c26dee1d7e56be6ed94927684d4efd13da573d38';
const old=cp.execFileSync('git',['show',base+':public/index.html'],{encoding:'utf8'}),now=fs.readFileSync('public/index.html','utf8');
const rx=/const CATALOG = (\[[\s\S]*?\n\]);/;
const a=JSON.parse(JSON.stringify(vm.runInNewContext(old.match(rx)[1]))),b=JSON.parse(JSON.stringify(vm.runInNewContext(now.match(rx)[1])));
assert.equal(old.replace(rx,'CATALOG').replace('.hero-nav{display:flex;', '.hero-nav{display:flex;flex-wrap:wrap;'),now.replace(rx,'CATALOG'),'Outside catalog only hero-nav wrapping changes');
assert.equal(b.length,20);assert.equal(b[1].id,'one-in-billions');assert.equal(b[2].id,'airline-empire');assert.equal(b[9].id,'rental-empire');
const order=a.map(g=>g.id);order.splice(order.indexOf('lol')+1,0,'lol-player');assert.deepEqual(b.map(g=>g.id),order);
for(const g of a){const n=b.find(x=>x.id===g.id);if(g.id!=='lol')assert.deepEqual(n,g);else for(const key of ['id','title','src','cover','sub','genre','tags','status','session','saves'])assert.deepEqual(n[key],g[key])}
const allowed=['public/index.html','public/games/lol.html','public/games/lol-player.html','public/covers/lol-player.jpg'];
const tracked=cp.execFileSync('git',['ls-tree','-r','--name-only',base],{encoding:'utf8'}).trim().split('\n');let unchanged=0;
for(const p of tracked.filter(p=>(p.startsWith('public/')||p.startsWith('src/')||p.startsWith('.github/')||p.startsWith('migrations/'))&&!allowed.includes(p))){assert.deepEqual(fs.readFileSync(p),cp.execFileSync('git',['show',base+':'+p],{maxBuffer:30*1024*1024}),p);unchanged++}
for(const g of b)assert.equal(fs.statSync('public/'+g.src).size,g.size,g.id+' size');
const manifest=JSON.parse(fs.readFileSync('docs/test-runs/RUN-160/source-verification.json'));
for(const id of ['lol','lol-player'])assert.equal(crypto.createHash('sha256').update(fs.readFileSync('public/games/'+id+'.html')).digest('hex'),manifest[id].sha256);
console.log(JSON.stringify({passed:true,base,order,unchangedFiles:unchanged,unchangedCatalogObjects:18,publicAllowlist:allowed,indexSha256:crypto.createHash('sha256').update(now).digest('hex')},null,2));
