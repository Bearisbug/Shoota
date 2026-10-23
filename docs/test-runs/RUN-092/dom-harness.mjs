const decode=s=>String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const encode=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const camel=s=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
const voidTags=new Set(['INPUT','BR','HR','IMG','META','LINK','AREA','BASE','COL','EMBED','PARAM','SOURCE','TRACK','WBR']);
function documentDouble(){
 const handlers={};let doc;
 class Element{
  constructor(tag){this.tagName=String(tag).toUpperCase();this.ownerDocument=doc;this.parentNode=null;this.childNodes=[];this.attributes={};this.scrollTop=0;this._value=undefined;this.style={setProperty(k,v){this[k]=String(v);}};}
  get firstElementChild(){return this.children[0]||null;}
  get children(){return this.childNodes.filter(n=>n instanceof Element);}
  get className(){return this.attributes.class||'';}set className(v){this.attributes.class=String(v);}
  get id(){return this.attributes.id||'';}set id(v){this.attributes.id=String(v);}
  get dataset(){return Object.fromEntries(Object.entries(this.attributes).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[camel(k.slice(5)),v]));}
  get disabled(){return 'disabled'in this.attributes;}set disabled(v){if(v)this.attributes.disabled='';else delete this.attributes.disabled;}
  get value(){return this._value??this.attributes.value??(this.tagName==='SELECT'?this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'':'');}set value(v){this._value=String(v);}
  get elements(){return Object.fromEntries(this.querySelectorAll('input,select,textarea').filter(n=>n.attributes.name).map(n=>[n.attributes.name,n]));}
  get classList(){return {contains:n=>this.className.split(/\s+/).includes(n),add:(...v)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...v])].join(' ');},remove:(...v)=>{this.className=this.className.split(/\s+/).filter(n=>!v.includes(n)).join(' ');},toggle:(n,force)=>{const yes=force===undefined?!this.className.split(/\s+/).includes(n):!!force;if(yes)this.classList.add(n);else this.classList.remove(n);return yes;}};}
  get isConnected(){return this===doc.documentElement||!!this.parentNode?.isConnected;}
  setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}removeAttribute(k){delete this.attributes[k];}
  appendChild(n){if(n.parentNode)n.parentNode.removeChild(n);n.parentNode=this;this.childNodes.push(n);return n;}
  removeChild(n){this.childNodes=this.childNodes.filter(x=>x!==n);n.parentNode=null;return n;}
  remove(){this.parentNode?.removeChild(this);}focus(){doc.activeElement=this;}click(){if(this.disabled)return;this.onclick?.({target:this});handlers.click?.({target:this});}scrollIntoView(){}
  closest(selector){for(let n=this;n;n=n.parentNode)if(matches(n,selector))return n;return null;}
  querySelector(selector){for(const c of this.children){if(matches(c,selector))return c;const found=c.querySelector(selector);if(found)return found;}return null;}
  querySelectorAll(selector){const found=[];const visit=n=>{for(const c of n.children){if(matches(c,selector))found.push(c);visit(c);}};visit(this);return found;}
  get textContent(){return this.childNodes.map(n=>typeof n==='string'?decode(n):n.textContent).join('');}set textContent(value){this.childNodes=[String(value??'')];}
  get innerHTML(){return this.childNodes.map(n=>typeof n==='string'?n:n.outerHTML).join('');}
  set innerHTML(value){
   for(const child of this.children)child.parentNode=null;this.childNodes=[];
   const stack=[this],tokens=String(value).match(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|[^<]+|</g)||[];
   for(const token of tokens){
    if(token.startsWith('<!--'))continue;
    if(/^<\//.test(token)){const closing=token.match(/^<\/([^\s>]+)/)[1].toUpperCase();for(let i=stack.length-1;i>0;i--)if(stack[i].tagName===closing){stack.length=i;break;}continue;}
    if(/^<[A-Za-z]/.test(token)){
     const tag=token.match(/^<([^\s/>]+)/)[1],node=new Element(tag),attrs=token.slice(tag.length+1).replace(/\/?\s*>$/,'');
     for(const m of attrs.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))node.setAttribute(m[1],decode(m[2]??m[3]??m[4]??''));
     stack.at(-1).appendChild(node);if(!voidTags.has(node.tagName)&&!token.endsWith('/>'))stack.push(node);
    }else stack.at(-1).childNodes.push(token);
   }
  }
  get outerHTML(){const attrs=Object.entries(this.attributes).map(([k,v])=>' '+k+'="'+encode(v)+'"').join('');return '<'+this.tagName.toLowerCase()+attrs+'>'+this.innerHTML+(voidTags.has(this.tagName)?'':'</'+this.tagName.toLowerCase()+'>');}
 }
 function simple(node,selector){
  if(!(node instanceof Element))return false;
  const negatives=[...selector.matchAll(/:not\(([^()]*)\)/g)].map(m=>m[1]);selector=selector.replace(/:not\([^()]*\)/g,'');
  if(negatives.some(s=>simple(node,s)))return false;
  if(selector.includes(':disabled')){if(!node.disabled)return false;selector=selector.replace(':disabled','');}
  const tag=selector.match(/^[A-Za-z][\w-]*/)?.[0];if(tag&&node.tagName!==tag.toUpperCase())return false;
  for(const m of selector.matchAll(/#([\w-]+)/g))if(node.id!==m[1])return false;
  for(const m of selector.matchAll(/\.([\w-]+)/g))if(!node.classList.contains(m[1]))return false;
  for(const m of selector.matchAll(/\[([^\s\]=]+)(?:\s*=\s*["']?([^\]"']*)["']?)?\]/g)){if(!(m[1]in node.attributes))return false;if(m[2]!==undefined&&node.attributes[m[1]]!==m[2])return false;}
  return true;
 }
 function matches(node,selector){return selector.split(',').some(branch=>{const tokens=branch.trim().split(/\s+(?![^\[]*\])/);let n=node;if(!simple(n,tokens.pop()))return false;while(tokens.length){const wanted=tokens.pop();n=n.parentNode;while(n&&!simple(n,wanted))n=n.parentNode;if(!n)return false;}return true;});}
 doc={getElementById:id=>doc.querySelector('#'+id),hidden:false,activeElement:null,addEventListener(k,fn){handlers[k]=fn;},createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),querySelector:q=>doc.documentElement.querySelector(q),querySelectorAll:q=>doc.documentElement.querySelectorAll(q)};
 doc.documentElement=new Element('html');doc.documentElement.ownerDocument=doc;doc.body=doc.createElement('body');doc.documentElement.appendChild(doc.body);doc.activeElement=doc.body;
 doc.body.innerHTML='<div id="app"></div><div id="modal-root"></div><div id="toast"></div>';return {doc,handlers};
}

export {documentDouble};
