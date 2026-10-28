const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const vm = require('node:vm');
const crypto = require('node:crypto');
const base = '9b0655567e790db60e38d0801d3534fafc66a057';
const expected = 'spud-dawn one-in-billions airline-empire f1-driver nba football-manager f1 basketball-star wealth-reborn rental-empire douluo cba lol entertainment-career football-career one-thought-immortal yike hougong yexiao'.split(' ');
const old = cp.execFileSync('git', ['show', `${base}:public/index.html`], {encoding:'utf8'});
const html = process.argv.includes('--baseline') ? old : fs.readFileSync('public/index.html','utf8');
const pattern = /const CATALOG = (\[[\s\S]*?\n\]);/;
const parse = source => JSON.parse(JSON.stringify(vm.runInNewContext(source.match(pattern)[1])));
const before = parse(old), after = parse(html);
assert.deepEqual(after.map(g => g.id), expected);
assert.equal(after.length, 19);
const moved = ['one-in-billions', 'airline-empire', 'rental-empire'];
assert.deepEqual(after.filter(g=>!moved.includes(g.id)).map(g=>g.id), before.filter(g=>!moved.includes(g.id)).map(g=>g.id));
for (const game of after) assert.deepEqual(game, before.find(g=>g.id===game.id));
assert.equal(old.replace(pattern, 'CATALOG'),html.replace(pattern,'CATALOG'));
// Compare raw complete entry chunks, including original separators, by ID.
const raw = source => {
  const body = source.match(pattern)[1].slice(2,-2);
  const starts = [...body.matchAll(/^\{ id:'([^']+)'/gm)];
  return Object.fromEntries(starts.map((m,i)=>[m[1],body.slice(m.index,starts[i+1]?.index??body.length)]));
};
assert.deepEqual(raw(html),raw(old));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const files = cp.execFileSync('git',['ls-tree','-r','--name-only',base,'public/games','public/covers','src','.github/workflows'],{encoding:'utf8'}).trim().split('\n');
const fingerprints = {};
for(const file of files){
  const current = fs.readFileSync(file);
  const previous = cp.execFileSync('git',['show',`${base}:${file}`],{maxBuffer:20*1024*1024});
  assert.ok(current.equals(previous),file);
  fingerprints[file]={bytes:current.length,sha256:sha(current)};
}
console.log(JSON.stringify({base,order:expected,objectsUnchanged:19,rawEntriesUnchanged:19,hostOutsideCatalogUnchanged:true,bytes:Buffer.byteLength(html),sha256:sha(html),fingerprints},null,2));
