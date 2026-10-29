const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function main() {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'src/worker.js'), 'utf8');
  const catalogSource = html.match(/const CATALOG = (\[[\s\S]*?\n\]);/);
  assert.ok(catalogSource, 'Actual platform catalog must be found');
  const catalog = vm.runInNewContext(catalogSource[1]);
  const expected = Object.fromEntries(catalog.map(game => [game.id, game.title]));
  assert.equal(catalog.length, 20);
  assert.equal(Object.keys(expected).length, 20, 'Catalog IDs must be unique');
  assert.equal(expected['one-in-billions'], '此生');
  assert.equal(expected['lol'], 'lol电竞经理');
  assert.equal(expected['lol-player'], 'LOL 选手生涯');

  // Run the production extractor, including its real regex; never duplicate it here.
  const functionSource = worker.match(/async function catalogTitles\(req, env\) \{[\s\S]*?\n\}/);
  assert.ok(functionSource, 'Production title extractor must be found');
  const catalogTitles = vm.runInNewContext(`(${functionSource[0]})`, { Request, URL });
  let fetches = 0;
  const actual = await catalogTitles(new Request('https://catalog.test/kanban/data'), {
    ASSETS: { fetch: async request => {
      fetches++;
      assert.equal(request.url, 'https://catalog.test/');
      return new Response(html, { headers: { 'content-type': 'text/html' } });
    } },
  });
  assert.equal(fetches, 1);
  const missing = Object.keys(expected).filter(id => actual[id] !== expected[id]);
  console.log(JSON.stringify({ expected: 20, actual: Object.keys(actual).length, missing, titles: actual }, null, 2));
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, 'All catalog names must be readable by the Worker');
  console.log('PASS: all 20 catalog titles, including 此生, match the Worker output.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
