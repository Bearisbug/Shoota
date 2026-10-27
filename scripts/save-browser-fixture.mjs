// Local QA only. Writes to an explicit output directory; never edits public/.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const out=resolve(process.argv[2]||'output/save-qa/after/public');
if(out===resolve('public')||out.startsWith(resolve('public')+'/'))throw Error('QA must remain outside public');
mkdirSync(out,{recursive:true});
let html=readFileSync(join(out,'index.html'),'utf8');
const controls=`
// QA-only transaction fault controls, visible in the local preview.
const qa={mode:'ok',quota:false,waiting:[]};
const realWrite=IDB.writeSave;
IDB.writeSave=async function(key,value){
 if(qa.mode==='fail')throw new Error('QA write failure');
 if(qa.mode==='hold')await new Promise((resolve,reject)=>qa.waiting.push({resolve,reject}));
 return realWrite(key,value);
};
const originalSet=Storage.prototype.setItem;
Storage.prototype.setItem=function(key,value){if(qa.quota&&key.startsWith('changju.pending.'))throw new DOMException('QA quota','QuotaExceededError');return originalSet.call(this,key,value)};
window.addEventListener('message',e=>{if(!P||e.source!==P.frame?.contentWindow||!e.data?.qa)return;const m=e.data;
 if(m.qa==='mode'){qa.mode=m.value;if(m.value!=='hold')for(const p of qa.waiting.splice(0)){if(m.value==='fail')p.reject(Error('QA abort'));else p.resolve()}}
 if(m.qa==='quota')qa.quota=m.value;
});
`;
const marker='/* ───────── 账号 ───────── */';if(!html.includes(marker))throw Error('Missing host marker');html=html.replace(marker,controls+'\n'+marker);
const game=`<!doctype html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本地存档故障夹具</title><style>body{font:16px/1.5 system-ui;margin:16px;background:#171717;color:#eee}button{font:inherit;margin:4px;padding:8px}output{display:block;overflow-wrap:anywhere}fieldset{margin:12px 0}input{width:10ch;font:inherit}</style></head><body><h1>本地存档故障夹具</h1><p>只用于平台保存验收，不属于游戏。</p><output id="value"></output><fieldset><legend>存档操作</legend><input aria-label="进度值" id="input" value="1"><button id="write">写入进度</button><button id="burst">连续写入100次</button><button id="same">原样写回</button><button id="probe">临时写入后删除</button></fieldset><fieldset><legend>事务故障</legend><button data-mode="hold">暂停事务完成</button><button data-mode="fail">使事务失败</button><button data-mode="ok">恢复存档库</button><button id="quota">禁止恢复记录</button><button id="unquota">恢复临时记录</button></fieldset><output id="mode">存档库可用</output><script>
function show(){document.querySelector('#value').textContent='当前进度：'+(localStorage.getItem('qa-save')||'无')}
function write(v){localStorage.setItem('qa-save',v);show()}
document.querySelector('#write').onclick=()=>write(document.querySelector('#input').value);
document.querySelector('#burst').onclick=()=>{for(let i=1;i<=100;i++)write(String(i))};
document.querySelector('#same').onclick=()=>{const v=localStorage.getItem('qa-save');if(v!==null)write(v)};
document.querySelector('#probe').onclick=()=>{localStorage.setItem('qa-probe','1');localStorage.removeItem('qa-probe')};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{parent.postMessage({qa:'mode',value:b.dataset.mode},'*');document.querySelector('#mode').textContent=b.textContent});
document.querySelector('#quota').onclick=()=>{parent.postMessage({qa:'quota',value:true},'*');document.querySelector('#mode').textContent='临时恢复写入已禁止'};
document.querySelector('#unquota').onclick=()=>{parent.postMessage({qa:'quota',value:false},'*');document.querySelector('#mode').textContent='临时恢复写入已恢复'};
show();<\/script></body></html>`;
// Use the actual platform iframe loader with an embedded QA-only game. Catalog and games stay untouched.
html=html.replace("const EMBED = window.__CJ_GAMES__ || null;",`const EMBED = {'yike':${JSON.stringify(Buffer.from(game).toString('base64'))}};`);
writeFileSync(join(out,'faults.html'),html);
console.log(join(out,'faults.html'));
