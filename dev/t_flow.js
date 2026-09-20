// Action-tray flow on phone and desktop: move handles (tap, tap again / Confirm), tap-tap attack, weapon sheet, result card + replay, menu/drawer,
// and the one-time coach tips for an Admiral that already existed before this control scheme.
const {Browser,waitFor,tapEnemy,tapOwn,showTab,pickWeapon,selectShip,legalMoves,moveShip,setLane,setLine}=require('./cdp.js');
const {spawn}=require('child_process'); const fs=require('fs'); const os=require('os'); const path=require('path');
const PORT=8950+Math.floor(Math.random()*40); const DATA=fs.mkdtempSync(path.join(os.tmpdir(),'underway-flow-')); const URL='http://127.0.0.1:'+PORT+'/';
const srv=spawn(process.execPath,['--no-warnings=ExperimentalWarning',path.join(__dirname,'..','server','server.js')],{env:Object.assign({},process.env,{PORT:String(PORT),DATA_DIR:DATA}),stdio:['ignore','ignore','pipe']}); srv.stderr.on('data',d=>process.stderr.write('[server] '+d));
process.on('exit',()=>{ try{ srv.kill('SIGKILL'); }catch(e){} try{ fs.rmSync(DATA,{recursive:true,force:true}); }catch(e){} });
const P=(x,y)=>({x,y}); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function st(b){ return b.eval(`(()=>{const S=Underway.UI.S; return {cur:S.game.current, phase:S.game.phase, turn:S.game.turn, busy:S.busy, winner:S.game.winner, tab:S.tab, pending:!!S.pendingMove, sel:S.moveSel, shots:S.game.players.host.shots.length};})()`); }
async function settle(b){ for(let i=0;i<140;i++){ const s=await st(b); if(!s.busy && (s.cur==='host'||s.winner)) return s; await b.wait(150); if(i%4===3) await b.eval(`Underway.Anim.skip()`); } throw new Error('never settled'); }
const tray=b=>b.eval(`({big:document.getElementById('tray-big').textContent, sub:document.getElementById('tray-sub').textContent, btns:[...document.querySelectorAll('#tray-btns button')].map(x=>x.textContent+(x.disabled?'(off)':'')), result:document.getElementById('tray-result').classList.contains('hidden')?null:document.getElementById('result-text').textContent, coach:document.getElementById('tray-coach').classList.contains('hidden')?null:document.getElementById('coach-text').textContent.slice(0,46), status:document.querySelector('.statusline .turn-status').textContent, steps:[document.getElementById('tab-own').textContent,document.getElementById('tab-enemy').textContent]})`);
async function signIn(b,name,pin){ await b.goto(URL); await b.wait(400); await b.eval(`document.getElementById('adm-name').value=${JSON.stringify(name)}; document.getElementById('adm-pin').value=${JSON.stringify(pin)};`); await b.click('#btn-signin'); await waitFor(b, `!document.getElementById('online-panel').classList.contains('hidden')`, 8000, 'signed in'); }
async function startAI(b){ await b.click('.ailvl[data-level="hunter"]'); await b.click('#btn-ai'); await b.wait(200); await b.click('.navybtn:nth-child(1)'); await b.click('#btn-lobby-start'); await b.wait(200); await b.click('.tpl[data-tpl="spread"]'); await b.click('#btn-ready'); await waitFor(b, `Underway.UI.S.screen==='battle'`, 9000); await b.eval(`Underway.UI.S.settings.fast=true; Underway.Anim.settings.fast=true;`); const s=await settle(b); await b.wait(400); return s; }
async function run(mobile){
  const tag=mobile?'[phone] ':'[desktop] '; const b=new Browser({mobile, win:mobile?'390,844':'1280,900'}); await b.launch();
  await signIn(b,'OldSalt','1234'); // an Admiral that exists on the server with coach version 0, like every account created before this change
  let s=await startAI(b); let t=await tray(b);
  console.log(tag+'start:', JSON.stringify({tab:s.tab, status:t.status, steps:t.steps, big:t.big, btns:t.btns, coach:t.coach}));
  if(mobile){ const fit=await b.eval(`(()=>{const c=document.getElementById('ownCanvas').getBoundingClientRect(), t=document.getElementById('tray').getBoundingClientRect(); return {mapBottom:Math.round(c.bottom), trayTop:Math.round(t.top), vh:window.innerHeight, overlap:c.bottom>t.top, hscroll:document.documentElement.scrollWidth>window.innerWidth, scrollY:window.scrollY, topbarHidden:document.querySelector('.topbar').offsetParent===null};})()`); console.log(tag+'layout:', JSON.stringify(fit)); await b.shot(__dirname+'/f1_move_start.png'); }
  // select the destroyer (tap the ship itself), see handles
  const mid=await b.eval(`Underway.Rules.shipCells(Underway.UI.S.game.players.host.fleet[2])[1]`); await tapOwn(b,mid,mobile?'touch':'mouse'); t=await tray(b); const moves=await legalMoves(b);
  console.log(tag+'ship tapped:', t.big, '|', t.sub.slice(0,40), '| handles:', moves.join(','), '| coach now:', t.coach);
  await b.shot(__dirname+(mobile?'/f2_handles.png':'/f2_handles_desktop.png'));
  // tap a rotation handle (preview), cancel; tap advance handle, tap it again to confirm
  if(moves.includes('rotcw')){ const hc=await b.eval(`Underway.UI.S.oceans.own.handles.find(h=>h.type==='rotcw').cell`); await tapOwn(b,hc,mobile?'touch':'mouse'); t=await tray(b); console.log(tag+'rotate preview:', t.big, '|', t.sub, '|', t.btns.join(' ')); if(mobile) await b.shot(__dirname+'/f3_rotate_preview.png'); await b.click('#tray-cancel'); await b.click('#coach-ok').catch(()=>{}); }
  const type=moves.includes('advance')?'advance':'reverse'; const bow0=await b.eval(`JSON.stringify(Underway.UI.S.game.players.host.fleet[2].bow)`); const okMove=await moveShip(b,type,'tap'); await b.wait(250); await b.eval(`Underway.Anim.skip()`); await waitFor(b, `!Underway.UI.S.busy && Underway.UI.S.game.phase==='fire'`, 6000, 'moved');
  s=await st(b); t=await tray(b); console.log(tag+'moved by tap-tap:', okMove, type, bow0, '->', await b.eval(`JSON.stringify(Underway.UI.S.game.players.host.fleet[2].bow)`), '| tab', s.tab, '| steps', t.steps.join(' / '), '| tray:', t.big, '|', t.sub, '| coach:', t.coach);
  if(mobile){ const fit=await b.eval(`(()=>{const c=document.getElementById('enemyCanvas').getBoundingClientRect(), t=document.getElementById('tray').getBoundingClientRect(); return {mapBottom:Math.round(c.bottom), trayTop:Math.round(t.top), overlap:c.bottom>t.top, scrollY:window.scrollY};})()`); console.log(tag+'attack layout:', JSON.stringify(fit)); await b.shot(__dirname+'/f4_attack.png'); }
  // attack: tap, then tap again to fire; accidental double tap within 350 ms is ignored
  await tapEnemy(b,P(4,4),mobile?'touch':'mouse'); t=await tray(b); console.log(tag+'aimed:', t.big, '|', t.sub, '|', t.btns.join(' ')); if(mobile) await b.shot(__dirname+'/f5_aimed.png');
  await tapEnemy(b,P(6,6),mobile?'touch':'mouse'); console.log(tag+'re-aimed:', (await tray(b)).big, '| shots', (await st(b)).shots);
  await b.wait(450); await tapEnemy(b,P(6,6),mobile?'touch':'mouse'); await b.wait(250); console.log(tag+'second tap fired: busy', (await st(b)).busy); s=await settle(b); await b.wait(500); t=await tray(b);
  console.log(tag+'after exchange: shots', s.shots, '| tab', s.tab, '| result card:', t.result, '| replay visible:', await b.eval(`!document.getElementById('btn-replay-last').classList.contains('hidden')`), '| tray:', t.big);
  if(mobile) await b.shot(__dirname+'/f6_result.png');
  await b.click('#btn-replay-last'); await b.wait(150); console.log(tag+'replay: busy', (await st(b)).busy); await b.eval(`Underway.Anim.skip()`); await waitFor(b, `!Underway.UI.S.busy`, 6000); await b.click('#result-ok'); console.log(tag+'result dismissed:', (await tray(b)).result);
  // skip move via step control, weapon sheet, torpedo with direction chips, FIRE button
  await b.click('#tray-skip'); await b.wait(120); console.log(tag+'skip -> tab', (await st(b)).tab, 'phase', (await st(b)).phase);
  await b.click('#tray-weapon'); await b.wait(150); console.log(tag+'weapon sheet:', await b.eval(`[...document.querySelectorAll('#wsheet .wsheet-row')].map(r=>r.textContent.replace(/\\s+/g,' ').trim().slice(0,34)+(r.disabled?' [off]':'')).join(' | ')`)); if(mobile) await b.shot(__dirname+'/f7_weapon_sheet.png'); await b.click('#wsheet-close');
  console.log(tag+'pick torpedo:', await pickWeapon(b,'torpedo')); await tapEnemy(b,P(3,5),mobile?'touch':'mouse'); await setLane(b,3); t=await tray(b); console.log(tag+'torpedo aimed:', t.big, '|', t.btns.join(' ')); if(mobile) await b.shot(__dirname+'/f8_torpedo.png');
  await b.click('#tray-fire'); s=await settle(b); await b.wait(400); console.log(tag+'torpedo fired: lane', await b.eval(`JSON.stringify(Underway.UI.S.game.players.host.shots.filter(x=>x.weapon==='torpedo').map(x=>x.lane))`));
  // radar through the sheet with a ship choice (patrol boat = 2×2)
  await b.click('#tray-skip'); console.log(tag+'pick radar from patrol boat:', await pickWeapon(b,'radar',4), '| tray:', (await tray(b)).big, '|', (await tray(b)).sub.slice(0,40));
  await tapEnemy(b,P(1,1),mobile?'touch':'mouse'); await b.wait(450); await tapEnemy(b,P(1,1),mobile?'touch':'mouse'); s=await settle(b); await b.wait(300); console.log(tag+'radar by tap-tap: sweeps', await b.eval(`Underway.UI.S.game.log.filter(e=>e.kind==='radar').map(e=>e.area.size+'x'+e.area.size).join(',')`));
  if(mobile){ await b.click('#btn-menu'); await b.wait(150); await b.shot(__dirname+'/f9_menu.png'); await b.click('#m-drawer'); await b.wait(300); console.log(tag+'drawer shows log:', await b.eval(`document.getElementById('log').offsetParent!==null`)); await b.click('#btn-menu'); await b.wait(100); await b.click('#m-drawer'); }
  // coach: finish remaining tips, confirm the server recorded it, new game shows none; "show tips again" restores them
  // finish whatever tips are left: the rotation tip needs a selected ship that can rotate
  if(await b.eval(`Underway.UI.S.coach.needed && !Underway.UI.S.coach.seen.rotate`)){ await showTab(b,'own'); for(let i=0;i<5;i++){ await selectShip(b,i); if((await legalMoves(b)).some(m=>m.startsWith('rot'))) break; } console.log(tag+'rotation tip:', (await tray(b)).coach); }
  for(let i=0;i<4;i++){ if(await b.eval(`!document.getElementById('tray-coach').classList.contains('hidden')`)) await b.click('#coach-ok'); await b.click(i%2?'#tab-own':'#tab-enemy'); await b.wait(120); }
  console.log(tag+'coach finished:', await b.eval(`JSON.stringify(Underway.UI.S.coach)`));
  await sleep(500); const me=await (await fetch(URL+'api/me?token='+encodeURIComponent(await b.eval(`Underway.UI.S.admiral.token`)))).json(); console.log(tag+'server coach version:', me.coach);
  console.log(tag+'ERRORS:', b.errors.length?b.errors:'none'); return b;
}
(async()=>{
  for(let i=0;i<40;i++){ try{ await fetch(URL+'api/health'); break; }catch(e){ await sleep(150); } }
  // OldSalt exists before the UI change: create through the API only, coach stays 0
  await fetch(URL+'api/admiral',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'OldSalt',pin:'1234'})});
  const phone=await run(true); phone.close();
  const desk=await run(false);
  // same Admiral, new game on another device (desktop ran after the phone finished the tips): no tips
  await desk.goto(URL); await desk.wait(400); await startAI(desk); console.log('[desktop] second game coach:', (await tray(desk)).coach, '(expect null)');
  await desk.eval(`Underway.UI.S.coach.needed`); desk.close(); setTimeout(()=>process.exit(0),300);
})().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
