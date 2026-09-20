// Hotseat run through the tray UI: every weapon, mines (dormant, moved-onto, contact), hover preview of a move handle, self-tests page.
const {Browser,cellXY,waitFor,URL,tapEnemy,tapOwn,showTab,pickWeapon,selectShip,legalMoves,moveShip,setLane,setLine}=require('./cdp.js');
const P=(x,y)=>({x,y});
async function st(b){ return b.eval(`(()=>{const S=Underway.UI.S; return {cur:S.game.current, phase:S.game.phase, turn:S.game.turn, busy:S.busy, winner:S.game.winner, viewAs:S.viewAs, weapon:S.weapon, curtain:document.getElementById('curtain').classList.contains('active')};})()`); }
async function cells(b,pid,idx){ return b.eval(`Underway.Rules.shipCells(Underway.UI.S.game.players['${pid}'].fleet[${idx}])`); }
async function settle(b){ for(let i=0;i<100;i++){ const s=await st(b); if(!s.busy) return s; await b.wait(150); if(i%4===3) await b.eval(`Underway.Anim.skip()`); } throw new Error('never settled'); }
async function curtain(b){ let s=await st(b); if(s.curtain){ await b.click('#curtain-go'); await b.wait(250); s=await st(b); } return s; }
async function fireNow(b){ await b.click('#tray-fire'); return settle(b); }
async function shell(b,cell){ if((await b.eval(`Underway.UI.S.weapon`))!=='shell') await pickWeapon(b,'shell'); else await showTab(b,'enemy'); await tapEnemy(b,cell); return fireNow(b); }
const big=b=>b.eval(`document.getElementById('tray-big').textContent+' | '+document.getElementById('tray-sub').textContent`);
(async()=>{
  const b=new Browser({}); await b.launch();
  await b.goto(URL+'?test=1'); await b.wait(1500); console.log('tests:', await b.eval(`document.getElementById('test-summary').textContent`), '| errors:', b.errors.length?b.errors:'none');
  await b.goto(URL); await b.eval(`document.getElementById('home-name').value='P1'`); await b.click('#btn-hotseat'); await b.wait(300);
  await b.click('.navybtn:nth-child(1)'); await b.click('#btn-lobby-start'); await b.wait(100); await b.click('.navybtn:nth-child(2)'); await b.click('#btn-lobby-start'); await b.wait(300);
  await b.click('.tpl[data-tpl="spread"]'); await b.click('#btn-ready'); await b.wait(200); await b.click('#curtain-go'); await b.wait(200); await b.click('.tpl[data-tpl="cluster"]'); await b.click('#btn-ready');
  await waitFor(b, `Underway.UI.S.screen==='battle'`, 9000); await b.eval(`Underway.UI.S.settings.fast=true; Underway.Anim.settings.fast=true;`); await b.wait(300);
  let s=await curtain(b); const X=s.cur, Y=X==='host'?'guest':'host'; console.log('first:', X);
  // hover preview of a move handle (mouse)
  await selectShip(b,2); const hs=await b.eval(`Underway.UI.S.oceans.own.handles.map(h=>({t:h.type,c:h.cell}))`); const rotH=hs.find(h=>h.t.startsWith('rot'))||hs[0];
  const xy=await cellXY(b,'own',rotH.c); await b.eval(`(()=>{ const el=document.getElementById('ownCanvas'); const r=el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.left+${xy.x},clientY:r.top+${xy.y},pointerType:'mouse'})); })()`); await b.wait(80);
  console.log('handles:', hs.map(h=>h.t).join(','), '| hover', rotH.t, '-> ghost', await b.eval(`!!Underway.UI.S.oceans.own.ghost`), 'pivot', await b.eval(`JSON.stringify(Underway.UI.S.oceans.own.pivot)`)); await b.shot(__dirname+'/w_hover.png');
  // machine gun from the battleship: two bullets on Y's battleship
  const ybb=await cells(b,Y,1); console.log('armed:', await pickWeapon(b,'mg',1), '|', await big(b)); for(const c of [ybb[0],ybb[1],P(9,9),P(0,9)]) await tapEnemy(b,c); console.log('mg aimed:', await big(b)); s=await fireNow(b);
  console.log('mg results:', await b.eval(`JSON.stringify(Underway.UI.S.game.players['${X}'].shots.map(x=>x.result+(x.cls?':'+x.cls:'')))`), '| cooldown:', await b.eval(`Underway.Rules.weapon(Underway.UI.S.game.players['${X}'],'mg').cooldown`), '| Y sightings:', await b.eval(`JSON.stringify(Underway.UI.S.game.players['${Y}'].sightings.map(x=>x.kind+':'+x.cls))`), '| result card:', await b.eval(`document.getElementById('result-text').textContent`));
  // Y: mine on empty water ahead of X's destroyer
  s=await curtain(b); console.log('Y sees the MG ship on the tracking grid:', await b.eval(`Underway.UI.S.oceans.enemy.sightings.length`), '| previous replay cleared at hand-off:', await b.eval(`Underway.UI.S.lastAction===null`));
  const xd=await cells(b,X,2); const xdShip=await b.eval(`Underway.UI.S.game.players['${X}'].fleet[2]`); const d={N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]}[xdShip.heading]; const ahead=P(xd[0].x+d[0], xd[0].y+d[1]);
  await pickWeapon(b,'mine'); await tapEnemy(b,ahead); console.log('mine aimed:', await big(b)); await b.wait(400); await tapEnemy(b,ahead); s=await settle(b); // tap again = lay
  console.log('mine laid by tap-tap:', await b.eval(`Underway.UI.S.game.players['${Y}'].mines.length`), '| dormant:', await b.eval(`Underway.UI.S.game.players['${Y}'].shots.filter(x=>x.weapon==='mine').length===0`), '| turn passed:', s.cur===X);
  // X: advance the destroyer onto the mine
  s=await curtain(b); await selectShip(b,2); console.log('X moves onto the mine:', await moveShip(b,'advance')); await b.wait(700); await b.shot(__dirname+'/w_mine_hit.png'); s=await settle(b);
  console.log('mine hit for Y:', await b.eval(`JSON.stringify(Underway.UI.S.game.players['${Y}'].shots.filter(x=>x.weapon==='mine').map(x=>x.result+':'+x.cls))`), '| X destroyer hits:', await b.eval(`JSON.stringify(Underway.UI.S.game.players['${X}'].fleet[2].hits)`), '| phase:', s.phase, '| tab:', await b.eval(`Underway.UI.S.tab`));
  // X: radar from the carrier, tap-tap
  console.log('armed:', await pickWeapon(b,'radar',0), '|', await big(b)); const yc=await cells(b,Y,0); await tapEnemy(b,yc[2]); console.log('radar aimed:', await big(b)); await b.wait(400); await tapEnemy(b,yc[2]); await b.wait(1500); await b.shot(__dirname+'/w_radar.png'); s=await settle(b);
  console.log('radar contacts:', await b.eval(`Underway.UI.S.game.log.filter(e=>e.kind==='radar').map(e=>e.count).join(',')`), '| cooldown:', await b.eval(`Underway.Rules.weapon(Underway.UI.S.game.players['${X}'],'radar').cooldown`), '| turn passed:', s.cur===Y);
  // Y: air strike along X's battleship
  s=await curtain(b); console.log('radar view cleared for the other player:', await b.eval(`Underway.UI.S.oceans.enemy.radarView===null`)); const xbb=await cells(b,X,1); const xbShip=await b.eval(`Underway.UI.S.game.players['${X}'].fleet[1]`); const horiz=(xbShip.heading==='E'||xbShip.heading==='W');
  await pickWeapon(b,'airstrike'); const anchor=xbb.slice().sort((a,c)=>a.x-c.x||a.y-c.y)[0]; await tapEnemy(b,anchor); await setLine(b,horiz); console.log('strike aimed:', await big(b)); await b.shot(__dirname+'/w_airstrike_aim.png'); s=await fireNow(b);
  console.log('airstrike:', await b.eval(`JSON.stringify(Underway.UI.S.game.players['${Y}'].shots.filter(x=>x.weapon==='airstrike').map(x=>x.result))`), '| uses left:', await b.eval(`Underway.Rules.weapon(Underway.UI.S.game.players['${Y}'],'airstrike').usesRemaining`));
  // X: torpedo along the row of Y's carrier from the west
  s=await curtain(b); const ycar=await cells(b,Y,0); const row=ycar[0].y; await pickWeapon(b,'torpedo'); await tapEnemy(b,P(0,row)); await setLane(b,0); console.log('torpedo aimed:', await big(b)); s=await fireNow(b);
  console.log('torpedo:', await b.eval(`JSON.stringify(Underway.UI.S.game.players['${X}'].shots.filter(x=>x.weapon==='torpedo').map(x=>({r:x.result,cls:x.cls,cell:x.cell})))`), '| Y wake:', await b.eval(`Underway.UI.S.game.players['${Y}'].torpedoes.length`), '| sub hidden:', await b.eval(`Underway.UI.S.game.players['${Y}'].sightings.filter(x=>x.cls==='submarine').length===0`));
  // Y: moves the submarine, torpedo is then unavailable this turn
  s=await curtain(b); console.log('Y sees the wake:', await b.eval(`Underway.UI.S.oceans.own.wakes.length`)); await selectShip(b,3); const mv=(await legalMoves(b)).find(t=>t==='advance'||t==='reverse');
  if(mv){ await moveShip(b,mv,'tap'); await b.wait(200); await b.eval(`Underway.Anim.skip()`); s=await settle(b); console.log('sub moved ('+mv+'); torpedo row:', await pickWeapon(b,'torpedo'), '| armed stays:', await b.eval(`Underway.UI.S.weapon`)); }
  s=await shell(b,P(9,0));
  // X shell; Y second mine straight onto X's patrol boat: contact
  s=await curtain(b); s=await shell(b,P(9,9)); s=await curtain(b);
  const xp=await cells(b,X,4); await pickWeapon(b,'mine'); await tapEnemy(b,xp[0]); s=await fireNow(b);
  console.log('contact mine:', await b.eval(`JSON.stringify(Underway.UI.S.game.players['${Y}'].shots.filter(x=>x.weapon==='mine').slice(-1)[0].result)`), '| X patrol hits:', await b.eval(`JSON.stringify(Underway.UI.S.game.players['${X}'].fleet[4].hits)`), '| mines left:', await b.eval(`Underway.Rules.weapon(Underway.UI.S.game.players['${Y}'],'mine').usesRemaining`));
  s=await curtain(b); await b.click('#tray-skip'); await b.click('#tray-weapon'); await b.wait(150); console.log('X weapon sheet:', await b.eval(`[...document.querySelectorAll('#wsheet .wrow')].map(r=>r.dataset.weapon+':'+r.querySelector('.tag').textContent+(r.querySelector('.wsheet-row').disabled?'[off]':'')).join(' | ')`)); await b.shot(__dirname+'/w_sheet.png'); await b.click('#wsheet-close');
  console.log('ERRORS:', b.errors.length?b.errors:'none'); b.close();
})().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
