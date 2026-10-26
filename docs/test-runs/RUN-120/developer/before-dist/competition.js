(function(root){
'use strict';
const E=root.AIR_ENGINE||(typeof require!=='undefined'?require('./engine'):null),D=root.AIR_DATA||(typeof require!=='undefined'?require('./data'):null),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const pair=(a,b)=>[a,b].sort().join('-'),profiles=new Map(),offers=new Map(),airportWeights=new Map();
function trafficModel(id){return E.model(id)||(/747|767|777|787|A330|A340|A350|宽体/.test(id)?{seats:310,range:12000,type:'宽体客机'}:/Dash|CRJ|区域|支线/.test(id)?{seats:90,range:3000,type:'支线客机'}:{seats:180,range:6000,type:'窄体客机'});}
function trafficCarriers(s){
 const epoch=Math.floor((s.week-1)/13);if(profiles.has(epoch))return profiles.get(epoch);
 const rows=D.airlines.filter(a=>a.style!=='货运').map(a=>{const p=E.airlineProfile({...s,week:epoch*13+1},a.code,true),seats=p.mix.reduce((n,x)=>n+trafficModel(x.id).seats*x.count,0),wide=p.mix.reduce((n,x)=>n+(trafficModel(x.id).type==='宽体客机'?x.count:0),0)/p.fleet,transferRate=a.style==='低成本'?.03:clamp(.10+wide*.25,0,.4),boardings=Math.round(seats*(28-16*wide)*(.72+a.rating*.0013));return {...a,fleet:p.fleet,range:Math.max(...p.mix.map(x=>trafficModel(x.id).range))*.94,wide,transferRate,journeys:Math.round(boardings/(1+transferRate)),boardings};});
 if(profiles.size>4){profiles.clear();offers.clear();}profiles.set(epoch,rows);return rows;
}
function rivalOffers(s,from,to){
 const key=Math.floor((s.week-1)/13)+'|'+pair(from,to);if(offers.has(key))return offers.get(key);
 const km=E.distance(from,to),a=E.ap(from),b=E.ap(to),intl=a.country!==b.country;
 const rows=trafficCarriers(s).flatMap(c=>{const hub=E.ap(c.hub),direct=c.hub===from||c.hub===to||(c.country===a.country||c.country===b.country)&&c.fleet>=80&&(intl?c.wide>.15:true);
 const path=direct?km:E.distance(from,c.hub)+E.distance(c.hub,to),detour=path/Math.max(1,km),legMax=direct?km:Math.max(E.distance(from,c.hub),E.distance(c.hub,to));
 if(km<150||legMax>c.range||!direct&&(detour>1.5||c.style==='低成本'||c.style==='区域'||c.fleet<40))return [];
 const freq=Math.round(clamp(Math.sqrt(c.fleet)*(direct?1:.55),3,28)),wait=direct?0:100+Math.round(100/(1+freq/7)),duration=direct?E.block(from,to)*60:(E.block(from,c.hub)+E.block(c.hub,to))*60+wait;
 const weight=(.6+c.rating/100)*E.frequencyAppeal(freq)*(direct?1.3:1)/(Math.pow(detour,1.6)*(1+wait/360));
 return [{code:c.code,name:c.name,hub:c.hub,direct,detour,duration,wait,freq,price:c.style==='低成本'?.86:1,rating:c.rating,weight}];}).sort((a,b)=>b.weight-a.weight||a.code.localeCompare(b.code)).slice(0,8);
 offers.set(key,rows);return rows;
}
function marketContest(s,from,to,option={}){
 const pressure=clamp(Number(s.marketRivalry?.[pair(from,to)]?.pressure)||0,0,1),rivals=rivalOffers(s,from,to).map((c,i)=>({...c,price:c.price*(1-pressure*(i<3?.12:.04)),freq:c.freq+Math.round(pressure*(i<3?7:2)),response:pressure>.08?(i<3?'降价并加密':'跟进竞争'):'常规经营',weight:c.weight*(1+pressure*(i<3?.38:.12))}));
 const detour=option.detour||1,wait=option.wait||0,price=option.price||1,frequency=option.frequency||7,direct=wait===0,quality=clamp((.4+s.rep/100)*(.55+E.services(s)/40)*(.45+s.reliable/180),.15,2),weight=quality*E.frequencyAppeal(frequency)*(direct?1.3:1)/(Math.pow(detour,1.6)*(1+wait/360)*Math.pow(price,1.65)),other=rivals.reduce((n,c)=>n+c.weight,0)+.6;
 return {from,to,pressure,rivals,weight,share:clamp(weight/(weight+other),0,.9),detour,wait,price,frequency};
}
function competitionFactor(s,r){const p=clamp(Number(s.marketRivalry?.[pair(r.from,r.to)]?.pressure)||0,0,1);return clamp((.85+s.reliable/650)*(1-p*.22),.65,1.02);}
function competitionMarkets(s,network){
 const groups=new Map();for(const r of network.rows){if(!r.active||!r.pax)continue;const key=pair(r.from,r.to),g=groups.get(key)||{from:r.from,to:r.to,local:0,transfer:0,via:new Set(),routes:new Set(),freq:0};g.local+=r.localPax??Math.max(0,r.pax-r.transferPax);g.freq+=r.freq;g.routes.add(r.id);groups.set(key,g);}
 for(const c of network.connections){const key=pair(c.from,c.to),g=groups.get(key)||{from:c.from,to:c.to,local:0,transfer:0,via:new Set(),routes:new Set(),freq:0};g.transfer+=c.pax;g.via.add(c.hub);g.routes.add(c.firstRoute);g.routes.add(c.secondRoute);groups.set(key,g);}
 return [...groups.values()].map(g=>{const demand=E.marketStats(s,g.from,g.to).demand,own=g.local+g.transfer,contest=marketContest(s,g.from,g.to);return {...g,via:[...g.via],routes:[...g.routes],demand,own,share:demand?Math.min(1,own/demand):0,pressure:contest.pressure,rivals:contest.rivals};}).sort((a,b)=>b.own-a.own||pair(a.from,a.to).localeCompare(pair(b.from,b.to)));
}
function trafficSnapshot(s,network=E.networkForecast(s),report=null){
 const markets=competitionMarkets(s,network),carriers=trafficCarriers(s),losses=new Map();
 const actualRatio=report?clamp(report.network?.journeys/Math.max(1,network.journeys),0,1):1;
 for(const m of markets){const rivals=m.rivals,weight=rivals.reduce((n,r)=>n+r.weight,0);for(const r of rivals)losses.set(r.code,(losses.get(r.code)||0)+m.own*actualRatio*r.weight/Math.max(1,weight));}
 const airlines=carriers.map(c=>({...c,player:false,journeys:Math.max(0,c.journeys-Math.round(losses.get(c.code)||0)),diverted:Math.min(c.journeys,Math.round(losses.get(c.code)||0))}));
 const ownJourneys=report?Math.max(0,report.network?.journeys??report.pax):network.journeys,ownTransfer=report?Math.max(0,report.network?.transferPax||0):network.transferPax;
 airlines.push({code:'player',name:s.name,hub:s.base,player:true,journeys:ownJourneys,transferRate:ownJourneys?ownTransfer/ownJourneys:0,fleet:s.fleet.filter(p=>!p.delivery&&!p.retired).length,diverted:0});airlines.sort((a,b)=>b.journeys-a.journeys||a.code.localeCompare(b.code));airlines.forEach((a,i)=>a.rank=i+1);
 const airports=new Map(D.airports.map(a=>[a.code,{code:a.code,city:a.city,name:a.name,country:a.country,movements:0,own:0,transfers:0,playerHub:s.hubs.some(h=>h.code===a.code)}]));
 for(const c of airlines.filter(c=>!c.player)){const movements=Math.round(c.journeys*(1+c.transferRate))*2,home=airports.get(c.hub);home.movements+=Math.round(movements*.45);let distribution=airportWeights.get(c.code+'|'+c.range+'|'+(c.wide>.4));if(!distribution){const destinations=D.airports.filter(a=>a.code!==c.hub&&E.distance(c.hub,a.code)<=c.range&&(c.style!=='区域'||a.country===c.country)),weights=destinations.map(a=>a.demand*(a.country===c.country?3:c.wide>.4?1:.2));distribution={destinations,weights,sum:weights.reduce((a,b)=>a+b,0)};airportWeights.set(c.code+'|'+c.range+'|'+(c.wide>.4),distribution);}const {destinations,weights,sum}=distribution;let remaining=movements-Math.round(movements*.45);destinations.forEach((a,i)=>{const n=i===destinations.length-1?remaining:Math.min(remaining,Math.floor((movements-Math.round(movements*.45))*weights[i]/sum));airports.get(a.code).movements+=n;remaining-=n;});}
 const rows=report?.rows||network.rows;for(const r of rows){for(const code of [r.from,r.to]){const a=airports.get(code);a.own+=Math.max(0,r.pax);a.movements+=Math.max(0,r.pax);}}
 const transferRatio=network.transferPax?ownTransfer/network.transferPax:0;for(const c of network.connections)airports.get(c.hub).transfers+=c.pax*transferRatio;
 const airportRows=[...airports.values()].map(a=>{const growth=E.airportGrowth(s,a.code),event=E.activeEvents(s).filter(e=>e.regions.includes(a.code)||e.regions.includes(E.ap(a.code).region)||e.regions.includes('ALL')).reduce((v,e)=>v*(e.closed?.5:e.demand||1),1);return {...a,growth,demandFactor:E.airportDemandFactor(s,a.code),movements:a.own+Math.round((a.movements-a.own)*E.airportDemandFactor(s,a.code)*clamp(event,.2,2)),transfers:Math.round(a.transfers)};}).sort((a,b)=>b.movements-a.movements||a.code.localeCompare(b.code));airportRows.forEach((a,i)=>a.rank=i+1);
 return {week:report?.week??s.week,settled:!!report,airlines:airlines.map(({code,name,hub,player,journeys,transferRate,fleet,rank,diverted})=>({code,name,hub,player,journeys,transferRate,fleet,rank,diverted})),airports:airportRows,markets:markets.map(m=>({...m,own:Math.round(m.own*actualRatio),share:m.demand?Math.min(1,m.own*actualRatio/m.demand):0})),transfer:ownTransfer,journeys:ownJourneys};
}
function settleCompetition(s,network,report){
 const snapshot=trafficSnapshot(s,network,report),old=s.trafficReport;s.trafficReport=snapshot;s.marketRivalry||={};
 const active=new Set(snapshot.markets.map(m=>pair(m.from,m.to)));for(const [k,v] of Object.entries(s.marketRivalry))if(!active.has(k)){v.pressure*=.8;if(v.pressure<.01)delete s.marketRivalry[k];}
 const reactions=[];for(const m of snapshot.markets){const key=pair(m.from,m.to),previous=s.marketRivalry[key]?.pressure||0,target=m.own>=300?clamp((m.share-.12)*1.8,0,1):0,pressure=previous*.8+target*.2;s.marketRivalry[key]={pressure,lastWeek:s.week};if(pressure>=.12&&previous<.12&&m.rivals.length)reactions.push(m);}
 const crossed=old?snapshot.airlines.filter(a=>!a.player&&old.airlines.some(o=>o.code===a.code&&o.rank<old.airlines.find(x=>x.player).rank)&&a.rank>snapshot.airlines.find(x=>x.player).rank):[];
 if(s.week-(s.lastCompetitionNewsWeek??-100)>=8&&(reactions.length||crossed.length)){
  const m=reactions[0],news=crossed.length?{title:`周旅客量超越${crossed[0].name}`,text:`本周完成 ${snapshot.journeys.toLocaleString()} 次旅客行程，升至客流榜第 ${snapshot.airlines.find(a=>a.player).rank} 名。`,detail:'同一联程旅客只计一次行程；客流榜独立于品质综合榜。'}:{title:`${E.ap(m.from).city}—${E.ap(m.to).city}市场竞争升温`,text:`你已取得约 ${(m.share*100).toFixed(0)}% 的客流份额。${m.rivals[0].name}将逐步降价并加密班次。`,detail:'对手反应将影响后续销量。可优化转机等待、班次、票价及延误保障；不必仅靠扩充飞机。'};
  s.lastCompetitionNewsWeek=s.week;(s.companyNews||=[]).push({...news,key:'competition-'+s.week,type:'competition',priority:98,week:s.week});s.log.unshift({week:s.week,text:news.title+'：'+news.text,type:'info'});
 }
 return snapshot;
}
Object.assign(E,{trafficCarriers,rivalOffers,marketContest,competitionFactor,competitionMarkets,trafficSnapshot,settleCompetition});
})(typeof window!=='undefined'?window:globalThis);
