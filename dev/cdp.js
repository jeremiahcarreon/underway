// Minimal CDP driver for headless Chrome (node 22 WebSocket). Audio is muted; browsers are killed on exit.
const { spawn, execSync } = require('child_process'); const http=require('http'); const fs=require('fs'); const path=require('path'); const os=require('os');
const live=new Set();
process.on('exit',()=>{ for(const b of live){ try{ b.close(); }catch(e){} } });
class Browser{
  constructor(opts){ opts=opts||{}; this.port=opts.port||9300+Math.floor(Math.random()*600); this.dir=path.join(os.tmpdir(),'underway-cdp-'+this.port); this.proc=null; this.id=1; this.pending=new Map(); this.errors=[]; this.logs=[]; this.win=opts.win||'1280,900'; this.mobile=!!opts.mobile; this.extraArgs=opts.extraArgs||[]; }
  async launch(){
    fs.mkdirSync(this.dir,{recursive:true});
    const args=[...this.extraArgs,'--headless=new','--mute-audio','--no-sandbox','--disable-gpu','--remote-debugging-port='+this.port,'--user-data-dir='+this.dir,'--window-size='+this.win,'--autoplay-policy=no-user-gesture-required','--allow-file-access-from-files','--disable-dev-shm-usage','about:blank'];
    this.proc=spawn('/usr/bin/google-chrome',args,{stdio:'ignore'}); live.add(this);
    for(let i=0;i<50;i++){ try{ const list=await this.json('/json/list'); const page=list.find(t=>t.type==='page'); if(page){ this.target=page; break; } }catch(e){} await new Promise(r=>setTimeout(r,200)); }
    if(!this.target) throw new Error('chrome did not start');
    this.ws=new WebSocket(this.target.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{ this.ws.onopen=res; this.ws.onerror=rej; });
    this.ws.onmessage=ev=>{ const m=JSON.parse(ev.data); if(m.id&&this.pending.has(m.id)){ const p=this.pending.get(m.id); this.pending.delete(m.id); m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result); } else if(m.method){ this.onEvent(m); } };
    await this.send('Runtime.enable'); await this.send('Log.enable'); await this.send('Page.enable');
    if(this.mobile){ this.phoneH=this.phoneH||Number((this.win||'').split(',')[1])||844; await this.send('Emulation.setDeviceMetricsOverride',{width:390,height:this.phoneH||844,deviceScaleFactor:2,mobile:true}); await this.send('Emulation.setTouchEmulationEnabled',{enabled:true}); }
  }
  json(p){ return new Promise((res,rej)=>{ http.get({host:'127.0.0.1',port:this.port,path:p},r=>{ let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{ res(JSON.parse(d)); }catch(e){ rej(e); } }); }).on('error',rej); }); }
  send(method,params){ const id=this.id++; return new Promise((res,rej)=>{ this.pending.set(id,{res,rej}); this.ws.send(JSON.stringify({id,method,params:params||{}})); }); }
  onEvent(m){
    if(m.method==='Runtime.consoleAPICalled'){ const txt=m.params.args.map(a=>a.value!==undefined?String(a.value):(a.description||a.type)).join(' '); this.logs.push(m.params.type+': '+txt); if(m.params.type==='error') this.errors.push('console.error: '+txt); }
    else if(m.method==='Runtime.exceptionThrown'){ const d=m.params.exceptionDetails; this.errors.push('exception: '+(d.exception&&d.exception.description||d.text)+' @'+d.lineNumber); }
    else if(m.method==='Log.entryAdded'){ const e=m.params.entry; this.logs.push('log.'+e.level+': '+e.text); if(e.level==='error') this.errors.push('log: '+e.text+' '+(e.url||'')); }
  }
  async goto(url){ await this.send('Page.navigate',{url}); await this.wait(800); }
  async eval(expr){ const r=await this.send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true}); if(r.exceptionDetails) throw new Error('eval: '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text)); return r.result.value; }
  wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
  async shot(file){ const r=await this.send('Page.captureScreenshot',{format:'png'}); fs.writeFileSync(file,Buffer.from(r.data,'base64')); return file; }
  async click(sel){ return this.eval(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return 'missing '+${JSON.stringify(sel)}; el.click(); return 'ok';})()`); }
  async clickCanvas(sel, x, y, type){ return this.eval(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return 'missing'; const r=el.getBoundingClientRect(); const o={bubbles:true,clientX:r.left+${x},clientY:r.top+${y},pointerId:1,pointerType:${JSON.stringify(type||'mouse')},isPrimary:true,button:0}; el.dispatchEvent(new PointerEvent('pointerdown',o)); el.dispatchEvent(new PointerEvent('pointerup',o)); return 'ok';})()`); }
  close(){ live.delete(this); try{ this.ws&&this.ws.close(); }catch(e){} try{ this.proc&&this.proc.kill('SIGKILL'); }catch(e){} try{ fs.rmSync(this.dir,{recursive:true,force:true}); }catch(e){} }
}
async function cellXY(b, ocean, cell){ return b.eval(`(()=>{const o=Underway.UI.S.oceans.${ocean}; const r=o.canvas.getBoundingClientRect(); const p=o.cellCenter(${JSON.stringify(cell)}); return {x:p.x*(r.width/o.w), y:p.y*(r.height/o.h)};})()`); }
async function waitFor(b, expr, ms, label){ const t0=Date.now(); while(Date.now()-t0<ms){ try{ if(await b.eval(expr)) return true; }catch(e){} await b.wait(150); } throw new Error('timeout waiting: '+(label||expr)); }
module.exports={Browser, cellXY, waitFor, URL:'file:///home/jeremiah/projects/Underway/index.html'};

/* ---- UI helpers for the action-tray controls (tap to select, tap again / tray button to confirm) ---- */
async function tapEnemy(b, cell, type){ const xy=await cellXY(b,'enemy',cell); await b.clickCanvas('#enemyCanvas',xy.x,xy.y,type||'mouse'); await b.wait(60); }
async function tapOwn(b, cell, type){ const xy=await cellXY(b,'own',cell); await b.clickCanvas('#ownCanvas',xy.x,xy.y,type||'mouse'); await b.wait(60); }
async function showTab(b, t){ if((await b.eval(`Underway.UI.S.tab`))!==t){ await b.click('#tab-'+t); await b.wait(100); } }
// Arm a weapon through the tray chip and the weapon sheet. shipIdx picks the firing/scanning ship for the machine gun and radar.
async function pickWeapon(b, id, shipIdx){
  await showTab(b,'enemy'); await b.click('#tray-weapon'); await b.wait(120);
  const st=await b.eval(`(()=>{ const row=document.querySelector('.wrow[data-weapon="${id}"] .wsheet-row'); if(!row) return 'missing'; if(row.disabled) return 'disabled'; row.click(); return 'ok'; })()`); await b.wait(100);
  if(st==='ok'&&await b.eval(`!!document.querySelector('.wrow[data-weapon="${id}"] .wsheet-opt')`)){ await b.eval(`(()=>{ const o=[...document.querySelectorAll('.wrow[data-weapon="${id}"] .wsheet-opt')]; const want=${shipIdx==null?-1:shipIdx}; const el=(want>=0&&o[want]&&!o[want].disabled)?o[want]:o.find(x=>!x.disabled); if(el) el.click(); })()`); await b.wait(100); }
  if(await b.eval(`document.getElementById('ov-weapons').classList.contains('active')`)) await b.click('#wsheet-close');
  return st==='ok' ? b.eval(`Underway.UI.S.weapon`) : st;
}
async function fire(b){ return b.click('#tray-fire'); }
// Select one of your own ships through its marker in the tray (robust against move handles overlapping other ships).
async function selectShip(b, i){ await showTab(b,'own'); await b.click('#tray-fleet .pip:nth-child('+(i+1)+')'); await b.wait(80); return i; }
async function legalMoves(b){ return b.eval(`(Underway.UI.S.oceans.own.handles||[]).map(h=>h.type)`); }
// Selected ship: tap the move handle on the map, then confirm ('tray' = Confirm button, 'tap' = tap the handle again). False when that move is not offered.
async function moveShip(b, type, how){ const cell=await b.eval(`(()=>{ const h=(Underway.UI.S.oceans.own.handles||[]).find(x=>x.type==='${type}'); return h?h.cell:null; })()`); if(!cell) return false; await tapOwn(b,cell); if(how==='tap') await tapOwn(b,cell); else await b.click('#tray-confirm'); return true; }
// Direction handles live on the enemy map: an arrow at each mouth of the torpedo's row and column, a TURN handle for the air-strike line.
async function setLane(b, k){ const h=await b.eval(`(()=>{ const h=(Underway.UI.S.oceans.enemy.handles||[]).find(x=>x.type==='lane'&&x.dir===${k}); return h?{cell:h.cell,on:!!h.on}:null; })()`); if(!h) return false; if(!h.on) await tapEnemy(b,h.cell); return true; }
async function setLine(b, horizontal){ const cur=await b.eval(`Underway.UI.S.airDir`); if(!!cur===!!horizontal) return true; const h=await b.eval(`(()=>{ const h=(Underway.UI.S.oceans.enemy.handles||[]).find(x=>x.turn); return h?h.cell:null; })()`); if(!h) return false; await tapEnemy(b,h); return true; }
Object.assign(module.exports,{tapEnemy,tapOwn,showTab,pickWeapon,fire,selectShip,legalMoves,moveShip,setLane,setLine});
