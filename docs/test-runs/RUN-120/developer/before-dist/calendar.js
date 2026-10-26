'use strict';
// Calendar projection only: operating schedules and saved game data stay untouched.
(function(root){
 function project(state,flights,airport,engine){
  const rows=flights.map((flight,index)=>{const c=engine.localClock(state,flight.base,flight.dep,airport);return {flight,index,day:c.day,minute:Number(c.time.slice(0,2))*60+Number(c.time.slice(3)),time:c.time};}).sort((a,b)=>a.day-b.day||a.minute-b.minute||a.flight.plane-b.flight.plane);
  const first=Math.min(0,...rows.map(r=>r.day)),last=Math.max(6,...rows.map(r=>r.day));
  const days=Array.from({length:last-first+1},(_,i)=>{const day=first+i,c=engine.localClock(state,airport,day*1440,airport),items=rows.filter(r=>r.day===day),groups=[];
   for(const row of items){const g=groups.at(-1);if(g&&row.minute-g.minute<48)g.rows.push(row);else groups.push({minute:row.minute,rows:[row]});}
   return {day,date:c.date,weekday:c.weekday,items,groups};
  });return {rows,days};
 }
 const api={project};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AIR_CALENDAR=api;
})(typeof window!=='undefined'?window:globalThis);
