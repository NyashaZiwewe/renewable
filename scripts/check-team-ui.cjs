const fs = require('fs'), vm = require('vm'), assert = require('assert');
class Node {
 constructor(tag='div'){this.tag=tag;this.children=[];this.attrs={};this.events={};this.textContent='';}
 appendChild(child){this.children.push(child);return child;}
 append(...children){children.forEach(c=>this.appendChild(c));}
 replaceChildren(...children){this.children=[];this.append(...children);}
 setAttribute(k,v){this.attrs[k]=v;}
 getAttribute(k){return this.attrs[k];}
 addEventListener(k,fn){this.events[k]=fn;}
 showModal(){this.open=true;}
 close(){this.open=false;if(this.onclose)this.onclose();}
 focus(){this.focused=true;}
}
(async()=>{
 for(const locale of ['en','pt']){
  const mount=new Node(),intro=new Node(),body=new Node();body.attrs['data-locale']=locale;mount.attrs['data-empty']='Empty';mount.attrs['data-error']='Error';
  const members=[{id:'a',name:'Alice Example',title:'Director',summary:'Alice professional summary.\nSecond paragraph.',imageUrl:''},{id:'b',name:'Bob <script>',title:'Engineer',summary:'Bob professional summary.',imageUrl:'https://example.test/bob.jpg?size=300'}];
  const document={body,querySelector:s=>s==='[data-team-list]'?mount:intro,createElement:t=>new Node(t)};
  const window={apiUrl:p=>p,assetUrl:p=>p};
  const context={document,window,fetch:async()=>({ok:true,json:async()=>({intro:'Team culture intro',members})})};
  vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '../js/team.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(intro.textContent,'Team culture intro');assert.equal(mount.children.length,2);
  const portrait=mount.children[1].children[0];
  assert.equal(portrait.src,members[1].imageUrl);
  assert.equal(portrait.referrerPolicy,'no-referrer');
  portrait.replaceWith=node=>{mount.children[1].children[0]=node;};
  portrait.events.error();
  assert.equal(mount.children[1].children[0].className,'team-portrait-placeholder');
  const button=mount.children[1].children[1].children[2];
  assert.equal(button.textContent,locale==='pt'?'Ver mais':'View more');
  button.events.click();
  const dialog=body.children[0], content=dialog.children[0],header=content.children[0],details=content.children[1];
  assert.equal(dialog.open,true);assert.equal(header.children[0].textContent,'Bob <script>');assert.equal(details.children[2].textContent,'Bob professional summary.');
  header.children[1].events.click();assert.equal(dialog.open,false);assert.equal(button.focused,true);
  mount.children[0].children[1].children[2].events.click();assert.equal(details.children[2].textContent,members[0].summary);assert.equal(details.children[0].children.length,0);
 }
 console.log('Team DOM checks passed: bilingual cards, selected profile summary, plain text rendering, modal close and focus return.');
})();
