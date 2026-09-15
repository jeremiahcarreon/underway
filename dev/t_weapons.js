const {Browser,cellXY,waitFor,selectShip,URL}=require('./cdp.js');
const P=(x,y)=>({x,y});
async function st(b){ return b.eval(`(()=>{const S=Underway.UI.S; return {cur:S.game.current, phase:S.game.phase, turn:S.game.turn, busy:S.busy, screen:S.screen, winner:S.game.winner, viewAs:S.viewAs, weapon:S.weapon, curtain:document.getElementById('curtain').classList.contains('active')};})()`); }
async function cells(b,pid,idx){ return b.eval(`Underway.Rules.shipCells(Underway.UI.S.game.players['${pid}'].fleet[${idx}])`); }
async function pickWeapon(b,id){ const i=['shell','mg','torpedo','mine','radar','airstrike'].indexOf(id)+1; await b.click(`.weapons button:nth-child(${i})`); await b.wait(80); return b.eval(`Underway.UI.S.weapon`); }
async function tapEnemy(b,cell){ const xy=await cellXY(b,'enemy',cell); await b.clickCanvas('#enemyCanvas',xy.x,xy.y); await b.wait(60); }
async function settle(b){ // wait for busy to clear, skipping animations
  for(let i=0;i<80;i++){ const s=await st(b); if(!s.busy) return s; await b.wait(150); if(i%4===3) await b.eval(`Underway.Anim.skip()`); } throw new Error('never settled'); }
async function curtain(b){ const s=await st(b); if(s.curtain){ await b.click('#curtain-go'); await b.wait(250); } return st(b); }
(async()=>{
  const b=new Browser({}); await b.launch();
  await b.goto(URL+'?test=1'); await b.wait(1200); console.log('tests:', await b.eval(`document.getElementById('test-summary').textContent`), '| errors:', b.errors.length?b.errors:'none');
  await b.goto(URL); await b.eval(`document.getElementById('home-name').value='P1'`); await b.click('#btn-hotseat'); await b.wait(300);
  await b.click('.navybtn:nth-child(1)'); await b.click('#btn-lobby-start'); await b.wait(100); await b.click('.navybtn:nth-child(2)'); await b.click('#btn-lobby-start'); await b.wait(300);
  await b.click('.tpl[data-tpl="spread"]'); await b.click('#btn-ready'); await b.wait(200); await b.click('#curtain-go'); await b.wait(200); await b.click('.tpl[data-tpl="cluster"]'); await b.click('#btn-ready');
  await waitFor(b, `Underway.UI.S.screen==='battle'`, 9000); await b.eval(`Underway.UI.S.settings.fast=true; Underway.Anim.settings.fast=true;`); await b.wait(300);
  let s=await curtain(b); const X=s.cur, Y=s.cur==='host'?'guest':'host'; console.log('first:', X, 'weapons shown:', await b.eval(`document.querySelectorAll('.weapons button').length`), await b.eval(`[...document.querySelectorAll('.weapons button')].map(x=>x.textContent).join(' | ')`));
  // --- hover preview ---
  await selectShip(b,2); await b.eval(`document.getElementById('btn-rotcw').dispatchEvent(new Event('mouseenter'))`); await b.wait(100);
  console.log('hover rotcw: ghost', await b.eval(`!!Underway.UI.S.oceans.own.ghost`), 'pivot', await b.eval(`JSON.stringify(Underway.UI.S.oceans.own.pivot)`), 'ghostOk', await b.eval(`Underway.UI.S.oceans.own.ghostOk`), '| label:', await b.eval(`document.getElementById('phase-label').textContent.slice(0,110)`));
  await b.shot(__dirname+'/w_hover.png');
  await b.eval(`document.getElementById('btn-rotcw').dispatchEvent(new Event('mouseleave'))`); await b.wait(60); console.log('after leave: ghost', await b.eval(`!!Underway.UI.S.oceans.own.ghost`));
  // --- machine gun: two bullets on Y's battleship + two open cells ---
  const ybb=await cells(b,Y,1); await pickWeapon(b,'mg'); await selectShip(b,1);
  await tapEnemy(b,ybb[0]); await tapEnemy(b,ybb[1]); await tapEnemy(b,P(9,9)); await tapEnemy(b,P(0,9));
  console.log('mg targets:', await b.eval(`Underway.UI.S.targets.length`), 'fire label/enabled:', await b.eval(`document.getElementById('btn-fire').textContent+' '+!document.getElementById('btn-fire').disabled`));
  await b.click('#btn-fire'); await b.wait(500); await b.shot(__dirname+'/w_mg_anim.png'); s=await settle(b);
  const mg=await b.eval(`JSON.stringify(Underway.UI.S.game.players['${X}'].shots.map(x=>x.result+(x.cls?':'+x.cls:'')))`); console.log('mg results:', mg, '| cooldown:', await b.eval(`Underway.Rules.weapon(Underway.UI.S.game.players['${X}'],'mg').cooldown`), '| Y sightings:', await b.eval(`JSON.stringify(Underway.UI.S.game.players['${Y}'].sightings.map(x=>x.kind+':'+x.cls))`), '| cur now', s.cur);
  // --- Y: sees the sighting; lays a mine ahead of X's destroyer ---
  s=await curtain(b); console.log('Y view; sightings on enemy grid:', await b.eval(`Underway.UI.S.oceans.enemy.sightings.length`)); await b.shot(__dirname+'/w_sighting.png');
  const xd=await cells(b,X,2); const xdShip=await b.eval(`Underway.UI.S.game.players['${X}'].fleet[2]`); const d={N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]}[xdShip.heading]; const ahead=P(xd[0].x+d[0], xd[0].y+d[1]);
  await pickWeapon(b,'mine'); await tapEnemy(b,ahead); console.log('mine target label:', await b.eval(`document.getElementById('target-label').textContent`)); await b.click('#btn-fire'); s=await settle(b);
  console.log('mine laid:', await b.eval(`JSON.stringify(Underway.UI.S.game.players['${Y}'].mines)`), '| uses left:', await b.eval(`Underway.Rules.weapon(Underway.UI.S.game.players['${Y}'],'mine').usesRemaining`), '| turn passed to', s.cur, '| log tail:', await b.eval(`[...document.querySelectorAll('#log div')].slice(-1)[0].textContent`));
  // --- X: advances the destroyer into the mine ---
  s=await curtain(b); console.log('X view: mine hidden on own ocean?', await b.eval(`Underway.UI.S.oceans.own.mines.length===0`), '| enemy-grid mines (own):', await b.eval(`Underway.UI.S.oceans.enemy.mines.length`), '| log mentions cell?', await b.eval(`[...document.querySelectorAll('#log div')].some(d=>/laid a mine somewhere/.test(d.textContent))`));
  await selectShip(b,2); await b.click('#btn-advance'); await b.wait(700); await b.shot(__dirname+'/w_mine_hit.png'); s=await settle(b);
  const mineShot=await b.eval(`JSON.stringify(Underway.UI.S.game.players['${Y}'].shots.filter(x=>x.weapon==='mine'))`); console.log('mine hit recorded for Y:', mineShot, '| X destroyer hits:', await b.eval(`JSON.stringify(Underway.UI.S.game.players['${X}'].fleet[2].hits)`), '| phase:', s.phase, '(expect fire)');
  // --- X: radar sweep with the undamaged carrier ---
  await pickWeapon(b,'radar'); await selectShip(b,0); const yc=await cells(b,Y,0); await tapEnemy(b,yc[2]); console.log('radar label:', await b.eval(`document.getElementById('target-label').textContent`), '| area:', await b.eval(`JSON.stringify(Underway.UI.S.oceans.enemy.area)`));
  await b.click('#btn-fire'); await b.wait(1700); await b.shot(__dirname+'/w_radar.png'); s=await settle(b);
  console.log('radarView contacts:', await b.eval(`Underway.UI.S.oceans.enemy.radarView?Underway.UI.S.oceans.enemy.radarView.contacts.length:null`), '| cooldown:', await b.eval(`Underway.Rules.weapon(Underway.UI.S.game.players['${X}'],'radar').cooldown`), '| turn passed:', s.cur===Y);
  // --- Y: air strike on X's battleship line ---
  s=await curtain(b); console.log('radar view cleared for the other player:', await b.eval(`Underway.UI.S.oceans.enemy.radarView===null`)); const xbb=await cells(b,X,1); const xbShip=await b.eval(`Underway.UI.S.game.players['${X}'].fleet[1]`); const horiz=(xbShip.heading==='E'||xbShip.heading==='W');
  await pickWeapon(b,'airstrike'); if(horiz!==await b.eval(`Underway.UI.S.airDir`)) await b.click('#btn-airdir'); const anchor=xbb.slice().sort((a,c)=>a.x-c.x||a.y-c.y)[0]; await tapEnemy(b,anchor);
  console.log('strike label:', await b.eval(`document.getElementById('target-label').textContent`)); await b.click('#btn-fire'); await b.wait(900); await b.shot(__dirname+'/w_airstrike.png'); s=await settle(b);
  console.log('airstrike results:', await b.eval(`JSON.stringify(Underway.UI.S.game.players['${Y}'].shots.filter(x=>x.weapon==='airstrike').map(x=>x.result))`), '| uses left:', await b.eval(`Underway.Rules.weapon(Underway.UI.S.game.players['${Y}'],'airstrike').usesRemaining`), '| X battleship hits:', await b.eval(`JSON.stringify(Underway.UI.S.game.players['${X}'].fleet[1].hits)`));
  // --- X: torpedo along the row of Y's carrier, from the west ---
  s=await curtain(b); const ycar=await cells(b,Y,0); const row=ycar[0].y; await pickWeapon(b,'torpedo'); console.log('torpedo btn:', await b.eval(`document.querySelector('.weapons button:nth-child(3)').textContent`));
  let mode=await b.eval(`document.getElementById('btn-torpdir').textContent`); while(!/→ row/.test(mode)){ await b.click('#btn-torpdir'); mode=await b.eval(`document.getElementById('btn-torpdir').textContent`); }
  await tapEnemy(b,P(0,row)); console.log('torpedo label:', await b.eval(`document.getElementById('target-label').textContent`), '| lane cells:', await b.eval(`Underway.UI.S.oceans.enemy.lane?Underway.UI.S.oceans.enemy.lane.length:0`));
  await b.click('#btn-fire'); await b.wait(700); await b.shot(__dirname+'/w_torpedo.png'); s=await settle(b);
  const tshot=await b.eval(`JSON.stringify(Underway.UI.S.game.players['${X}'].shots.filter(x=>x.weapon==='torpedo').map(x=>({r:x.result,cls:x.cls,cell:x.cell,stop:x.stopIndex})))`); console.log('torpedo result:', tshot, '| expected first ship on row', row, 'from the west; Y wake recorded:', await b.eval(`Underway.UI.S.game.players['${Y}'].torpedoes.length`), '| no sighting of the sub:', await b.eval(`Underway.UI.S.game.players['${Y}'].sightings.filter(x=>x.cls==='submarine').length===0`), '| cooldown', await b.eval(`Underway.Rules.weapon(Underway.UI.S.game.players['${X}'],'torpedo').cooldown`));
  s=await curtain(b); console.log('Y sees wake on own ocean:', await b.eval(`Underway.UI.S.oceans.own.wakes.length`)); await b.shot(__dirname+'/w_wake_def.png');
  // Y moves the sub then tries a torpedo: must be refused
  await selectShip(b,3); const canSub=await b.eval(`['advance','reverse'].find(t=>Underway.Rules.canMove(Underway.UI.S.game.players['${Y}'].fleet,3,t).ok)||null`); if(canSub){ await b.click('#btn-'+canSub); await b.wait(200); await b.eval(`Underway.Anim.skip()`); s=await settle(b); await pickWeapon(b,'torpedo'); console.log('after sub moved: torpedo weapon selected?', await b.eval(`Underway.UI.S.weapon`), '(expect shell) | button:', await b.eval(`document.querySelector('.weapons button:nth-child(3)').textContent+' disabled='+document.querySelector('.weapons button:nth-child(3)').disabled`)); await pickWeapon(b,'shell'); await tapEnemy(b,P(9,0)); await b.click('#btn-fire'); s=await settle(b); }
  // --- repeat shots on one cell: two shells at 9,9 by X across turns ---
  s=await curtain(b); await pickWeapon(b,'shell'); await tapEnemy(b,P(9,9)); await b.click('#btn-fire'); s=await settle(b); s=await curtain(b); await pickWeapon(b,'shell'); await tapEnemy(b,P(0,0)); await b.click('#btn-fire'); s=await settle(b); s=await curtain(b); await pickWeapon(b,'shell'); await tapEnemy(b,P(9,9)); await b.click('#btn-fire'); s=await settle(b);
  console.log('repeat count at J10 for X:', await b.eval(`Underway.Rules.pegMap(Underway.UI.S.game.players['${X}'].shots).get('9,9').history.length`)); s=await curtain(b); await b.shot(__dirname+'/w_pegs.png');
  console.log('log lines:', await b.eval(`[...document.querySelectorAll('#log div')].map(d=>d.textContent).slice(0,14).join('\\n')`));
  console.log('ERRORS:', b.errors.length?b.errors:'none'); b.close();
})().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
