const {Browser,cellXY,waitFor,selectShip,URL}=require('./cdp.js'); const PEER='?peer=localhost:9789';
const srv=require('child_process').spawn(__dirname+'/peerserver/node_modules/.bin/peerjs',['--port','9789','--path','/'],{stdio:'ignore'}); process.on('exit',()=>{ try{ srv.kill('SIGKILL'); }catch(e){} });
const P=(x,y)=>({x,y});
async function st(b){ return b.eval(`(()=>{const S=Underway.UI.S; const r=S.role; const o=r==='host'?'guest':'host'; return {cur:S.game.current, phase:S.game.phase, turn:S.game.turn, busy:S.busy, pending:!!S.pendingFire, link:S.linkState, myShots:S.game.players[r].shots.length, theirShots:S.game.players[o].shots.length, mySightings:S.game.players[r].sightings.length, winner:S.game.winner};})()`); }
async function cellsOf(b,idx){ return b.eval(`(()=>{const S=Underway.UI.S; return Underway.Rules.shipCells(S.game.players[S.role].fleet[${idx}]);})()`); }
async function shipOf(b,idx){ return b.eval(`(()=>{const S=Underway.UI.S; return S.game.players[S.role].fleet[${idx}];})()`); }
async function pickWeapon(b,id){ const i=['shell','mg','torpedo','mine','radar','airstrike'].indexOf(id)+1; await b.click(`.weapons .wgroup:nth-child(${i}) button.wpn`); await b.wait(120); if(await b.eval(`document.getElementById('ov-weapon').classList.contains('active')`)){ if(await b.eval(`document.getElementById('wm-arm').disabled`)){ await b.click('#wm-cancel'); } else { await b.click('#wm-arm'); } await b.wait(100); } return b.eval(`Underway.UI.S.weapon`); }
async function tapEnemy(b,cell){ const xy=await cellXY(b,'enemy',cell); await b.clickCanvas('#enemyCanvas',xy.x,xy.y); await b.wait(60); }
async function settleBoth(att, def){ for(let i=0;i<120;i++){ const a=await st(att), d=await st(def); if(!a.busy&&!a.pending&&!d.busy&&a.turn===d.turn&&a.cur===d.cur) return [a,d]; await att.wait(200); if(i%3===2){ await att.eval(`Underway.Anim.skip()`); await def.eval(`Underway.Anim.skip()`); } } throw new Error('did not settle'); }
(async()=>{
  await new Promise(r=>setTimeout(r,1500)); console.log('booting');
  const H=new Browser({}), G=new Browser({}); await H.launch(); await G.launch(); console.log('browsers up');
  await H.goto(URL+PEER); await H.eval(`document.getElementById('home-name').value='Hosty'`); await H.click('#btn-create'); await H.wait(300); const code=await H.eval(`Underway.UI.S.room`);
  await G.goto(URL+'?room='+code+'&peer=localhost:9789'); await G.eval(`document.getElementById('home-name').value='Guesty'`); await G.click('#btn-join');
  console.log('room', code); await waitFor(G, `Underway.UI.S.linkState==='online'`, 30000); await waitFor(H, `Underway.UI.S.linkState==='online'`, 30000); console.log('online');
  await H.click('.navybtn:nth-child(3)'); await G.wait(300); await G.click('#btn-navy-random'); await H.wait(500); await H.click('#btn-lobby-start'); await waitFor(G, `Underway.UI.S.screen==='place'`, 8000);
  await H.click('.tpl[data-tpl="spread"]'); await H.click('#btn-ready'); await G.click('.tpl[data-tpl="cluster"]'); await G.click('#btn-ready');
  await waitFor(H, `Underway.UI.S.screen==='battle'`, 15000); await waitFor(G, `Underway.UI.S.screen==='battle'`, 15000);
  for(const b of [H,G]) await b.eval(`Underway.UI.S.settings.fast=true; Underway.Anim.settings.fast=true;`);
  const first=await H.eval(`Underway.UI.S.game.first`); const roles={host:H, guest:G}; let att=roles[first], def=roles[first==='host'?'guest':'host']; console.log('first:', first);
  const swap=()=>{ const t=att; att=def; def=t; };
  // 1) attacker: machine gun, two bullets on the defender's battleship
  const dbb=await cellsOf(def,1); await pickWeapon(att,'mg'); await selectShip(att,1); await tapEnemy(att,dbb[0]); await tapEnemy(att,dbb[1]); await tapEnemy(att,P(9,9)); await tapEnemy(att,P(0,9)); await att.click('#btn-fire');
  let [a,d]=await settleBoth(att,def); console.log('MG: att shots', a.myShots, 'def sees', d.theirShots, '| def sightings', d.mySightings, '| results:', await att.eval(`JSON.stringify(Underway.UI.S.game.players[Underway.UI.S.role].shots.map(x=>x.result))`), '| def battleship hits:', JSON.stringify((await shipOf(def,1)).hits), '| turn', a.turn, a.cur);
  await def.shot(__dirname+'/n_sighting_def.png'); swap();
  // 2) attacker (was defender) lays a mine ahead of the other side's destroyer
  const od=await cellsOf(def,2); const ods=await shipOf(def,2); const dd={N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]}[ods.heading]; const ahead=P(od[0].x+dd[0],od[0].y+dd[1]);
  await pickWeapon(att,'mine'); await tapEnemy(att,ahead); await att.click('#btn-fire'); [a,d]=await settleBoth(att,def);
  console.log('MINE: att mines', await att.eval(`Underway.UI.S.game.players[Underway.UI.S.role].mines.length`), '| def knows a mine exists:', await def.eval(`Underway.UI.S.game.players[Underway.UI.S.role==='host'?'guest':'host'].mines.length`), '| def log:', await def.eval(`[...document.querySelectorAll('#log div')].slice(-1)[0].textContent`), '| def toast mentions cell?', await def.eval(`[...document.querySelectorAll('#log div')].some(x=>/laid a mine at/.test(x.textContent))`), '(expect false) | turn', a.turn, a.cur);
  swap();
  // 3) attacker (destroyer owner) advances into the mine -> MINE_HIT flows to the mine owner
  await selectShip(att,2); await att.click('#btn-advance'); await att.wait(300); await waitFor(def, `Underway.UI.S.game.players[Underway.UI.S.role].shots.some(x=>x.weapon==='mine')`, 15000, 'mine hit received'); [a,d]=await settleBoth(att,def);
  console.log('MINE_HIT: owner shots:', await def.eval(`JSON.stringify(Underway.UI.S.game.players[Underway.UI.S.role].shots.filter(x=>x.weapon==='mine').map(x=>x.result+':'+x.cls))`), '| mover destroyer hits:', JSON.stringify((await shipOf(att,2)).hits), '| mover phase:', a.phase, '| mine spent on both:', await def.eval(`!Underway.UI.S.game.players[Underway.UI.S.role].mines[0].live`), await att.eval(`!Underway.UI.S.game.players[Underway.UI.S.role==='host'?'guest':'host'].mines[0].live`));
  // then radar from the undamaged carrier
  await pickWeapon(att,'radar'); await selectShip(att,0); const dc=await cellsOf(def,0); await tapEnemy(att,dc[1]); await att.click('#btn-fire'); await att.wait(1600); await att.shot(__dirname+'/n_radar_att.png'); [a,d]=await settleBoth(att,def);
  console.log('RADAR: att radarView contacts', await att.eval(`Underway.UI.S.oceans.enemy.radarView?Underway.UI.S.oceans.enemy.radarView.contacts.length:null`), '| def sightings', d.mySightings, '| def log:', await def.eval(`[...document.querySelectorAll('#log div')].slice(-1)[0].textContent`), '| turn', a.turn, a.cur);
  swap();
  // 4) refresh the current attacker mid-turn, then air strike
  const room=code; const isHost=(await att.eval(`Underway.UI.S.role`))==='host'; await att.goto(URL+'?room='+room); await att.wait(700); await att.click('#resume-yes'); await waitFor(att, `Underway.UI.S.linkState==='online' && Underway.UI.S.screen==='battle'`, 40000); await waitFor(def, `Underway.UI.S.linkState==='online'`, 40000); await att.eval(`Underway.UI.S.settings.fast=true; Underway.Anim.settings.fast=true;`);
  console.log('after refresh weapons state kept:', await att.eval(`JSON.stringify(Underway.UI.S.game.players[Underway.UI.S.role].weapons)`));
  const obb=await cellsOf(def,1); const obs=await shipOf(def,1); const horiz=(obs.heading==='E'||obs.heading==='W'); await pickWeapon(att,'airstrike'); if(horiz!==await att.eval(`Underway.UI.S.airDir`)) await att.click('#btn-airdir'); const anchor=obb.slice().sort((p,q)=>p.x-q.x||p.y-q.y)[0]; await tapEnemy(att,anchor); await att.click('#btn-fire'); [a,d]=await settleBoth(att,def);
  console.log('AIRSTRIKE: results', await att.eval(`JSON.stringify(Underway.UI.S.game.players[Underway.UI.S.role].shots.filter(x=>x.weapon==='airstrike').map(x=>x.result))`), '| def battleship hits:', JSON.stringify((await shipOf(def,1)).hits), '| def sightings', d.mySightings, '| turn', a.turn, a.cur, void isHost);
  swap();
  // 5) torpedo from the other side along the defender's destroyer row (from the west)
  const td=await cellsOf(def,2); await pickWeapon(att,'torpedo'); let mode=await att.eval(`document.getElementById('btn-torpdir').textContent`); while(!/→ row/.test(mode)){ await att.click('#btn-torpdir'); mode=await att.eval(`document.getElementById('btn-torpdir').textContent`); }
  await tapEnemy(att,P(0,td[0].y)); await att.click('#btn-fire'); [a,d]=await settleBoth(att,def);
  console.log('TORPEDO: att result', await att.eval(`JSON.stringify(Underway.UI.S.game.players[Underway.UI.S.role].shots.filter(x=>x.weapon==='torpedo').map(x=>x.result+':'+(x.cls||'')+'@'+x.cell.x+','+x.cell.y))`), '| def wake recorded', await def.eval(`Underway.UI.S.game.players[Underway.UI.S.role].torpedoes.length`), '| def sightings unchanged', d.mySightings, '| turn', a.turn, a.cur);
  await def.shot(__dirname+'/n_wake_def.png');
  swap();
  // 6) on-contact mine: lay the second mine straight onto the defender's patrol boat -> defender reports MINE_HIT immediately
  const who=await att.eval(`Underway.UI.S.role`); const minesLeft=await att.eval(`Underway.Rules.weapon(Underway.UI.S.game.players[Underway.UI.S.role],'mine').usesRemaining`);
  if(minesLeft>0){ const pp=await cellsOf(def,4); await pickWeapon(att,'mine'); await tapEnemy(att,pp[0]); await att.click('#btn-fire'); await waitFor(att, `Underway.UI.S.game.players[Underway.UI.S.role].shots.some(x=>x.weapon==='mine'&&x.cell.x===${pp[0].x}&&x.cell.y===${pp[0].y})`, 15000, 'contact mine reported'); [a,d]=await settleBoth(att,def);
    console.log('CONTACT MINE ('+who+'): att shot', await att.eval(`JSON.stringify(Underway.UI.S.game.players[Underway.UI.S.role].shots.filter(x=>x.weapon==='mine').slice(-1)[0].result)`), '| def patrol hits', JSON.stringify((await shipOf(def,4)).hits), '| mine spent both', await att.eval(`Underway.UI.S.game.players[Underway.UI.S.role].mines.every(m=>!m.live||m.cell.x!==${pp[0].x})`), await def.eval(`Underway.UI.S.game.players[Underway.UI.S.role==='host'?'guest':'host'].mines.slice(-1)[0].live===false`), '| turn', a.turn, a.cur); }
  else { swap(); const pp=await cellsOf(def,4); await pickWeapon(att,'mine'); await tapEnemy(att,pp[0]); await att.click('#btn-fire'); await waitFor(att, `Underway.UI.S.game.players[Underway.UI.S.role].shots.some(x=>x.weapon==='mine'&&x.cell.x===${pp[0].x}&&x.cell.y===${pp[0].y})`, 15000, 'contact mine reported'); [a,d]=await settleBoth(att,def); console.log('CONTACT MINE (other side): att shot', await att.eval(`JSON.stringify(Underway.UI.S.game.players[Underway.UI.S.role].shots.filter(x=>x.weapon==='mine').slice(-1)[0].result)`), '| def patrol hits', JSON.stringify((await shipOf(def,4)).hits), '| turn', a.turn, a.cur); }
  console.log('HOST ERRORS:', H.errors.length?H.errors:'none'); console.log('GUEST ERRORS:', G.errors.length?G.errors:'none'); console.log('warns:', H.logs.concat(G.logs).filter(l=>/warn/.test(l)).slice(0,6));
  H.close(); G.close(); try{ srv.kill('SIGKILL'); }catch(e){} setTimeout(()=>process.exit(0),300);
})().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
