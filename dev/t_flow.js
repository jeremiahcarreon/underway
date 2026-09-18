// Guided turn flow on phone and desktop: prompts, drag-to-move with confirmation, weapon strip, fire confirmation, replay last action, drawer.
const {Browser,cellXY,waitFor,selectShip,URL}=require('./cdp.js'); const P=(x,y)=>({x,y});
async function st(b){ return b.eval(`(()=>{const S=Underway.UI.S; return {cur:S.game.current, phase:S.game.phase, turn:S.game.turn, busy:S.busy, winner:S.game.winner, tab:S.tab, pending:!!S.pendingMove};})()`); }
async function settle(b){ for(let i=0;i<140;i++){ const s=await st(b); if(!s.busy && (s.cur==='host'||s.winner)) return s; await b.wait(150); if(i%4===3) await b.eval(`Underway.Anim.skip()`); } throw new Error('never settled'); }
async function prompt(b,which){ return b.eval(`(()=>{const el=document.getElementById('${which}-prompt'); return el.classList.contains('show')?{text:el.querySelector('.ptext').textContent, buttons:[...el.querySelectorAll('button')].map(x=>x.textContent)}:null;})()`); }
async function clickPrompt(b,which,label){ return b.eval(`(()=>{const el=document.getElementById('${which}-prompt'); const btn=[...el.querySelectorAll('button')].find(x=>x.textContent.startsWith(${JSON.stringify(label)})); if(!btn) return 'missing'; btn.click(); return 'ok';})()`); }
async function dragShip(b, idx, dirCells, perp){ // drag from the ship's mid cell by dirCells cells along its heading (or perpendicular if perp)
  return b.eval(`(()=>{ const S=Underway.UI.S; const o=S.oceans.own; const sh=S.game.players[S.viewAs].fleet[${idx}]; const cells=Underway.Rules.shipCells(sh); const from=cells[Math.floor(cells.length/2)]; const d={N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]}[sh.heading]; const dir=${perp?'[-d[1],d[0]]':'d'};
    const r=o.canvas.getBoundingClientRect(); const k=r.width/o.w; const p0=o.cellCenter(from); const x0=r.left+p0.x*k, y0=r.top+p0.y*k; const x1=x0+dir[0]*o.cell*k*${dirCells}, y1=y0+dir[1]*o.cell*k*${dirCells};
    const ev=(t,x,y)=>o.canvas.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:x,clientY:y,pointerId:7,pointerType:'touch',isPrimary:true,button:0})); ev('pointerdown',x0,y0); ev('pointermove',x0+(x1-x0)*0.5,y0+(y1-y0)*0.5); ev('pointermove',x1,y1); ev('pointerup',x1,y1); return {heading:sh.heading, from, ghost:!!o.ghost}; })()`);
}
async function run(mobile){
  const tag=mobile?'[phone] ':'[desktop] '; const b=new Browser({mobile, win:mobile?'390,844':'1280,900'}); await b.launch(); await b.goto(URL); await b.eval(`document.getElementById('home-name').value='T'`); await b.click('.ailvl[data-level="hunter"]'); await b.click('#btn-ai'); await b.wait(200);
  await b.click('.navybtn:nth-child(1)'); await b.click('#btn-lobby-start'); await b.wait(200); await b.click('.tpl[data-tpl="spread"]'); await b.click('#btn-ready'); await waitFor(b, `Underway.UI.S.screen==='battle'`, 9000); await b.eval(`Underway.UI.S.settings.fast=true; Underway.Anim.settings.fast=true;`);
  let s=await settle(b); await b.wait(300);
  console.log(tag+'turn start: tab', s.tab, '| own prompt:', JSON.stringify(await prompt(b,'own')), '| hscroll ok:', await b.eval(`document.documentElement.scrollWidth<=window.innerWidth`));
  if(mobile){ const fit=await b.eval(`(()=>{const r=document.getElementById('ownCanvas').getBoundingClientRect(); return {top:Math.round(r.top), bottom:Math.round(r.bottom), vh:window.innerHeight, drawerHidden:document.getElementById('ownDock').offsetParent===null};})()`); console.log(tag+'own ocean fits without scrolling:', JSON.stringify(fit)); await b.shot(__dirname+'/f_prompt_ask.png'); }
  await clickPrompt(b,'own','Yes'); await b.wait(100); console.log(tag+'drag hint:', (await prompt(b,'own')).text.slice(0,40));
  // drag the destroyer (idx 2) one cell along its heading -> confirm prompt
  let dr=await dragShip(b,2,1.2,false); await b.wait(150); let pr=await prompt(b,'own'); console.log(tag+'after drag:', JSON.stringify(dr), '| prompt:', pr&&pr.text, pr&&pr.buttons);
  await clickPrompt(b,'own','Go back'); await b.wait(100); console.log(tag+'go back -> pending', (await st(b)).pending, 'ghost', await b.eval(`!!Underway.UI.S.oceans.own.ghost`));
  // sideways drag -> rotation prompt mentions ends turn (may be illegal -> no prompt); then go back
  dr=await dragShip(b,2,1.2,true); await b.wait(150); pr=await prompt(b,'own'); console.log(tag+'sideways drag prompt:', pr&&pr.text.slice(0,80)); if(pr&&pr.buttons.some(x=>x.startsWith('Go back'))) await clickPrompt(b,'own','Go back');
  // advance again and confirm
  dr=await dragShip(b,2,1.2,false); await b.wait(150); pr=await prompt(b,'own'); if(!pr){ console.log(tag+'no confirm prompt (illegal advance) — using reverse'); dr=await dragShip(b,2,-1.2,false); await b.wait(150); pr=await prompt(b,'own'); }
  const bowBefore=await b.eval(`JSON.stringify(Underway.UI.S.game.players.host.fleet[2].bow)`); await clickPrompt(b,'own','Confirm'); await b.wait(300); await b.eval(`Underway.Anim.skip()`); await waitFor(b, `!Underway.UI.S.busy && Underway.UI.S.game.phase==='fire'`, 6000, 'moved to fire phase');
  s=await st(b); console.log(tag+'after confirm: bow', bowBefore, '->', await b.eval(`JSON.stringify(Underway.UI.S.game.players.host.fleet[2].bow)`), '| tab', s.tab, '| enemy prompt:', (await prompt(b,'enemy')||{}).text);
  if(mobile){ const fit=await b.eval(`(()=>{const c=document.getElementById('enemyCanvas').getBoundingClientRect(); const w=document.getElementById('weapons').getBoundingClientRect(); return {stripTop:Math.round(w.top), stripVisible:w.top>=0&&w.bottom<=window.innerHeight, canvasBottom:Math.round(c.bottom), vh:window.innerHeight, scrollY:window.scrollY};})()`); console.log(tag+'enemy view fits:', JSON.stringify(fit)); await b.shot(__dirname+'/f_enemy_strip.png'); }
  // tap a target -> fire confirmation; cancel; tap again; fire
  const xy=await cellXY(b,'enemy',P(4,4)); await b.clickCanvas('#enemyCanvas',xy.x,xy.y,'touch'); await b.wait(100); pr=await prompt(b,'enemy'); console.log(tag+'fire prompt:', pr&&pr.text, pr&&pr.buttons); if(mobile) await b.shot(__dirname+'/f_confirm_fire.png');
  await clickPrompt(b,'enemy','Cancel'); await b.wait(80); console.log(tag+'cancel -> target', await b.eval(`JSON.stringify(Underway.UI.S.target)`));
  await b.clickCanvas('#enemyCanvas',xy.x,xy.y,'touch'); await b.wait(80); await clickPrompt(b,'enemy','Fire'); await b.wait(200); const during=await st(b); console.log(tag+'firing: busy', during.busy, 'tab', during.tab);
  s=await settle(b); await b.wait(400); s=await st(b); console.log(tag+'next turn: tab', s.tab, 'prompt:', (await prompt(b,'own')||{}).text, '| replay btn enabled:', await b.eval(`!document.getElementById('btn-replay-last').disabled`), '| shots', await b.eval(`Underway.UI.S.game.players.host.shots.length`));
  // replay last action
  await b.click('#btn-replay-last'); await b.wait(150); console.log(tag+'replay running: busy', (await st(b)).busy, 'tab', (await st(b)).tab); await b.eval(`Underway.Anim.skip()`); await waitFor(b, `!Underway.UI.S.busy`, 6000);
  // No, go fire -> enemy tab, phase fire
  await clickPrompt(b,'own','No'); await b.wait(150); s=await st(b); console.log(tag+'declined maneuver: phase', s.phase, 'tab', s.tab, '| enemy prompt:', (await prompt(b,'enemy')||{}).text);
  // drawer on phone
  if(mobile){ await b.click('#btn-drawer'); await b.wait(150); console.log(tag+'drawer open shows dock:', await b.eval(`document.getElementById('enemyDock').offsetParent!==null`), '| log visible:', await b.eval(`document.getElementById('log').offsetParent!==null`)); await b.click('#btn-drawer'); }
  // weapon strip: MG via modal then 4 taps -> prompt
  await b.click('.weapons .wgroup:nth-child(2) button.wpn'); await b.wait(120); await b.click('#wm-arm'); await b.wait(100); for(const c of [P(1,1),P(2,1),P(3,1),P(4,1)]){ const q=await cellXY(b,'enemy',c); await b.clickCanvas('#enemyCanvas',q.x,q.y,'touch'); await b.wait(50); } pr=await prompt(b,'enemy'); console.log(tag+'MG prompt:', pr&&pr.text);
  await clickPrompt(b,'enemy','Fire'); s=await settle(b); console.log(tag+'MG fired, shots', await b.eval(`Underway.UI.S.game.players.host.shots.length`));
  console.log(tag+'ERRORS:', b.errors.length?b.errors:'none'); b.close();
}
(async()=>{ await run(true); await run(false); })().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
