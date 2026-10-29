const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict'),vm=require('vm'),crypto=require('crypto');
const base='a38de8cc12d03137f4c43c38ae9466e9e0b46655';
const read=p=>cp.execFileSync('git',['show',base+':'+p],{maxBuffer:40*1024*1024});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const old=read('public/index.html').toString(),now=fs.readFileSync('public/index.html','utf8');
const rx=/const CATALOG = (\[[\s\S]*?\n\]);/;
assert.equal(old.replace(rx,'CATALOG'),now.replace(rx,'CATALOG'),'host outside catalog unchanged');
const catalog=s=>JSON.parse(JSON.stringify(vm.runInNewContext(s.match(rx)[1])));
const a=catalog(old),b=catalog(now);assert.equal(b.length,20);assert.deepEqual(b.map(g=>g.id),a.map(g=>g.id));
for(let i=0;i<a.length;i++){
 const after={...b[i]};if(a[i].id==='one-in-billions'){after.size=a[i].size;after.about=a[i].about;}
 assert.deepEqual(after,a[i],a[i].id);
}
const life=b.find(g=>g.id==='one-in-billions');assert.equal(b[1].id,life.id);assert.equal(life.title,'此生');assert.equal(life.size,fs.statSync('public/'+life.src).size);
assert.equal(b.find(g=>g.id==='lol').title,'我在LOL建银河战队');assert.equal(b.find(g=>g.id==='lol-player').title,'我是职业通天代');
const publicAllowlist=['public/index.html','public/games/one-in-billions.html'];
const tracked=cp.execFileSync('git',['ls-tree','-r','--name-only',base],{encoding:'utf8'}).trim().split('\n');
let unchanged=0;for(const p of tracked.filter(p=>/^(public\/|src\/|migrations\/|\.github\/)/.test(p)&&!publicAllowlist.includes(p))){assert.deepEqual(fs.readFileSync(p),read(p),p);unchanged++;}
const changed=cp.execFileSync('git',['diff',base,'--name-only','--','public'],{encoding:'utf8'}).trim().split('\n').sort();assert.deepEqual(changed,[...publicAllowlist].sort());
console.log(JSON.stringify({passed:true,base,publicAllowlist,unchangedFiles:unchanged,order:b.map(g=>g.id),hostSha256:hash(now),game:{title:life.title,bytes:life.size,sha256:hash(fs.readFileSync('public/'+life.src))}},null,2));
