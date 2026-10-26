(function(root){
'use strict';
const E=root.AIR_ENGINE||(typeof require!=='undefined'?require('./engine.js'):null);
const KEY='skybound-save-v1',BACKUP='skybound-save-backup-v1',UPGRADE='skybound-save-upgrade-backup-v1',RECOVERY='skybound-save-unreadable-v1';
function create(storage){
 let locked=true,lastRaw=null,validatedSchedule=null;
 const read=key=>{if(!storage)throw Error('浏览器存储不可用，请重新尝试；不会创建新局覆盖旧进度。');return storage.getItem(key);};
 const signature=s=>JSON.stringify([s.base,s.hubs,s.fleet.map(p=>[p.id,p.model,p.base]),s.routes.map(r=>[r.id,r.plane,r.from,r.to,r.via,r.stopMinutes,r.freq,r.active,r.schedule,r.autoSpacing])]);
 const parse=(raw,options)=>{let data;try{data=JSON.parse(raw);}catch{throw Error('这份存档内容不完整或已损坏。原始内容已保留，可导出原档或从备份恢复。');}return E.migrateSave(data,options);};
 function load(){try{const raw=read(KEY);if(raw===null){if(read(BACKUP)||read(UPGRADE))throw Error('主存档未找到，但保留了历史备份。请选择一份恢复，避免误开新局。');locked=false;const state=E.migrateSave(E.initial());validatedSchedule=signature(state);return {state,empty:true};}const state=parse(raw);lastRaw=raw;validatedSchedule=signature(state);locked=false;return {state,empty:false,migrated:JSON.parse(raw).saveRevision!==E.SAVE_REVISION};}catch(error){locked=true;return {state:null,empty:false,error:error.message};}}
 function write(state,{replace=false,upgradeRaw=null}={}){
  if(locked&&!replace)throw Error('旧存档尚未恢复，已停止自动写入，原文件保持不变。');
  const key=signature(state),next=E.migrateSave(state,{schedules:replace||key!==validatedSchedule}),serialized=JSON.stringify(next),old=read(KEY);
  if(old!==null&&old!==serialized){let valid=old===lastRaw;if(!valid)try{parse(old);valid=true;}catch{}
   if(!valid&&!replace)throw Error('检测到无法读取的存档，已停止覆盖。请先进入存档恢复。');
   if(valid){storage.setItem(BACKUP,old);if(JSON.parse(old).saveRevision!==E.SAVE_REVISION)storage.setItem(UPGRADE,old);}else storage.setItem(RECOVERY,old);
  }
  if(upgradeRaw&&JSON.parse(upgradeRaw).saveRevision!==E.SAVE_REVISION)storage.setItem(UPGRADE,upgradeRaw);
  if(old!==serialized)storage.setItem(KEY,serialized);locked=false;lastRaw=serialized;validatedSchedule=key;return next;
 }
 function backups(){return [['previous',BACKUP,'上一次自动保存'],['upgrade',UPGRADE,'改版前存档']].flatMap(([id,key,label])=>{try{const raw=read(key);if(!raw)return [];const s=parse(raw);return [{id,label,name:s.name,week:s.week,date:s.date}];}catch{return [];}});}
 function restore(id){const key={previous:BACKUP,upgrade:UPGRADE}[id];if(!key)throw Error('请选择可恢复的备份。');const raw=read(key);if(!raw)throw Error('未找到这份备份。');return write(parse(raw),{replace:true});}
 function raw(id='current'){return read({current:KEY,previous:BACKUP,upgrade:UPGRADE,unreadable:RECOVERY}[id]||KEY);}
 return {load,write,importRaw:raw=>write(parse(raw),{replace:true,upgradeRaw:raw}),backups,restore,raw,isLocked:()=>locked};
}
const S={KEY,BACKUP,UPGRADE,RECOVERY,create};root.AIR_SAVE=S;if(typeof module!=='undefined')module.exports=S;
})(typeof window!=='undefined'?window:globalThis);
