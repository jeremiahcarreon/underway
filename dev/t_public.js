const {Browser,waitFor}=require('./cdp.js'); const fs=require('fs');
const url=fs.readFileSync(__dirname+'/tunnel.url','utf8').trim(); const ip=fs.readFileSync(__dirname+'/tunnel.ip','utf8').trim(); const host=url.replace('https://','');
(async()=>{ const b=new Browser({extraArgs:['--host-resolver-rules=MAP '+host+' '+ip]}); await b.launch(); await b.goto(url+'/'); await b.wait(1200);
  console.log('online panel visible:', await b.eval(`!document.getElementById('signin-panel').classList.contains('hidden')`));
  await b.eval(`document.getElementById('adm-name').value='TunnelTest'; document.getElementById('adm-pin').value='4321';`); await b.click('#btn-signin'); await waitFor(b, `!document.getElementById('online-panel').classList.contains('hidden')`, 12000, 'signed in over tunnel');
  await b.click('#btn-newgame'); await waitFor(b, `Underway.UI.S.screen==='lobby' && Underway.UI.S.linkState==='online'`, 20000, 'lobby online over tunnel');
  console.log('over tunnel: code', await b.eval(`Underway.UI.S.room`), '| link', await b.eval(`Underway.UI.S.linkState`), '| ws url', await b.eval(`Underway.UI.S.sock.url`), '| share link', await b.eval(`document.getElementById('lobby-code').textContent`));
  console.log('ERRORS:', b.errors.filter(e=>!/favicon/.test(e)).length?b.errors:'none'); b.close(); setTimeout(()=>process.exit(0),200); })().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
