const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict'),vm=require('vm'),crypto=require('crypto');
const base='81f69f75c23e6f42e4c3b650e2cb94c0854b283c';
const read=p=>cp.execFileSync('git',['show',base+':'+p],{maxBuffer:40*1024*1024});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const old=read('public/index.html').toString(),now=fs.readFileSync('public/index.html','utf8');
const rx=/const CATALOG = (\[[\s\S]*?\n\]);/;
assert.equal(old.replace(rx,'CATALOG'),now.replace(rx,'CATALOG'),'host outside catalog unchanged');
const catalog=s=>JSON.parse(JSON.stringify(vm.runInNewContext(s.match(rx)[1])));
const a=catalog(old),b=catalog(now);assert.equal(b.length,20);assert.deepEqual(b.map(g=>g.id),a.map(g=>g.id));
const allowed={lol:['title','size','about'],'lol-player':['title','size','sub','tagline','about','loop']};
const expectedTitles={lol:'我在LOL建银河战队','lol-player':'我是职业通天代'};
for(let i=0;i<a.length;i++){
  const after={...b[i]};for(const k of allowed[a[i].id]||[])after[k]=a[i][k];assert.deepEqual(after,a[i],a[i].id);
  if(allowed[a[i].id]){assert.equal(b[i].title,expectedTitles[a[i].id]);assert.equal(b[i].size,fs.statSync('public/'+b[i].src).size);}
}
assert(!JSON.stringify(b.find(g=>g.id==='lol-player')).includes('17岁'));
const publicAllowlist=['public/index.html','public/games/lol.html','public/games/lol-player.html'];
const tracked=cp.execFileSync('git',['ls-tree','-r','--name-only',base],{encoding:'utf8'}).trim().split('\n');
let unchanged=0;for(const p of tracked.filter(p=>/^(public\/|src\/|migrations\/|\.github\/)/.test(p)&&!publicAllowlist.includes(p))){assert.deepEqual(fs.readFileSync(p),read(p),p);unchanged++;}
const changed=cp.execFileSync('git',['diff',base,'--name-only','--','public'],{encoding:'utf8'}).trim().split('\n').sort();assert.deepEqual(changed,[...publicAllowlist].sort());
console.log(JSON.stringify({passed:true,base,publicAllowlist,unchangedFiles:unchanged,order:b.map(g=>g.id),hostSha256:hash(now),games:Object.fromEntries(b.filter(g=>allowed[g.id]).map(g=>[g.id,{title:g.title,bytes:g.size,sha256:hash(fs.readFileSync('public/'+g.src))}]))},null,2));
