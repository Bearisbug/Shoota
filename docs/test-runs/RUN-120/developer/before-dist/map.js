/* Display geometry only. Operating distance remains the engine's great-circle distance. */
(function(root){
function project(lon,lat,mode='world'){return mode==='china'?[(lon-72)/67*1000,(56-lat)/45*450]:[((lon+25+360)%360)/360*1000,(85-lat)/145*450];}
function curves(a,b,mode='world'){
 let [x1,y1]=project(a.lon,a.lat,mode),[x2,y2]=project(b.lon,b.lat,mode);
 if(mode==='world'){
  const america=r=>['NA','LA'].includes(r),asia=r=>['CN','EA','SEA','SA','CA','OC'].includes(r);
  if(asia(a.region)&&america(b.region)){if(x2<x1)x2+=1000;}
  else if(america(a.region)&&asia(b.region)){if(x2>x1)x2-=1000;}
  else if(x2-x1>500)x2-=1000;else if(x2-x1< -500)x2+=1000;
 }
 const bend=Math.min(65,Math.abs(x2-x1)*.18+12),cy=Math.max(8,(y1+y2)/2-bend);
 const shifts=mode==='world'?[-1000,0,1000]:[0];
 return shifts.filter(k=>Math.max(x1+k,x2+k)>=0&&Math.min(x1+k,x2+k)<=1000).map(k=>({x1:x1+k,x2:x2+k,d:`M${x1+k},${y1} Q${(x1+x2)/2+k},${cy} ${x2+k},${y2}`}));
}
function boundaryPaths(line,mode='world'){const runs=[];let run=[];for(const point of line){const p=project(point[0],point[1],mode);if(mode==='world'&&run.length&&Math.abs(p[0]-run.at(-1)[0])>500){if(run.length>1)runs.push(run);run=[];}run.push(p);}if(run.length>1)runs.push(run);return runs.map(points=>'M'+points.map(p=>p.map(n=>n.toFixed(1)).join(',')).join('L'));}
const api={project,curves,boundaryPaths};root.AIR_MAP=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
