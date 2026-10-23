import {chromium} from '/tmp/pw/node_modules/playwright-core/index.mjs';import fs from 'node:fs';import assert from 'node:assert/strict';
const out='/Users/leizhang/Documents/shoota/tmp/wt-portrait/docs/test-runs/RUN-101';const b=await chromium.launch({channel:'chrome'});const results=[],errors=[];let p,f;
async function inspect(id,tag,label){await p.waitForTimeout(130);const d=await f.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,body:document.body.innerText.slice(0,90),buttons:[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {label:e.textContent.trim().slice(0,25),x:r.x,right:r.right,y:r.y,bottom:r.bottom}})}));results.push({id,tag,label,...d});assert(d.sw<=d.w+2,id+tag+label+' horizontal '+d.sw);if(['320x568','844x390','1440x900'].includes(tag)&&label==='home')await p.screenshot({path:out+'/'+id+'-matrix-'+tag+'.png'});}
try{for(const id of ['airline-empire']){
 const save=JSON.parse(fs.readFileSync('/tmp/five-'+id+'-save.json'));
 for(const [w,h] of [[390,844]]){
 const c=await b.newContext({viewport:{width:w,height:h}});await c.route('**/api/**',r=>r.fulfill({status:204}));p=await c.newPage();p.on('pageerror',e=>errors.push({id,error:e.message}));await p.goto('http://127.0.0.1:8799/#play-'+id);await p.waitForSelector('iframe');f=p.frames()[1];await f.evaluate(save=>{for(const[k,v]of Object.entries(save))localStorage.setItem(k,v)},save);await p.waitForTimeout(1700);await p.reload();await p.waitForSelector('iframe');f=p.frames()[1];await f.waitForSelector('body');if(id==='entertainment-career')await f.locator('[data-a=continue]').click();await inspect(id,w+'x'+h,'home');
 if(id==='airline-empire'){
 if(await f.locator('#mobile-view:visible').count())await f.locator('#mobile-view').selectOption('ranking');else await f.locator('[data-view=ranking]:visible').first().click();
 await inspect(id,w+'x'+h,'ranking');await f.locator('[data-action=airlineDetail]').first().click();await inspect(id,w+'x'+h,'dossier');await p.screenshot({path:out+'/dossier-'+w+'x'+h+'.png'});await f.locator('.modal [data-action=closeModal]:visible').click();
 const next=f.locator('[data-action=page][data-key=ranking]:not([disabled])');if(await next.count())await next.last().click();await inspect(id,w+'x'+h,'ranking-page');}
 if(id==='rental-empire'){await f.getByRole('button',{name:/结算本月/}).click();await inspect(id,w+'x'+h,'report');await f.getByRole('button',{name:/前往.*月/}).click();}
 if(id==='football-manager'){await f.locator('[data-go=squad]').filter({visible:true}).first().click();await inspect(id,w+'x'+h,'squad');await f.locator('.roster-name').first().click();await inspect(id,w+'x'+h,'player');await f.locator('.overlay:last-child [data-close]').first().click();}
 if(id==='entertainment-career'){if(await f.locator('[data-a="agent:1"]').count())await f.locator('[data-a="agent:1"]').click();for(let i=0;i<30&&await f.locator('[data-a="performance:next"]').count();i++)await f.locator('[data-a="performance:next"]').click();await inspect(id,w+'x'+h,'story');}
 if(w===390&&h===844){await f.evaluate(()=>{const a=[...document.querySelectorAll('body *')].map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);for(const[e,z]of a)if(z>0)e.style.fontSize=z*2+'px'});await inspect(id,'200percent','text');await p.screenshot({path:out+'/'+id+'-text200.png'});}
 await c.close();
 }console.log('MATRIX PASS',id);
 }assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(out+'/rankings-final-label.json',JSON.stringify({results,errors},null,2));
console.log('PASS',results.length,'layouts');
}catch(e){fs.writeFileSync(out+'/ranking-failure.json',JSON.stringify({error:e.stack,results,errors},null,2));await p.screenshot({path:out+'/ranking-failure.png'});console.error(e);process.exitCode=1}finally{await b.close()}
