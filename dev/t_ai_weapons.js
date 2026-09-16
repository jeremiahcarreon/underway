const {Browser,cellXY,waitFor,selectShip,URL}=require('./cdp.js'); const P=(x,y)=>({x,y});
async function st(b){ return b.eval(`(()=>{const S=Underway.UI.S; return {cur:S.game.current, phase:S.game.phase, turn:S.game.turn, busy:S.busy, winner:S.game.winner, screen:S.screen};})()`); }
async function settle(b){ for(let i=0;i<120;i++){ const s=await st(b); if(!s.busy && (s.cur==='host'||s.winner)) return s; await b.wait(150); if(i%4===3) await b.eval(`Underway.Anim.skip()`); } throw new Error('never settled'); }
async function pickWeapon(b,id){ const i=['shell','mg','torpedo','mine','radar','airstrike'].indexOf(id)+1; await b.click(`.weapons .wgroup:nth-child(${i}) button.wpn`); await b.wait(120); if(await b.eval(`document.getElementById('ov-weapon').classList.contains('active')`)){ if(await b.eval(`document.getElementById('wm-arm').disabled`)){ await b.click('#wm-cancel'); } else { await b.click('#wm-arm'); } await b.wait(100); } return b.eval(`Underway.UI.S.weapon`); }
async function tapEnemy(b,cell){ const xy=await cellXY(b,'enemy',cell); await b.clickCanvas('#enemyCanvas',xy.x,xy.y); await b.wait(60); }
async function aiCells(b,idx){ return b.eval(`Underway.Rules.shipCells(Underway.UI.S.game.players.guest.fleet[${idx}])`); }
async function run(mobile){
  const b=new Browser({mobile, win:mobile?'390,844':'1280,900'}); await b.launch(); await b.goto(URL); await b.eval(`document.getElementById('home-name').value='Tester'`); await b.click('.ailvl[data-level="admiral"]'); await b.click('#btn-ai'); await b.wait(200);
  await b.click('.navybtn:nth-child(4)'); await b.click('#btn-lobby-start'); await b.wait(200); await b.click('#btn-random-fleet'); await b.click('#btn-ready'); await waitFor(b, `Underway.UI.S.screen==='battle'`, 9000); await b.eval(`Underway.UI.S.settings.fast=true; Underway.Anim.settings.fast=true;`);
  let s=await settle(b);
  if(mobile){ await b.click('#tab-enemy'); await b.wait(200); await b.eval(`document.getElementById('actions').scrollIntoView()`); await b.wait(200); await b.shot(__dirname+'/w_actions_mobile.png'); console.log('mobile hscroll ok:', await b.eval(`document.documentElement.scrollWidth<=window.innerWidth`)); }
  else { await b.eval(`document.getElementById('actions').scrollIntoView()`); await b.wait(200); await b.shot(__dirname+'/w_actions_desktop.png'); }
  // MG on the AI carrier
  const c=await aiCells(b,0); await pickWeapon(b,'mg'); await selectShip(b,1); for(const cell of [c[0],c[1],P(9,9),P(0,9)]) await tapEnemy(b,cell); await b.click('#btn-fire'); s=await settle(b);
  console.log((mobile?'[mobile] ':'')+'MG results:', await b.eval(`JSON.stringify(Underway.UI.S.game.players.host.shots.map(x=>x.result))`), 'turn', s.turn);
  // mine ahead of the AI destroyer (Admiral moves damaged ships; also damage it first with a shell so it moves)
  const dcells=await aiCells(b,2); await pickWeapon(b,'shell'); await tapEnemy(b,dcells[1]); await b.click('#btn-fire'); s=await settle(b);
  const ds=await b.eval(`Underway.UI.S.game.players.guest.fleet[2]`); const dd={N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]}[ds.heading]; const nowCells=await aiCells(b,2); const ahead=P(nowCells[0].x+dd[0],nowCells[0].y+dd[1]); const behind=P(nowCells[2].x-dd[0],nowCells[2].y-dd[1]);
  await pickWeapon(b,'mine'); await tapEnemy(b,ahead); await b.click('#btn-fire'); s=await settle(b);
  await pickWeapon(b,'mine'); await tapEnemy(b,behind); await b.click('#btn-fire'); s=await settle(b);
  console.log('mines laid:', await b.eval(`Underway.UI.S.game.players.host.mines.length`), 'mine button:', await b.eval(`document.querySelector('.weapons .wgroup:nth-child(3) button.wpn').textContent+' disabled='+document.querySelector('.weapons .wgroup:nth-child(3) button.wpn').disabled`));
  // radar with an undamaged ship
  const und=await b.eval(`Underway.UI.S.game.players.host.fleet.findIndex(s=>!s.sunk&&Underway.Rules.hitCount(s)===0)`); if(und>=0){ await pickWeapon(b,'radar'); await selectShip(b,und); await tapEnemy(b,P(4,4)); await b.click('#btn-fire'); s=await settle(b); console.log('radar done, contacts:', await b.eval(`Underway.UI.S.game.log.filter(e=>e.kind==='radar').map(e=>e.count).join(',')`)); }
  // air strike if carrier undamaged
  const carOk=await b.eval(`(()=>{const c=Underway.UI.S.game.players.host.fleet[0]; return !c.sunk&&Underway.Rules.hitCount(c)===0;})()`); if(carOk){ const bb=await aiCells(b,1); await pickWeapon(b,'airstrike'); const bs=await b.eval(`Underway.UI.S.game.players.guest.fleet[1]`); const horiz=bs.heading==='E'||bs.heading==='W'; if(horiz!==await b.eval(`Underway.UI.S.airDir`)) await b.click('#btn-airdir'); const anchor=bb.slice().sort((p,q)=>p.x-q.x||p.y-q.y)[0]; await tapEnemy(b,anchor); await b.click('#btn-fire'); s=await settle(b); console.log('airstrike:', await b.eval(`JSON.stringify(Underway.UI.S.game.players.host.shots.filter(x=>x.weapon==='airstrike').map(x=>x.result))`)); } else console.log('carrier damaged, strike skipped');
  // 30 shell turns with the admiral helper; watch for mine hits by the AI
  for(let t=0;t<30;t++){ if(s.winner) break; const cell=await b.eval(`(()=>{const S=Underway.UI.S; return Underway.AI.admiralShot(S.game.players.host.shots, Underway.AI.initMemory('admiral'), Underway.RNG(${t+5}));})()`); await pickWeapon(b,'shell'); await tapEnemy(b,cell); if(await b.eval(`document.getElementById('btn-fire').disabled`)){ console.log('fire disabled at', JSON.stringify(cell)); break; } await b.click('#btn-fire'); s=await settle(b); }
  console.log('after 30 turns: turn', s.turn, 'winner', s.winner, '| AI mine strikes:', await b.eval(`Underway.UI.S.game.players.host.shots.filter(x=>x.weapon==='mine').length`), '| AI moves:', await b.eval(`Underway.UI.S.game.players.guest.moves.length`), '| MG cooldown now:', await b.eval(`Underway.Rules.weapon(Underway.UI.S.game.players.host,'mg').cooldown`));
  // resume round trip with weapons
  const room=await b.eval(`Underway.UI.S.room`); await b.goto(URL+'?room='+room); await b.wait(600); await b.click('#resume-yes'); await b.wait(500); console.log('resumed:', JSON.stringify(await st(b)), 'mines kept:', await b.eval(`Underway.UI.S.game.players.host.mines.length`));
  console.log((mobile?'[mobile] ':'')+'ERRORS:', b.errors.length?b.errors:'none'); b.close();
}
(async()=>{ await run(false); await run(true); })().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
