(function(root){
'use strict';
const E=root.AIR_ENGINE||(typeof require!=='undefined'?require('./engine.js'):null),D=root.AIR_DATA||(typeof require!=='undefined'?require('./data.js'):null);
const WEEK=10080,classes=['economy','business','first'],cache=new WeakMap(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pair=(a,b)=>[a,b].sort().join('-'),mod=n=>((n%WEEK)+WEEK)%WEEK;
const routeKey=r=>JSON.stringify([r.id,r.from,r.to,r.via,r.stopMinutes,r.plane,r.freq,r.price,r.active,r.schedule,r.autoSpacing]);
function fingerprint(s){return JSON.stringify([s.week,s.date,s.rep,s.baseInfluence,s.service,s.marketing,s.fuelHedge,s.events,s.base,s.hubs,s.networkDisabled,s.marketRivalry,s.airportDevelopment,s.reliable,s.fleet,s.routes.map(routeKey)]);}
function frequencyAppeal(freq){return (.65+.55*(1-Math.exp(-freq/5)))/(.65+.55*(1-Math.exp(-7/5)));}
// Count usable departure times, not route records or all pair combinations.
// Both legs matter: extra feeders help, while a sparse onward bank limits the benefit.
function transferFrequency(paths){
 const hubs=new Map();for(const q of paths){let h=hubs.get(q.hub);if(!h){h={hub:q.hub,feeders:new Map(),onward:new Map()};hubs.set(q.hub,h);}h.feeders.set(q.a.key,q.a.freq);h.onward.set(q.b.key,q.b.freq);}
 const banks=[...hubs.values()].map(h=>{const feeders=[...h.feeders.values()].reduce((n,v)=>n+v,0),onward=[...h.onward.values()].reduce((n,v)=>n+v,0);return {hub:h.hub,feeders,onward,effective:Math.min(feeders,onward)};});
 const effective=banks.reduce((n,h)=>n+h.effective,0);return {banks,effective,appeal:effective?1+.9*(1-Math.exp(-effective/8)):0};
}
// Aircraft on the same city pair share a market, rather than each inventing a new pool.
function shareLocalDemand(s,rows){
 const groups=new Map();for(const r of rows){if(!r.active||!r.pax)continue;const key=pair(r.from,r.to);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 for(const group of groups.values()){
  if(group.length<2)continue;
  for(const k of classes){
   const entries=group.map(r=>({r,c:r.classes[k],n:0})),seats=entries.reduce((n,e)=>n+e.c.seats,0);if(!seats)continue;
   const pool=entries.reduce((n,e)=>n+e.c.potentialPax*e.c.seats,0)/seats;
   for(const e of entries){e.cap=Math.floor(Math.min(e.c.seats*.98,e.c.potentialPax));e.weight=e.c.seats*e.c.potentialPax;}
   let left=Math.floor(Math.min(pool,entries.reduce((n,e)=>n+e.cap,0))),open=entries.filter(e=>e.cap>0);
   while(left>0&&open.length){const weight=open.reduce((n,e)=>n+e.weight,0),full=open.filter(e=>left*e.weight/weight>=e.cap);if(!full.length){for(const e of open)e.n=left*e.weight/weight;break;}for(const e of full){e.n=e.cap;left-=e.cap;}open=open.filter(e=>!full.includes(e));}
   const total=Math.round(entries.reduce((n,e)=>n+e.n,0));let remainder=total-entries.reduce((n,e)=>n+Math.floor(e.n),0);
   for(const e of entries.sort((a,b)=>(b.n%1)-(a.n%1)||a.r.id-b.r.id)){const n=Math.floor(e.n)+(remainder>0&&e.n%1>0?(remainder--,1):0);e.c.pax=n;e.c.revenue=n*(e.c.fare+55)/1e6;e.c.load=e.c.seats?n/e.c.seats:0;}
  }
  for(const r of group){const p=s.fleet.find(p=>p.id===r.plane),m=E.model(p.model),cs=E.cabinStats(m,E.cabinOf(p));let experience=0;r.pax=0;r.revenue=0;r.handling=0;
   for(const k of classes){const c=r.classes[k];r.pax+=c.pax;r.revenue+=c.revenue;r.handling+=c.pax*(35+s.service.meal*13+s.service.cabin*8+(k==='business'?100:k==='first'?250:0))/1e6;experience+=c.pax*(k==='economy'?cs.economyComfort:k==='business'?94:99);}
   r.localPax=r.pax;r.load=r.pax/classes.reduce((n,k)=>n+r.classes[k].seats,0);r.comfort=r.pax?experience/r.pax:cs.comfort;r.cabinImpact=r.pax?(r.comfort-m.comfort)*.035:0;r.cost=r.fuel+r.airport+r.maintenance+r.handling;r.profit=r.revenue-r.cost;
  }
 }
}
function networkForecast(s){
 const key=fingerprint(s),old=cache.get(s);if(old?.key===key)return old.value;
 // Weekly aggregate seats: timetable validation stays in route editing, never in settlement.
 const eligible=s.routes.filter(r=>r.active&&s.fleet.some(p=>p.id===r.plane&&E.planeAvailable(s,p))&&!E.effects(s,r).closed),active=eligible.filter(r=>!(s.networkDisabled||[]).includes(r.plane)),cities=[...new Set(active.flatMap(r=>[r.from,r.to]))],neighbors=new Map();
 for(const r of active)for(const [a,b] of [[r.from,r.to],[r.to,r.from]]){if(!neighbors.has(a))neighbors.set(a,new Set());neighbors.get(a).add(b);}
 const awareness=1+.12*(1-Math.exp(-Math.max(0,cities.length-2)/12));
 const frequencies=new Map();for(const r of eligible){const key=pair(r.from,r.to);frequencies.set(key,(frequencies.get(key)||0)+r.freq);}
 const rows=s.routes.map(r=>{const hubAppeal=1+.08*(1-Math.exp(-Math.max(0,Math.max(neighbors.get(r.from)?.size||0,neighbors.get(r.to)?.size||0)-1)/5)),factor=frequencyAppeal(frequencies.get(pair(r.from,r.to))||r.freq)*awareness*hubAppeal,e=E.estimateLocal(s,r,factor);const {last,...route}=r;return {...route,...e,localPax:e.pax,transferPax:0,transferRevenue:0,frequencyAppeal:frequencyAppeal(r.freq),networkAppeal:awareness*hubAppeal};});
 shareLocalDemand(s,rows);
 const byId=new Map(rows.map(r=>[r.id,r])),trips=[];
 const direct=new Map();
 for(const r of rows.slice().sort((a,b)=>a.id-b.id)){
  if(!active.some(a=>a.id===r.id)||!r.pax||!r.freq)continue;
  const p=s.fleet.find(p=>p.id===r.plane),c=E.cabinOf(p);
  for(const [index,from,to] of [[0,r.from,r.to],[1,r.to,r.from]]){
   const t={key:`${r.id}:${index}`,route:r.id,plane:p.id,from,to,via:r.via||null,freq:r.freq,km:E.routeLegs(r).reduce((n,l)=>n+l.km,0),capacity:{},local:{},transfer:{},spare:{}};
   for(const k of classes){t.capacity[k]=Math.floor(c[k]*r.freq*.98);t.local[k]=Math.floor(r.classes[k].pax/2)+(index===0?r.classes[k].pax%2:0);t.spare[k]=Math.max(0,t.capacity[k]-t.local[k]);t.transfer[k]=0;}
   trips.push(t);const key=from+'-'+to;direct.set(key,(direct.get(key)||0)+classes.reduce((n,k)=>n+t.local[k],0));
  }
 }
 const outbound=new Map();for(const t of trips){if(!outbound.has(t.from))outbound.set(t.from,[]);outbound.get(t.from).push(t);}
 const groups=new Map();
 for(const a of trips)for(const b of outbound.get(a.to)||[]){const points=[a.from,...(a.via?[a.via]:[]),a.to,...(b.via?[b.via]:[]),b.to];if(a.route===b.route||new Set(points).size!==points.length)continue;const km=E.distance(a.from,b.to),path=a.km+b.km;if(km<150||path>km*1.65)continue;
  const intl=[a.from,a.to,b.to].some(c=>E.ap(c).region!=='CN'),min=intl?90:60,wait=min+Math.round(180/(1+Math.min(a.freq,b.freq)/3));
  const id=a.from+'-'+b.to,quality=clamp((1-(path/km-1)*.65)*(1-(wait-min)/900),.15,1),candidate={a,b,from:a.from,to:b.to,hub:a.to,wait,min,quality,path,km};if(!groups.has(id))groups.set(id,[]);groups.get(id).push(candidate);
 }
 const connections=[],markets=[];
 for(const [id,paths] of [...groups].sort(([a],[b])=>a.localeCompare(b))){paths.sort((a,b)=>b.quality-a.quality||a.a.key.localeCompare(b.a.key));const best=paths[0],market=E.marketStats(s,best.from,best.to);if(market.closed)continue;
  // Both directions share the published market pool; subtract own direct passengers first.
  const remaining=Math.max(0,market.demand/2-(direct.get(id)||0)),frequency=transferFrequency(paths),contest=E.marketContest(s,best.from,best.to,{detour:best.path/best.km,wait:best.wait,frequency:frequency.effective,price:(byId.get(best.a.route).price+byId.get(best.b.route).price)/2}),share=clamp(contest.share*awareness*frequency.appeal,0,.9),budget=Math.floor(remaining*share*best.quality);
  const pathWeights=paths.map(q=>classes.some(k=>Math.min(q.a.spare[k],q.b.spare[k])>0)?q.quality/Math.pow((byId.get(q.a.route).price+byId.get(q.b.route).price)/2,1.65):0);let weightLeft=pathWeights.reduce((n,w)=>n+w,0),left=budget,served=0;for(let i=0;i<paths.length&&left>0;i++){const q=paths[i],a=q.a,b=q.b,ra=byId.get(a.route),rb=byId.get(b.route),price=(ra.price+rb.price)/2,available=classes.reduce((n,k)=>n+Math.min(a.spare[k],b.spare[k]),0),weight=pathWeights[i],allWeight=weightLeft;weightLeft=Math.max(0,weightLeft-weight);if(!available)continue;
   const amount=Math.min(left,available,Math.ceil(left*weight/Math.max(weight,allWeight)));if(amount<=0)continue;let needed=amount;
   for(const k of classes){const classLimit=k==='economy'?needed:Math.min(needed,Math.ceil(amount*(k==='business'?.10:.02))),count=Math.min(classLimit,a.spare[k],b.spare[k]);if(!count)continue;
    const multiplier=k==='economy'?1:k==='business'?2.5:4.8,base=Math.max(380,q.km*([a.from,b.to].some(c=>E.ap(c).region!=='CN')?.59:.58)+120),fare=Math.round(base*price*multiplier*.92)+55,revenue=count*fare/1e6,firstShare=a.km/q.path;
    const incomes=[revenue*firstShare,revenue*(1-firstShare)];[a,b].forEach((t,index)=>{const r=byId.get(t.route),p=s.fleet.find(p=>p.id===r.plane),m=E.model(p.model),cs=E.cabinStats(m,E.cabinOf(p)),comfort=k==='economy'?cs.economyComfort:k==='business'?94:99,extra=k==='business'?100:k==='first'?250:0,handling=count*(35+s.service.meal*13+s.service.cabin*8+extra)/1e6;
      r.comfort=(r.comfort*r.pax+comfort*count)/(r.pax+count);r.cabinImpact=(r.comfort-m.comfort)*.035;r.pax+=count;r.transferPax+=count;r.revenue+=incomes[index];r.transferRevenue+=incomes[index];r.handling+=handling;r.cost+=handling;r.profit=r.revenue-r.cost;r.classes[k].pax+=count;r.classes[k].revenue+=incomes[index];r.classes[k].load=r.classes[k].pax/r.classes[k].seats;r.load=r.pax/classes.reduce((n,c)=>n+r.classes[c].seats,0);t.spare[k]-=count;t.transfer[k]+=count;
    });connections.push({from:q.from,to:q.to,hub:q.hub,first:a.key,second:b.key,firstRoute:a.route,secondRoute:b.route,wait:q.wait,min:q.min,quality:q.quality,detour:q.path/q.km,duration:E.block(a.from,a.to)*60+q.wait+E.block(b.from,b.to)*60,class:k,pax:count,revenue,incomes,fare});needed-=count;left-=count;served+=count;
   }
  }markets.push({from:best.from,to:best.to,demand:Math.floor(remaining),budget,served,contest,frequency});
 }
 const transferPax=connections.reduce((n,c)=>n+c.pax,0),transferRevenue=connections.reduce((n,c)=>n+c.revenue,0),hubs=[...neighbors].map(([code,ns])=>{const cs=connections.filter(c=>c.hub===code),pax=cs.reduce((n,c)=>n+c.pax,0),destinations=ns.size;return {code,destinations,pax,role:destinations>=12&&pax>=500?'国际网络枢纽':destinations>=5&&pax>=100?'区域转运枢纽':destinations>=2&&pax>0?'成长型中转站':'点对点航站'};}).sort((a,b)=>b.pax-a.pax||b.destinations-a.destinations);
 const value={rows,trips,connections,markets,hubs,cities:cities.length,awareness,transferPax,transferRevenue,journeys:rows.reduce((n,r)=>n+r.pax,0)-transferPax};cache.set(s,{key,value});return value;
}
function networkEstimate(s,r){const existing=s.routes.find(x=>x.id===r.id);if(existing&&routeKey(existing)===routeKey(r))return networkForecast(s).rows.find(x=>x.id===r.id);const id=r.id??-1,copy={...s,routes:existing?s.routes.map(x=>x.id===r.id?{...r,id}:x):[...s.routes,{...r,id}]};return networkForecast(copy).rows.find(x=>x.id===id);}
function expansionOptions(s,from=s.base){
 const network=networkForecast(s),linked=new Set(s.routes.filter(r=>r.active).flatMap(r=>[r.from,r.to])),owned=new Set(s.routes.map(r=>pair(r.from,r.to))),planes=s.fleet.filter(p=>E.planeAvailable(s,p)&&E.planeBase(s,p)===from);
 return D.airports.filter(a=>a.code!==from&&!linked.has(a.code)&&!owned.has(pair(from,a.code))&&(s.license||a.region==='CN')).map(a=>{const market=E.marketStats(s,from,a.code),networkMarkets=s.routes.filter(r=>r.active&&(r.from===from||r.to===from)).filter(r=>{const c=r.from===from?r.to:r.from;return (E.distance(c,from)+market.km)<=E.distance(c,a.code)*1.65;}).length;return {...market,networkMarkets,priority:market.demand/(1+market.rivals.length*.18)*(1+Math.min(networkMarkets,12)*.04),plane:null,freq:3};}).filter(m=>!m.closed).sort((a,b)=>b.priority-a.priority).slice(0,12).map(m=>{for(const p of planes){try{E.validateRoute(s,{from,to:m.to,plane:p.id,freq:3,price:1,active:true});m.plane=p.id;break;}catch{}}return m;});
}
Object.assign(E,{transferFrequency,networkForecast,networkEstimate,frequencyAppeal,expansionOptions});
})(typeof window!=='undefined'?window:globalThis);
