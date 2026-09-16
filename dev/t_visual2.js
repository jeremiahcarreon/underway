const {Browser,cellXY,waitFor,selectShip,URL}=require('./cdp.js'); const P=(x,y)=>({x,y});
async function st(b){ return b.eval(`(()=>{const S=Underway.UI.S; return {cur:S.game.current, phase:S.game.phase, turn:S.game.turn, busy:S.busy, winner:S.game.winner, curtain:document.getElementById('curtain').classList.contains('active')};})()`); }
async function settle(b){ for(let i=0;i<80;i++){ const s=await st(b); if(!s.busy) return s; await b.wait(150); if(i%4===3) await b.eval(`Underway.Anim.skip()`); } throw new Error('never settled'); }
async function curtain(b){ const s=await st(b); if(s.curtain){ await b.click('#curtain-go'); await b.wait(250); } return st(b); }
async function pickWeapon(b,id){ const i=['shell','mg','torpedo','mine','radar','airstrike'].indexOf(id)+1; await b.click(`.weapons button:nth-child(${i})`); await b.wait(80); }
async function tapEnemy(b,cell){ const xy=await cellXY(b,'enemy',cell); await b.clickCanvas('#enemyCanvas',xy.x,xy.y); await b.wait(60); }
async function fire(b){ await b.click('#btn-fire'); return settle(b); }
(async()=>{
  const b=new Browser({win:'1280,900'}); await b.launch(); await b.goto(URL); await b.eval(`document.getElementById('home-name').value='P1'`); await b.click('#btn-hotseat'); await b.wait(200);
  await b.click('.navybtn:nth-child(1)'); await b.click('#btn-lobby-start'); await b.wait(100); await b.click('.navybtn:nth-child(3)'); await b.click('#btn-lobby-start'); await b.wait(300);
  await b.click('.tpl[data-tpl="spread"]'); await b.wait(200); await b.shot(__dirname+'/v2_sub_place.png');
  await b.click('#btn-ready'); await b.wait(200); await b.click('#curtain-go'); await b.wait(200); await b.click('.tpl[data-tpl="cluster"]'); await b.click('#btn-ready');
  await waitFor(b, `Underway.UI.S.screen==='battle'`, 9000); await b.eval(`Underway.UI.S.settings.fast=true; Underway.Anim.settings.fast=true;`); await b.wait(300);
  let s=await curtain(b); const X=s.cur, Y=X==='host'?'guest':'host';
  // X hits Y's destroyer bow, Y advances it, X re-fires the old square (still here? no: moved -> the bow moved; old square now holds mid -> HIT), then X fires the new bow square -> MOVED HERE
  const yd=await b.eval(`Underway.Rules.shipCells(Underway.UI.S.game.players['${Y}'].fleet[2])`); const yds=await b.eval(`Underway.UI.S.game.players['${Y}'].fleet[2]`);
  await pickWeapon(b,'shell'); await tapEnemy(b,yd[0]); s=await fire(b); console.log('X hit bow:', await b.eval(`Underway.UI.S.game.players['${X}'].shots.slice(-1)[0].result`));
  s=await curtain(b); await selectShip(b,2); const can=await b.eval(`Underway.Rules.canMove(Underway.UI.S.game.players['${Y}'].fleet,2,'advance').ok`); await b.click(can?'#btn-advance':'#btn-reverse'); await b.wait(200); await b.eval(`Underway.Anim.skip()`); s=await settle(b); await pickWeapon(b,'shell'); await tapEnemy(b,P(9,9)); s=await fire(b);
  s=await curtain(b); const ydNow=await b.eval(`Underway.Rules.shipCells(Underway.UI.S.game.players['${Y}'].fleet[2])`);
  await pickWeapon(b,'shell'); await tapEnemy(b,yd[0]); s=await fire(b); console.log('re-fire old bow square:', await b.eval(`(()=>{const x=Underway.UI.S.game.players['${X}'].shots.slice(-1)[0]; return x.result+' moved='+x.moved;})()`));
  s=await curtain(b); await pickWeapon(b,'shell'); await tapEnemy(b,P(9,8)); s=await fire(b); s=await curtain(b);
  await pickWeapon(b,'shell'); await tapEnemy(b,ydNow[0]); s=await fire(b); const last=await b.eval(`JSON.stringify((()=>{const x=Underway.UI.S.game.players['${X}'].shots.slice(-1)[0]; return {r:x.result,moved:x.moved,text:Underway.Rules.resultText(x)};})())`); console.log('fire new bow square:', last);
  s=await curtain(b); await pickWeapon(b,'shell'); await tapEnemy(b,P(8,8)); s=await fire(b); s=await curtain(b);
  await pickWeapon(b,'shell'); await tapEnemy(b,ydNow[0]); s=await fire(b); console.log('re-fire the same new square:', await b.eval(`(()=>{const x=Underway.UI.S.game.players['${X}'].shots.slice(-1)[0]; return x.result+' moved='+x.moved+' | '+Underway.Rules.resultText(x);})()`));
  console.log('log tail:', await b.eval(`[...document.querySelectorAll('#log div')].filter(d=>/here/.test(d.textContent)).map(d=>d.textContent).join(' || ')`));
  await b.eval(`document.getElementById('side-enemy').scrollIntoView()`); await b.wait(200); await b.shot(__dirname+'/v2_pegs.png');
  // air strike orientation: tap, tap again flips; Line button label
  s=await curtain(b); s=await curtain(b); if((await st(b)).cur!==X){ await pickWeapon(b,'shell'); await tapEnemy(b,P(0,9)); s=await fire(b); s=await curtain(b); }
  await pickWeapon(b,'airstrike'); await tapEnemy(b,P(4,4)); const l1=await b.eval(`document.getElementById('target-label').textContent+' | '+document.getElementById('btn-airdir').textContent+' | hidden='+document.getElementById('btn-airdir').classList.contains('hidden')`); await tapEnemy(b,P(4,4)); const l2=await b.eval(`document.getElementById('target-label').textContent+' | '+document.getElementById('btn-airdir').textContent+' | cells='+JSON.stringify(Underway.UI.S.oceans.enemy.targets)`);
  console.log('airstrike first tap:', l1); console.log('airstrike second tap:', l2); await b.eval(`document.getElementById('actions').scrollIntoView()`); await b.wait(150); await b.shot(__dirname+'/v2_airdir.png');
  await pickWeapon(b,'torpedo'); await tapEnemy(b,P(4,4)); const t1=await b.eval(`document.getElementById('target-label').textContent`); await tapEnemy(b,P(4,4)); const t2=await b.eval(`document.getElementById('target-label').textContent`); console.log('torpedo tap/tap:', t1, ' -> ', t2);
  // replay view: surrender then open the replay and screenshot both oceans (submarine visible)
  await b.click('#btn-surrender'); await b.wait(150); await b.click('#confirm-yes'); await b.wait(1200); await b.eval(`Underway.Cine.skip()`); await b.wait(500); await b.click('#btn-replay'); await b.wait(400); await b.eval(`Underway.Replay.seek(3)`); await b.wait(300); await b.shot(__dirname+'/v2_replay.png');
  console.log('ERRORS:', b.errors.length?b.errors:'none'); b.close();
})().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
