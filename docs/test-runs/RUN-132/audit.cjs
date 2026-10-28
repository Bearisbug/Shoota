const fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base='d14f12a0f7c5814aa05b85325d57893a61842989';
const before=cp.execFileSync('git',['show',base+':public/index.html'],{encoding:'utf8'}),after=fs.readFileSync('public/index.html','utf8');
const re=/const CATALOG = (\[[\s\S]*?\n\]);/;
const read=s=>JSON.parse(JSON.stringify(vm.runInNewContext(s.match(re)[1],Object.create(null))));
const old=read(before),current=read(after),ids=current.map(x=>x.id);
assert.equal(old.length,18);assert.equal(current.length,19);
assert.deepEqual(ids.filter(x=>x!=='one-in-billions'),old.map(x=>x.id));
const i=ids.indexOf('one-in-billions');assert.equal(ids[i-1],'one-thought-immortal');assert.equal(ids[i+1],'yike');
for(const g of old){const n={...current.find(x=>x.id===g.id)};if(g.id==='airline-empire'){assert.equal(n.size,1378006);n.size=g.size;}assert.deepEqual(n,g);}
assert.equal(before.replace(re,'CATALOG'),after.replace(re,'CATALOG'));
assert.equal(ids.some(x=>/gaowu|global-martial/.test(x)),false);
const expected={'public/games/airline-empire.html':'16aaba838c19cfa1a7626397ed4e233e445a250e59cce65f285ecf26d9d6af7d','public/games/one-in-billions.html':'03ead76cf58e97f195e80b5b67a46a99345b6b4d1ae1094a08b36922f90e26e1','public/covers/one-in-billions.jpg':'b026d8acd7a8603f2c8e467eafcaf4cc52a7f288cff8d396881e42dfc259c2a0'};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),files={};
for(const [p,h]of Object.entries(expected)){const b=fs.readFileSync(p);assert.equal(sha(b),h);files[p]={sha256:h,bytes:b.length};}
files['public/index.html']={sha256:sha(Buffer.from(after)),bytes:Buffer.byteLength(after)};
for(const p of cp.execFileSync('git',['ls-tree','-r','--name-only',base,'public/games','public/covers','src','.github'],{encoding:'utf8'}).trim().split('\n')){if(p==='public/games/airline-empire.html')continue;assert.deepEqual(fs.readFileSync(p),cp.execFileSync('git',['show',base+':'+p],{maxBuffer:20*1024*1024}));}
console.log(JSON.stringify({base,files,gameCount:ids.length,order:ids,oldEntriesUnchangedExceptAirlineSize:true,hostOutsideCatalogUnchanged:true,allOtherTrackedGamesCoversWorkerWorkflowsUnchanged:true},null,2));
