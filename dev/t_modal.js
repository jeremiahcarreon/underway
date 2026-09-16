const {Browser,cellXY,waitFor,selectShip,URL}=require('./cdp.js'); const P=(x,y)=>({x,y});
async function st(b){ return b.eval(`(()=>{const S=Underway.UI.S; return {cur:S.game.current, phase:S.game.phase, turn:S.game.turn, busy:S.busy, winner:S.game.winner};})()`); }
async function settle(b){ for(let i=0;i<120;i++){ const s=await st(b); if(!s.busy && (s.cur==='host'||s.winner)) return s; await b.wait(150); if(i%4===3) await b.eval(`Underway.Anim.skip()`); } throw new Error('never settled'); }
async function tapEnemy(b,cell){ const xy=await cellXY(b,'enemy',cell); await b.clickCanvas('#enemyCanvas',xy.x,xy.y); await b.wait(60); }
async function run(mobile){
  const b=new Browser({mobile, win:mobile?'390,844':'1280,900'}); await b.launch(); await b.goto(URL); await b.eval(`document.getElementById('home-name').value='T'`); await b.click('#btn-ai'); await b.wait(200);
  await b.click('.navybtn:nth-child(2)'); await b.click('#btn-lobby-start'); await b.wait(200); await b.click('.tpl[data-tpl="spread"]'); await b.click('#btn-ready'); await waitFor(b, `Underway.UI.S.screen==='battle'`, 9000); await b.eval(`Underway.UI.S.settings.fast=true; Underway.Anim.settings.fast=true;`); let s=await settle(b);
  // damage own battleship (idx 1) via state so the radar list shows a disabled entry
  await b.eval(`(()=>{const S=Underway.UI.S; S.game=Underway.Rules.clone(S.game); S.game.players.host.fleet[1].hits[1]=true; S.game.players.host.fleet[1].firstHitTurn=1;})()`);
  await b.click('.weapons .wgroup:nth-child(5) button.wpn'); await b.wait(150);
  const modal=await b.eval(`(()=>{const o=document.getElementById('ov-weapon'); return {open:o.classList.contains('active'), title:document.getElementById('wm-title').textContent, status:document.getElementById('wm-status').textContent, opts:[...document.querySelectorAll('#wm-opts .opt')].map(x=>x.textContent.replace(/\\s+/g,' ').trim()+(x.disabled?' [DISABLED]':'')+(x.classList.contains('selected')?' [SELECTED]':'')), arm:document.getElementById('wm-arm').textContent+' disabled='+document.getElementById('wm-arm').disabled, hint:document.getElementById('wm-hint').textContent};})()`);
  console.log((mobile?'[mobile] ':'')+'RADAR modal:', JSON.stringify(modal,null,1));
  await b.shot(__dirname+(mobile?'/m_modal_radar.png':'/v_modal_radar.png'));
  // choose the patrol boat (last enabled option) and arm
  await b.eval(`[...document.querySelectorAll('#wm-opts .opt')].filter(x=>!x.disabled).slice(-1)[0].click()`); await b.click('#wm-arm'); await b.wait(150);
  console.log('armed:', await b.eval(`Underway.UI.S.weapon+' from ship '+Underway.UI.S.selShip+' | label: '+document.getElementById('target-label').textContent+' | modal closed='+!document.getElementById('ov-weapon').classList.contains('active')`));
  await tapEnemy(b,P(3,3)); console.log('area after tap:', await b.eval(`JSON.stringify(Underway.UI.S.oceans.enemy.area)`), '(expect size 2)'); await b.click('#btn-fire'); s=await settle(b); console.log('radar fired, contacts logged:', await b.eval(`Underway.UI.S.game.log.filter(e=>e.kind==='radar').length`));
  // help button on shell opens info; arm shell
  await b.click('.weapons .wgroup:nth-child(1) button.help'); await b.wait(100); console.log('shell help open:', await b.eval(`document.getElementById('ov-weapon').classList.contains('active')+' '+document.getElementById('wm-title').textContent+' | arm: '+document.getElementById('wm-arm').disabled`)); await b.click('#wm-cancel');
  // torpedo modal with direction choice, arm the ↑ column option
  await b.click('.weapons .wgroup:nth-child(3) button.wpn'); await b.wait(100); const topts=await b.eval(`[...document.querySelectorAll('#wm-opts .opt')].map(x=>x.querySelector('.tag').textContent)`); console.log('torpedo options:', topts.join(' '));
  await b.eval(`[...document.querySelectorAll('#wm-opts .opt')][3].click()`); await b.click('#wm-arm'); await b.wait(100); console.log('torpedo armed dir:', await b.eval(`Underway.UI.S.torpDir+' '+document.getElementById('btn-torpdir').textContent`));
  // air strike modal vertical
  await b.click('.weapons .wgroup:nth-child(6) button.wpn'); await b.wait(100); await b.eval(`[...document.querySelectorAll('#wm-opts .opt')][1].click()`); await b.click('#wm-arm'); await b.wait(100); console.log('airstrike armed:', await b.eval(`Underway.UI.S.weapon+' airDir='+Underway.UI.S.airDir+' | '+document.getElementById('btn-airdir').textContent`));
  // MG modal lists all afloat ships incl. crippled
  await b.click('.weapons .wgroup:nth-child(2) button.wpn'); await b.wait(100); console.log('mg options:', await b.eval(`[...document.querySelectorAll('#wm-opts .opt')].map(x=>x.querySelector('.tag').textContent).join(' | ')`)); await b.click('#wm-cancel');
  console.log('tooltips left on weapon buttons:', await b.eval(`[...document.querySelectorAll('.weapons button')].filter(x=>x.title).length`));
  console.log((mobile?'[mobile] ':'')+'ERRORS:', b.errors.length?b.errors:'none'); b.close();
}
(async()=>{ await run(false); await run(true); })().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
