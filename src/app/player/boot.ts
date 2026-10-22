// 旧单文件游戏的注入脚本（Platform 1.0，API-SDK-004）。LEGACY_BOOT 逐字取自 dd731d6 public/index.html 的 BOOT，
// 接管 localStorage、提供 window.Platform；BOOT_SIGNALS 是新加的两条启动信号，游戏看不到：
// 页面解析完（DOMContentLoaded）发 boot-ready，就绪前的第一个未捕获错误发 boot-error。

import type { LegacyInit } from '../../shared/protocol';

// 注入到游戏里的引导脚本：接管 localStorage、提供 Platform SDK
export const LEGACY_BOOT = `
var post=function(m){m.__cj=1;try{parent.postMessage(m,'*')}catch(e){}};
var data=I.storage||{},has=function(k){return Object.prototype.hasOwnProperty.call(data,k)};
var ls={getItem:function(k){k=String(k);return has(k)?data[k]:null},
setItem:function(k,v){k=String(k);v=String(v);data[k]=v;post({type:'ls-set',k:k,v:v})},
removeItem:function(k){k=String(k);if(has(k)){delete data[k];post({type:'ls-del',k:k})}},
clear:function(){for(var k in data)delete data[k];post({type:'ls-clear'})},
key:function(i){var ks=Object.keys(data);return i<ks.length?ks[i]:null}};
Object.defineProperty(ls,'length',{get:function(){return Object.keys(data).length}});
var lsp=typeof Proxy==='function'?new Proxy(ls,{get:function(t,p){if(p in t)return t[p];if(typeof p==='string'&&has(p))return data[p];return undefined},set:function(t,p,v){t.setItem(p,v);return true},deleteProperty:function(t,p){t.removeItem(p);return true}}):ls;
var sd={},ss={getItem:function(k){return Object.prototype.hasOwnProperty.call(sd,k)?sd[k]:null},setItem:function(k,v){sd[String(k)]=String(v)},removeItem:function(k){delete sd[k]},clear:function(){sd={}},key:function(i){return Object.keys(sd)[i]||null}};
try{Object.defineProperty(window,'localStorage',{configurable:true,get:function(){return lsp}})}catch(e){}
try{Object.defineProperty(window,'sessionStorage',{configurable:true,get:function(){return ss}})}catch(e){}
var done={};
window.Platform=Object.freeze({version:'1.0',game:I.game,user:I.user,
unlock:function(k){k=String(k);if(done[k])return;done[k]=1;post({type:'unlock',key:k})},
defineAchievements:function(list){try{post({type:'defs',list:JSON.parse(JSON.stringify(list||[]))})}catch(e){}},
setStatus:function(t){post({type:'status',text:String(t).slice(0,60)})},
exit:function(){post({type:'exit'})}});
`;

export const BOOT_SIGNALS = `
var bootReady=0,bootFailed=0;
var bootErr=function(e){if(bootReady||bootFailed)return;bootFailed=1;var m='error';try{m=String(e&&(e.message||(e.reason&&e.reason.message)||e.reason)||'error').slice(0,200)}catch(x){}post({type:'boot-error',message:m})};
try{window.addEventListener('error',bootErr);window.addEventListener('unhandledrejection',bootErr)}catch(e){}
try{document.addEventListener('DOMContentLoaded',function(){bootReady=1;post({type:'boot-ready'})})}catch(e){}
`;

export const BOOT = LEGACY_BOOT + BOOT_SIGNALS;

// 把引导脚本插在第一个 <head…> 之后；没有 head 插在 <!doctype…> 之后；都没有就放最前（与旧版 inject 相同）
export function inject(html: string, init: LegacyInit, boot: string = BOOT): string {
  const json = JSON.stringify(init).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const tag = '<script>(function(){var I=' + json + ';' + boot + '})();<\/script>';
  const head = html.match(/<head[^>]*>/i);
  if (head && head.index !== undefined) return html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length);
  const dt = html.match(/<!doctype[^>]*>/i);
  if (dt && dt.index !== undefined) return html.slice(0, dt.index + dt[0].length) + tag + html.slice(dt.index + dt[0].length);
  return tag + html;
}

