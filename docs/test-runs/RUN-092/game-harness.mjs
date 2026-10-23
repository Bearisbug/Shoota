import fs from 'node:fs';
import vm from 'node:vm';
import { documentDouble } from './dom-harness.mjs';

export function game({file = new URL('../../../public/games/douluo.html', import.meta.url), saved, seed = 31} = {}) {
  const html = fs.readFileSync(file, 'utf8');
  const {doc, handlers} = documentDouble();
  const storage = new Map(saved ? [['douluo-wanxiang-v2', JSON.stringify(saved)]] : []);
  const timers = [];
  const random = Object.create(Math);
  random.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const m of html.matchAll(/<script type="application\/json" id="([^"]+)">([\s\S]*?)<\/script>/g)) {
    const node = doc.createElement('script');
    node.id = m[1];
    node.textContent = m[2];
    doc.body.appendChild(node);
  }
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const names = [...script.matchAll(/^function (\w+)\(/gm)].map(m => m[1]);
  const constants = ['PACKS','P_BY','TREAS','T_BY','FACS','F_BY','HUNT_ZONES','TERR','GOD_TRIALS','RC','RCN','END_YEAR','MSTEP','WORLD','DUEL_DB','NPC_MID','NPC_YOUNG','COMMON','WEV','CANON','DIVINE_SEATS','DIVINE_INTRUDERS'];
  const capture = `
    globalThis.gameAPI = {${[...new Set([...names,...constants])].join(',')},
      state:()=>S, run:()=>S.run, replace:s=>S=s,
      setTab:(t,sub)=>{TAB=t;if(sub)WSUB=sub;render()},
      setRandom:v=>{Math.random=()=>v}
    };
  `;
  const i = script.lastIndexOf('})();');
  const ctx = vm.createContext({
    document: doc, console, Math: random, Date,
    localStorage: {getItem:k => storage.get(k) ?? null, setItem:(k,v) => storage.set(k,String(v))},
    setTimeout:fn => {timers.push(fn);return timers.length},
    clearTimeout:()=>{}, setInterval:()=>1, clearInterval:()=>{},
    requestAnimationFrame:()=>1, scrollTo:()=>{},
    Blob, URL, structuredClone
  });
  ctx.window = ctx;
  vm.runInContext(script.slice(0,i)+capture+script.slice(i), ctx, {timeout: 10000});
  return {
    api:ctx.gameAPI, doc, storage, handlers, timers, ctx,
    text:()=>doc.querySelector('#app').textContent,
    html:()=>doc.querySelector('#app').innerHTML,
    click:selector=>{
      const node = doc.querySelector(selector);
      if(!node) throw new Error('Missing control: '+selector);
      if(node.disabled) throw new Error('Disabled control: '+selector);
      node.click();
    },
    closeModals:()=>doc.querySelectorAll('.modal').forEach(n=>n.remove())
  };
}
