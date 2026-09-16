const {Browser}=require('./cdp.js'); const fs=require('fs');
const url=fs.readFileSync(__dirname+'/tunnel.url','utf8').trim(); const ip=fs.readFileSync(__dirname+'/tunnel.ip','utf8').trim(); const host=url.replace('https://','');
(async()=>{ const b=new Browser({extraArgs:['--host-resolver-rules=MAP '+host+' '+ip]}); await b.launch(); await b.goto(url+'/?room=TEST01'); await b.wait(3000);
  console.log('loaded:', await b.eval(`document.title`), '| screen:', await b.eval(`Underway.UI.S.screen`), '| join code prefilled:', await b.eval(`document.getElementById('join-code').value`), '| PeerJS loaded:', await b.eval(`typeof Peer!=='undefined'`));
  await b.goto(url+'/?test=1'); await b.wait(1500); console.log('self-tests over tunnel:', await b.eval(`document.getElementById('test-summary').textContent`));
  console.log('ERRORS:', b.errors.length?b.errors:'none'); b.close(); })().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
