const {Browser,URL,waitFor}=require('./cdp.js');
(async()=>{ const b=new Browser({}); await b.launch(); await b.goto(URL); await b.eval(`document.getElementById('home-name').value='T'`); await b.click('#btn-ai'); await b.wait(150); await b.click('.navybtn:nth-child(1)'); await b.click('#btn-lobby-start'); await b.wait(150); await b.click('.tpl[data-tpl="spread"]'); await b.click('#btn-ready'); await waitFor(b, `Underway.UI.S.screen==='battle'`, 9000); await b.wait(400);
  const dump=()=>b.eval(`[...document.querySelectorAll('.weapons button.wpn')].map(x=>x.textContent.replace(/\\s+/g,' ').trim()+(x.disabled?' [disabled]':'')+(x.classList.contains('gone')?' [⊘]':'')+(x.classList.contains('reloading')?' [reload]':'')).join(' | ')`);
  console.log('fresh:', await dump());
  // damage carrier + sink submarine + spend mines + put MG on reload, via state, then re-render
  await b.eval(`(()=>{ const S=Underway.UI.S; S.game=Underway.Rules.clone(S.game); const f=S.game.players.host.fleet; f[0].hits[2]=true; f[3].hits=f[3].hits.map(()=>true); f[3].sunk=true; f[3].crippled=true; Underway.Rules.weapon(S.game.players.host,'mine').usesRemaining=0; Underway.Rules.weapon(S.game.players.host,'mg').cooldown=7; })()`);
  await b.eval(`Underway.UI.S.weapon='airstrike'`); await b.click('#btn-skip'); await b.wait(200); // any re-render
  console.log('after losses:', await dump(), '| selected weapon fell back to:', await b.eval(`Underway.UI.S.weapon`));
  await b.click('.weapons .wgroup:nth-child(6) button.wpn'); await b.wait(100); console.log('clicking Strike opens modal?', await b.eval(`document.getElementById('ov-weapon').classList.contains('active')`), '(expect false)');
  await b.click('.weapons .wgroup:nth-child(6) button.help'); await b.wait(100); console.log('? still explains:', await b.eval(`document.getElementById('ov-weapon').classList.contains('active')+' arm disabled='+document.getElementById('wm-arm').disabled+' hint: '+document.getElementById('wm-hint').textContent`)); await b.click('#wm-cancel');
  await b.eval(`document.getElementById('actions').scrollIntoView()`); await b.wait(150); await b.shot(__dirname+'/v_gone.png');
  console.log('ERRORS:', b.errors.length?b.errors:'none'); b.close(); })().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
