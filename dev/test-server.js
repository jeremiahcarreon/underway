// Integration test for server/server.js: boots it on a random port with a temp data dir and drives it with fetch + WebSocket.
const { spawn } = require('child_process'); const fs=require('fs'); const os=require('os'); const path=require('path');
const PORT=9000+Math.floor(Math.random()*900); const DATA=fs.mkdtempSync(path.join(os.tmpdir(),'underway-test-')); const BASE='http://127.0.0.1:'+PORT;
const srv=spawn(process.execPath,['--no-warnings=ExperimentalWarning',path.join(__dirname,'..','server','server.js')],{env:Object.assign({},process.env,{PORT:String(PORT),DATA_DIR:DATA}),stdio:['ignore','pipe','pipe']});
srv.stderr.on('data',d=>process.stderr.write('[server] '+d));
process.on('exit',()=>{ try{ srv.kill('SIGKILL'); }catch(e){} try{ fs.rmSync(DATA,{recursive:true,force:true}); }catch(e){} });
let fails=0; const check=(cond,label,extra)=>{ if(cond) console.log('PASS  '+label); else { fails++; console.log('FAIL  '+label+(extra!==undefined?'  -> '+JSON.stringify(extra):'')); } };
const post=(p,b)=>fetch(BASE+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(async r=>({status:r.status,body:await r.json()}));
const get=p=>fetch(BASE+p).then(async r=>({status:r.status,body:await r.json()}));
function connect(code, token){ return new Promise((res,rej)=>{ const ws=new WebSocket('ws://127.0.0.1:'+PORT+'/ws'); const inbox=[]; const waiters=[]; ws.onmessage=e=>{ const m=JSON.parse(e.data); inbox.push(m); const i=waiters.findIndex(w=>w.pred(m)); if(i>=0){ const w=waiters.splice(i,1)[0]; w.res(m); } }; ws.onerror=rej; ws.onopen=()=>{ ws.send(JSON.stringify({type:'HELLO',code,token})); }; const api={ws,inbox, next(pred,ms){ const hit=inbox.find(pred); if(hit){ inbox.splice(inbox.indexOf(hit),1); return Promise.resolve(hit); } return new Promise((r,j)=>{ const w={pred,res:m=>{ inbox.splice(inbox.indexOf(m),1); r(m); }}; waiters.push(w); setTimeout(()=>{ const k=waiters.indexOf(w); if(k>=0){ waiters.splice(k,1); j(new Error('timeout waiting for '+pred.toString().slice(0,60))); } },ms||4000); }); }, send(obj){ ws.send(JSON.stringify(obj)); }, close(){ ws.close(); } }; api.next(m=>m.type==='WELCOME').then(w=>{ api.welcome=w; res(api); }).catch(rej); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  for(let i=0;i<40;i++){ try{ await get('/api/health'); break; }catch(e){ await sleep(150); } }
  const A=(await post('/api/admiral',{name:'Alice',pin:'1234'})).body, B=(await post('/api/admiral',{name:'Bob',pin:'2222'})).body, C=(await post('/api/admiral',{name:'Carol',pin:'3333'})).body;
  check(A.token&&B.token&&C.token,'admirals created');
  check((await post('/api/admiral',{name:'alice',pin:'9999'})).status===401,'wrong PIN rejected (case-insensitive name)');
  check((await post('/api/admiral',{name:'Alice',pin:'1234'})).body.token===A.token,'same PIN returns the same token');
  check((await post('/api/admiral',{name:'X',pin:'12'})).status===400,'bad name/PIN rejected');
  const g=(await post('/api/games',{token:A.token})).body; check(/^[A-Z0-9]{6}$/.test(g.code),'game code minted', g);
  const jb=await post('/api/games/'+g.code+'/join',{token:B.token}); check(jb.status===200&&jb.body.role==='guest','Bob joins as guest', jb.body);
  const jc=await post('/api/games/'+g.code+'/join',{token:C.token}); check(jc.status===409,'third admiral rejected: game full', jc.body);
  const ja=await post('/api/games/'+g.code+'/join',{token:A.token}); check(ja.body.role==='host','host rejoin keeps host role');
  check((await post('/api/games/'+g.code.toLowerCase()+'/join',{token:B.token})).body.role==='guest','lowercase code accepted');
  // sockets
  let a=await connect(g.code,A.token), b=await connect(g.code,B.token);
  check(a.welcome.role==='host'&&b.welcome.role==='guest','WELCOME roles');
  const pa=await a.next(m=>m.type==='PRESENCE'); check(pa.opponentOnline===true,'host told guest is online');
  a.send({type:'SEND',id:'c1',msg:{type:'LOBBY_STATE',payload:{hostNavy:'us',guestNavy:null,stage:'lobby'}},blob:{game:{stage:'lobby'},ui:1},lastSeqIn:0});
  const sent=await a.next(m=>m.type==='SENT'); check(sent.seq===1&&sent.id==='c1','SENT ack seq 1');
  const got=await b.next(m=>m.type==='MSG'); check(got.seq===1&&got.msg.type==='LOBBY_STATE'&&got.msg.payload.hostNavy==='us','guest receives relayed LOBBY_STATE');
  a.send({type:'SEND',id:'c1',msg:{type:'LOBBY_STATE',payload:{}},blob:{},lastSeqIn:0}); const dup=await a.next(m=>m.type==='SENT'); check(dup.dup===true&&dup.seq===1,'duplicate client id deduped');
  // guest saves with lastSeqIn=1, disconnects; host sends two more; guest reconnects and gets exactly the two pending
  b.send({type:'SAVE',lastSeqIn:1,blob:{game:{stage:'lobby',mine:'bob'}}}); await b.next(m=>m.type==='SAVED'); b.close(); await sleep(200);
  const pb=await a.next(m=>m.type==='PRESENCE'); check(pb.opponentOnline===false,'host told guest went offline');
  a.send({type:'SEND',id:'c2',msg:{type:'LOBBY_STATE',payload:{hostNavy:'us',guestNavy:'uk',stage:'placement'}},blob:{game:{stage:'placement'}},lastSeqIn:0}); await a.next(m=>m.type==='SENT');
  a.send({type:'SEND',id:'c3',msg:{type:'START',payload:{seed:5,first:'guest'}},blob:{game:{stage:'battle'}},lastSeqIn:0}); await a.next(m=>m.type==='SENT');
  b=await connect(g.code,B.token); check(b.welcome.lastSeqIn===1&&b.welcome.pending.length===2&&b.welcome.pending[0].seq===2&&b.welcome.pending[1].msg===undefined&&b.welcome.pending[1].type==='START','guest resumes with saved blob cursor and the two pending messages', {last:b.welcome.lastSeqIn, pending:b.welcome.pending.map(p=>p.seq+':'+p.type)});
  check(b.welcome.blob&&b.welcome.blob.game.mine==='bob','guest gets its saved blob back');
  check((await get('/api/games/'+g.code)).body.status==='live','START marked the game live');
  check((await get('/api/games/'+g.code)).body.guestNavy==='uk','navies recorded from LOBBY_STATE');
  // a second host connection replaces the first
  const a2=await connect(g.code,A.token); await sleep(150); check(a.ws.readyState===3||a.ws.readyState===2,'older host socket closed when a newer one connects'); a=a2;
  // game over from both, with stats
  const statsA={turns:40,shots:20,hits:9,shipsSunk:5}, statsB={turns:40,shots:19,hits:6,shipsSunk:2};
  a.send({type:'SEND',id:'go1',msg:{type:'GAME_OVER',payload:{winner:'host',reason:'fleet',stats:statsA}},blob:{game:{stage:'over',winner:'host',turn:40,log:[{turn:1,kind:'shot',player:'host',cell:{x:0,y:0},result:'miss'}],players:{host:{initialFleet:[1],moves:[{turn:1,kind:'move',player:'host',ship:0,type:'advance'}],shots:[],fleet:[1]},guest:{}}}},lastSeqIn:0}); await a.next(m=>m.type==='SENT');
  b.send({type:'SEND',id:'go2',msg:{type:'GAME_OVER',payload:{winner:'host',reason:'fleet',stats:statsB}},blob:{game:{stage:'over',winner:'host',turn:40,log:[{turn:1,kind:'shot',player:'host',cell:{x:0,y:0},result:'miss'},{turn:2,kind:'move',player:'guest',ship:1,type:'reverse'}],players:{host:{},guest:{initialFleet:[2],moves:[{turn:2,kind:'move',player:'guest',ship:1,type:'reverse'}],shots:[],fleet:[2]}}}},lastSeqIn:1}); await b.next(m=>m.type==='SENT');
  const fin=(await get('/api/games/'+g.code)).body; check(fin.status==='finished'&&fin.winner==='host'&&fin.turns===40,'game finished with winner and turns', {status:fin.status,winner:fin.winner,turns:fin.turns});
  check(fin.replay&&fin.replay.players.host.initialFleet[0]===1&&fin.replay.players.guest.initialFleet[0]===2&&fin.replay.log.length===3&&fin.replay.log.some(e=>e.kind==='move'&&e.player==='guest'),'replay merges both views (host fleet from host, guest moves from guest)', fin.replay&&fin.replay.log);
  check((await post('/api/games/'+g.code+'/join',{token:C.token})).status===409,'finished code cannot be joined by a newcomer');
  const lb=(await get('/api/leaderboard')).body; check(lb.admirals[0]&&lb.admirals[0].name==='Alice'&&lb.admirals[0].wins===1&&lb.games===1,'leaderboard ranks Alice', lb.admirals);
  check(lb.navies.find(n=>n.navy==='us')&&lb.navies.find(n=>n.navy==='us').wins===1,'leaderboard per navy', lb.navies);
  // rematch: new code, old code records next_code, same code never reused
  const rm=(await post('/api/games',{token:A.token,rematchOf:g.code})).body; check(rm.code&&rm.code!==g.code&&rm.rematchOf===g.code,'rematch mints a new code', rm);
  check((await post('/api/games',{token:B.token,rematchOf:g.code})).body.code===rm.code,'second rematch request returns the same new code');
  check((await get('/api/games/'+g.code)).body.nextCode===rm.code,'old game points at the rematch code');
  const jr=await post('/api/games/'+rm.code+'/join',{token:B.token}); check(jr.body.role==='guest','guest joins the rematch');
  const me=(await get('/api/me?token='+B.token)).body; check(me.games.length===2&&me.games[0].code===rm.code,'my games lists both, newest first');
  // solo games: saved per admiral, listed in /api/me, counted in the vs-AI record, retrievable for resume/replay
  const solo1=await post('/api/solo/save',{token:A.token, code:'AIQQ11', mode:'ai', aiLevel:'admiral', status:'live', navy:'us', oppNavy:'jp', turns:12, options:{navyTraits:false}, blob:{game:{stage:'battle',turn:12},room:'AIQQ11'}}); check(solo1.status===200,'solo save (live)', solo1.body);
  let me2=(await get('/api/me?token='+A.token)).body; const sg=me2.games.find(g=>g.code==='AIQQ11'); check(sg&&sg.kind==='ai'&&sg.status==='live'&&sg.role==='host'&&/Admiral AI/.test(sg.guest),'solo game listed in my games as in progress', sg);
  await post('/api/solo/save',{token:A.token, code:'AIQQ11', mode:'ai', aiLevel:'admiral', status:'finished', navy:'us', oppNavy:'jp', winner:'me', turns:30, stats:{shots:15,hits:9}, blob:{game:{stage:'over',turn:30,winner:'host'},room:'AIQQ11'}});
  await post('/api/solo/save',{token:A.token, code:'AIQQ22', mode:'ai', aiLevel:'hunter', status:'finished', navy:'us', oppNavy:'de', winner:'ai', turns:44, blob:{game:{stage:'over',turn:44,winner:'guest'},room:'AIQQ22'}});
  me2=(await get('/api/me?token='+A.token)).body; check(me2.games.filter(g=>g.kind==='ai').length===2 && me2.games.find(g=>g.code==='AIQQ11').winner==='me','solo games finished with results');
  const lb2=(await get('/api/leaderboard')).body; const ai=lb2.vsAI.find(x=>x.name==='Alice'); check(ai&&ai.wins===1&&ai.losses===1&&ai.levels.admiral.wins===1&&ai.levels.hunter.losses===1,'versus-AI record by level', lb2.vsAI);
  check(lb2.admirals.find(a=>a.name==='Alice').wins===0,'solo wins do not touch the PvP ranking'); check(!!(lb2.notes&&lb2.notes.ranking),'leaderboard carries an explicit note');
  const sget=await get('/api/solo/AIQQ11?token='+A.token); check(sget.status===200&&sget.body.blob.game.turn===30,'solo blob retrievable for replay/resume'); check((await get('/api/solo/AIQQ11')).status===401,'solo blob needs a token'); check((await get('/api/solo/AIQQ11?token='+B.token)).status===404,'solo blob is private to its admiral');
  check((await get('/api/games/ZZZZZZ')).status===404,'unknown code 404');
  check((await fetch(BASE+'/')).status===200 && (await (await fetch(BASE+'/')).text()).includes('UNDERWAY'),'serves index.html');
  a.close(); b.close();
  console.log((fails?'FAILED ':'ALL PASS ')+fails); process.exit(fails?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(1); });
