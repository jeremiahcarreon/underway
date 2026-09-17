const {Browser,cellXY,waitFor,selectShip,URL}=require('./cdp.js'); const P=(x,y)=>({x,y});
async function st(b){ return b.eval(`(()=>{const S=Underway.UI.S; return {cur:S.game.current, phase:S.game.phase, turn:S.game.turn, busy:S.busy, winner:S.game.winner, curtain:document.getElementById('curtain').classList.contains('active'), bonus:!!S.game.bonusMove};})()`); }
async function settle(b){ for(let i=0;i<80;i++){ const s=await st(b); if(!s.busy) return s; await b.wait(150); if(i%4===3) await b.eval(`Underway.Anim.skip()`); } throw new Error('never settled'); }
async function curtain(b){ const s=await st(b); if(s.curtain){ await b.click('#curtain-go'); await b.wait(250); } return st(b); }
async function tapEnemy(b,cell){ const xy=await cellXY(b,'enemy',cell); await b.clickCanvas('#enemyCanvas',xy.x,xy.y); await b.wait(60); }
(async()=>{
  const b=new Browser({}); await b.launch(); await b.goto(URL); await b.eval(`document.getElementById('home-name').value='P1'`); await b.click('#btn-hotseat'); await b.wait(300);
  const opts=()=>b.eval(`[...document.querySelectorAll('#options-grid button')].map(x=>x.textContent.replace(/\\s+/g,' ').trim()+(x.classList.contains('selected')?'*':'')).join(' | ')`);
  console.log('default options:', await opts()); console.log('note:', await b.eval(`document.getElementById('options-note').textContent`));
  await b.click('.preset[data-preset="classic"]'); await b.wait(100); console.log('classic:', await opts(), '|', await b.eval(`document.getElementById('options-note').textContent`));
  await b.click('.preset[data-preset="full"]'); await b.wait(100); console.log('full:', await opts()); console.log('navy grid shows traits:', await b.eval(`[...document.querySelectorAll('.navybtn small')].map(x=>x.textContent).slice(0,4).join(', ')`));
  // Italy (host) vs Brazil (guest), abilities on
  await b.click('.navybtn:nth-child(6)'); await b.click('#btn-lobby-start'); await b.wait(100); await b.click('.navybtn:nth-child(10)'); await b.wait(100); console.log('note with navies:', (await b.eval(`document.getElementById('options-note').textContent`)).slice(0,160));
  await b.click('#btn-lobby-start'); await b.wait(300); await b.click('.tpl[data-tpl="spread"]'); await b.click('#btn-ready'); await b.wait(200); await b.click('#curtain-go'); await b.wait(200); await b.click('.tpl[data-tpl="cluster"]'); await b.click('#btn-ready');
  await waitFor(b, `Underway.UI.S.screen==='battle'`, 9000); await b.eval(`Underway.UI.S.settings.fast=true; Underway.Anim.settings.fast=true;`); await b.wait(300);
  let s=await curtain(b); console.log('battle labels:', await b.eval(`document.getElementById('own-label').textContent+' / '+document.getElementById('enemy-label').textContent`), '| trait toast shown:', await b.eval(`[...document.querySelectorAll('.toast')].some(t=>/MAS boat|Fleet exercise/.test(t.textContent))`));
  const me=()=>b.eval(`Underway.UI.S.viewAs`);
  for(let round=0; round<2; round++){
    const who=await me(); const navyId=await b.eval(`Underway.UI.S.game.players[Underway.UI.S.viewAs].navy`);
    if(navyId==='it'){ // patrol dash: bow moves 2 cells if clear
      const before=await b.eval(`JSON.stringify(Underway.UI.S.game.players[Underway.UI.S.viewAs].fleet[4].bow)`); await selectShip(b,4); const rev=await b.eval(`document.getElementById('btn-reverse').disabled+' '+document.getElementById('btn-reverse').title`); const adv=await b.eval(`document.getElementById('btn-advance').disabled`); console.log('IT patrol: reverse disabled?', rev, '| advance enabled', !adv);
      if(!adv){ await b.click('#btn-advance'); await b.wait(150); await b.eval(`Underway.Anim.skip()`); s=await settle(b); console.log('IT patrol advance:', before, '->', await b.eval(`JSON.stringify(Underway.UI.S.game.players[Underway.UI.S.viewAs].fleet[4].bow)`), '| dash flagged:', await b.eval(`Underway.UI.S.game.players[Underway.UI.S.viewAs].moves.slice(-1)[0].dash===true`)); }
      await b.click('.weapons .wgroup:nth-child(1) button.wpn'); await tapEnemy(b,P(9,9)); await b.click('#btn-fire'); s=await settle(b);
    } else { // Brazil double move
      const i1=await b.eval(`Underway.UI.S.game.players[Underway.UI.S.viewAs].fleet.findIndex((sh,i)=>!sh.sunk&&Underway.Rules.hitCount(sh)===0&&['advance','reverse'].some(t=>Underway.Rules.canMoveIn(Underway.UI.S.game,Underway.UI.S.viewAs,i,t).ok))`);
      await selectShip(b,i1); const t1=await b.eval(`['advance','reverse'].find(t=>!document.getElementById('btn-'+t).disabled)`); await b.click('#btn-'+t1); await b.wait(150); await b.eval(`Underway.Anim.skip()`); s=await settle(b);
      console.log('BR first move -> phase', s.phase, 'bonus', s.bonus, '| label:', (await b.eval(`document.getElementById('phase-label').textContent`)).slice(0,60));
      const i2=await b.eval(`Underway.UI.S.game.players[Underway.UI.S.viewAs].fleet.findIndex((sh,i)=>i!==${i1}&&!sh.sunk&&Underway.Rules.hitCount(sh)===0&&['advance','reverse'].some(t=>Underway.Rules.canMoveIn(Underway.UI.S.game,Underway.UI.S.viewAs,i,t).ok))`);
      if(i2>=0){ await selectShip(b,i2); const t2=await b.eval(`['advance','reverse'].find(t=>!document.getElementById('btn-'+t).disabled)`); await b.click('#btn-'+t2); await b.wait(150); await b.eval(`Underway.Anim.skip()`); s=await settle(b); console.log('BR second move -> phase', s.phase, 'bonus', s.bonus, 'used', await b.eval(`Underway.UI.S.game.players[Underway.UI.S.viewAs].traitUses.doubleMove`)); }
      await b.click('.weapons .wgroup:nth-child(1) button.wpn'); await tapEnemy(b,P(0,0)); await b.click('#btn-fire'); s=await settle(b);
    }
    s=await curtain(b);
  }
  // classic hotseat: weapon row shows only the shell
  await b.goto(URL); await b.wait(400); await b.eval(`document.getElementById('home-name').value='P1'`); await b.click('#btn-hotseat'); await b.wait(200); await b.click('.preset[data-preset="classic"]'); await b.click('.navybtn:nth-child(1)'); await b.click('#btn-lobby-start'); await b.wait(100); await b.click('.navybtn:nth-child(2)'); await b.click('#btn-lobby-start'); await b.wait(200); await b.click('#btn-random-fleet'); await b.click('#btn-ready'); await b.wait(200); await b.click('#curtain-go'); await b.wait(200); await b.click('#btn-random-fleet'); await b.click('#btn-ready'); await waitFor(b, `Underway.UI.S.screen==='battle'`, 9000); await b.wait(300); await curtain(b);
  console.log('classic weapon row:', await b.eval(`[...document.querySelectorAll('.weapons button.wpn')].map(x=>x.textContent.replace(/\\s+/g,' ').trim()).join(' | ')`), '| options saved in game:', await b.eval(`JSON.stringify(Underway.UI.S.game.options)`));
  await b.eval(`document.getElementById('actions').scrollIntoView()`); await b.wait(100); await b.shot(__dirname+'/v_classic_row.png');
  console.log('ERRORS:', b.errors.length?b.errors:'none'); b.close(); })().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
