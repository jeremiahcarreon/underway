// Solo games while signed in: synced to the server, listed in My games, resumable from a fresh browser, replayable, counted in the vs-AI record. Also: the Fleet Admiral AI uses weapons.
const {Browser,cellXY,waitFor,tapEnemy,showTab,pickWeapon}=require('./cdp.js'); const {spawn}=require('child_process'); const fs=require('fs'); const os=require('os'); const path=require('path');
const PORT=8950+Math.floor(Math.random()*40); const DATA=fs.mkdtempSync(path.join(os.tmpdir(),'underway-solo-')); const URL='http://127.0.0.1:'+PORT+'/';
const srv=spawn(process.execPath,['--no-warnings=ExperimentalWarning',path.join(__dirname,'..','server','server.js')],{env:Object.assign({},process.env,{PORT:String(PORT),DATA_DIR:DATA}),stdio:['ignore','ignore','pipe']}); srv.stderr.on('data',d=>process.stderr.write('[server] '+d));
process.on('exit',()=>{ try{ srv.kill('SIGKILL'); }catch(e){} try{ fs.rmSync(DATA,{recursive:true,force:true}); }catch(e){} });
const P=(x,y)=>({x,y}); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function st(b){ return b.eval(`(()=>{const S=Underway.UI.S; return {cur:S.game.current, phase:S.game.phase, turn:S.game.turn, busy:S.busy, winner:S.game.winner, screen:S.screen, room:S.room};})()`); }
async function settle(b){ for(let i=0;i<140;i++){ const s=await st(b); if(!s.busy && (s.cur==='host'||s.winner)) return s; await b.wait(150); if(i%4===3) await b.eval(`Underway.Anim.skip()`); } throw new Error('never settled'); }
async function signIn(b,name,pin){ await b.goto(URL); await b.wait(500); await b.eval(`document.getElementById('adm-name').value=${JSON.stringify(name)}; document.getElementById('adm-pin').value=${JSON.stringify(pin)};`); await b.click('#btn-signin'); await waitFor(b, `!document.getElementById('online-panel').classList.contains('hidden')`, 8000, 'signed in'); }
(async()=>{
  for(let i=0;i<40;i++){ try{ await fetch(URL+'api/health'); break; }catch(e){ await sleep(150); } }
  let b=new Browser({}); await b.launch(); await signIn(b,'TheMan','1234');
  console.log('AI levels offered:', await b.eval(`[...document.querySelectorAll('.ailvl')].map(x=>x.dataset.level).join(',')`));
  await b.click('.ailvl[data-level="fleet"]'); await b.click('#btn-ai'); await b.wait(200); await b.click('.preset[data-preset="arsenal"]'); await b.click('.navybtn:nth-child(2)'); await b.click('#btn-lobby-start'); await b.wait(200); await b.click('.tpl[data-tpl="spread"]'); await b.click('#btn-ready'); await waitFor(b, `Underway.UI.S.screen==='battle'`, 9000); await b.eval(`Underway.UI.S.settings.fast=true; Underway.Anim.settings.fast=true;`);
  let s=await settle(b); const code=s.room; console.log('solo game', code);
  const weaponsSeen=new Set();
  for(let t=0;t<28;t++){ if(s.winner) break; const before=await b.eval(`Underway.UI.S.game.log.length`); await showTab(b,'enemy'); await tapEnemy(b,P(t%10,Math.floor(t/10)+2)); if(await b.eval(`!document.getElementById('tray-fire')||document.getElementById('tray-fire').disabled`)) continue; await b.click('#tray-fire'); s=await settle(b);
    const ws=await b.eval(`Underway.UI.S.game.log.slice(${before}).filter(e=>e.player==='guest'&&(e.kind==='shot'||e.kind==='mine'||e.kind==='radar')).map(e=>e.kind==='shot'?(e.weapon||'shell'):e.kind)`); ws.forEach(w=>weaponsSeen.add(w)); }
  console.log('AI weapons seen in 28 turns:', [...weaponsSeen].join(', '), '| turn', s.turn);
  await sleep(1600); const me1=await (await fetch(URL+'api/me?token='+encodeURIComponent(await b.eval(`Underway.UI.S.admiral.token`)))).json(); const sg=me1.games.find(g=>g.code===code); console.log('server knows the solo game:', sg?sg.kind+' '+sg.status+' turn '+sg.turns:'MISSING');
  // close the browser entirely; new browser, sign in, My games -> Resume
  const before=await st(b); b.close(); await sleep(300); b=new Browser({}); await b.launch(); await signIn(b,'TheMan','1234'); await b.click('#btn-mygames'); await waitFor(b, `document.querySelectorAll('#mygames .playerbox').length>0`, 8000, 'my games list');
  console.log('My games rows:', await b.eval(`[...document.querySelectorAll('#mygames .playerbox')].map(r=>r.textContent.replace(/\\s+/g,' ').trim()).join(' || ')`));
  console.log('filter buttons:', await b.eval(`[...document.querySelectorAll('#mygames .row button')].map(x=>x.textContent).join(' ')`));
  await b.eval(`[...document.querySelectorAll('#mygames .playerbox button')][0].click()`); await waitFor(b, `Underway.UI.S.screen==='battle'`, 10000, 'resumed solo from server'); await b.eval(`Underway.UI.S.settings.fast=true; Underway.Anim.settings.fast=true;`); await b.wait(300);
  const after=await st(b); console.log('RESUME from fresh browser:', JSON.stringify({before:{turn:before.turn,cur:before.cur},after:{turn:after.turn,cur:after.cur,room:after.room}}));
  // finish by surrender
  await b.click('#btn-surrender'); await b.wait(150); await b.click('#confirm-yes'); await b.wait(1200); await b.eval(`Underway.Cine.skip()`); await waitFor(b, `Underway.UI.S.screen==='over'`, 8000); await sleep(600);
  console.log('over status:', await b.eval(`document.getElementById('over-status').textContent`));
  await b.click('#btn-over-home'); await b.wait(150); await b.click('#confirm-yes'); await b.wait(500); await b.click('#btn-mygames'); await waitFor(b, `document.querySelectorAll('#mygames .playerbox').length>0`, 8000);
  console.log('My games after finish:', await b.eval(`[...document.querySelectorAll('#mygames .playerbox')].map(r=>r.textContent.replace(/\\s+/g,' ').trim()).join(' || ')`));
  await b.eval(`[...document.querySelectorAll('#mygames .playerbox button')][0].click()`); await waitFor(b, `Underway.UI.S.screen==='over'`, 8000, 'replay screen'); console.log('replay via My games:', await b.eval(`document.getElementById('over-title').textContent+' | replay enabled='+!document.getElementById('btn-replay').disabled`)); await b.click('#btn-replay'); await b.wait(400); console.log('replay events:', await b.eval(`Underway.Replay.events.length`));
  await b.goto(URL); await b.wait(400); await b.eval(`Underway.UI.showLeaderboard()`); await waitFor(b, `Underway.UI.S.screen==='board'`, 6000);
  console.log('board note:', (await b.eval(`document.getElementById('board-sub').textContent`)).slice(0,90)); console.log('vs AI rows:', await b.eval(`[...document.querySelectorAll('#board-ai tbody tr')].map(tr=>tr.textContent.replace(/\\s+/g,' ').trim()).join(' || ')`)); console.log('pvp rows:', await b.eval(`document.querySelectorAll('#board-admirals tbody tr').length+' : '+document.querySelector('#board-admirals tbody').textContent.trim().slice(0,60)`));
  await b.shot(__dirname+'/e2e_solo_board.png');
  console.log('ERRORS:', b.errors.length?b.errors:'none'); b.close(); setTimeout(()=>process.exit(0),300);
})().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
