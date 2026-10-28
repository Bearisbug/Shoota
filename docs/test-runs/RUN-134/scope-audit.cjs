const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const vm = require('node:vm');
const base = 'f85fcac2d3f9779e371889b73a4f808bf66abae3';
const previous = cp.execFileSync('git', ['show', `${base}:public/index.html`], {encoding:'utf8'});
const current = fs.readFileSync('public/index.html', 'utf8');
const before = '{\n  "id": "one-in-billions",\n  "title": "此生",';
const after = "{ id:'one-in-billions', title:'此生',";
assert.equal(previous.split(before).length, 2);
assert.equal(current, previous.replace(before, after));
const catalog = html => JSON.parse(JSON.stringify(vm.runInNewContext(html.match(/const CATALOG = (\[[\s\S]*?\n\]);/)[1])));
assert.deepEqual(catalog(current), catalog(previous));
const unchanged = ['src/worker.js', 'public/games', 'public/covers', '.github/workflows'];
assert.equal(cp.execFileSync('git', ['diff', base, '--', ...unchanged], {encoding:'utf8'}), '');
console.log(JSON.stringify({ base, exactPrefixReplacementOnly:true, catalogValuesIdentical:true, unchanged,
  bytes:Buffer.byteLength(current), sha256:crypto.createHash('sha256').update(current).digest('hex') }, null, 2));
