// Re-run the engine on a saved game at a given turn: what did it believe, what did it rank?
const U=require('./run-tests.js'); const {Rules,AI}=U; const fs=require('fs'); const N=c=>'ABCDEFGHIJ'[c.x]+(c.y+1);
const g0=JSON.parse(fs.readFileSync(process.argv[2])).game; 
function at(turn){ const g=JSON.parse(JSON.stringify(g0)); g.stage='battle'; g.winner=null; g.turn=turn; g.current='guest'; g.phase='maneuver'; g.room='R'+turn+Math.random();
  for(const k of ['host','guest']){ const p=g.players[k]; p.shots=p.shots.filter(x=>x.turn<turn); p.sightings=(p.sightings||[]).filter(x=>x.turn<turn); p.mines=[]; }
  g.ai=AI.initMemory('fleet'); return g; }
for(const t of process.argv.slice(3).map(Number)){ const g=at(t); const acts=AI.enumerateActions(g,'guest',g.ai); console.log('turn',t,'top:',acts.slice(0,6).map(a=>a.weapon+'@'+(a.cell?N(a.cell):a.cells?a.cells.map(N).join(''):a.lane?JSON.stringify(a.lane):'')+' '+a.score.toFixed(2)).join(' | ')); }
if(process.env.DBG){ const t=Number(process.env.DBG); const g=at(t); const b=AI.beliefs(g,'guest',g.ai); const c=b.carrier; console.log('carrier expHits',c.expHits.toFixed(2),'mobile',c.mobile.toFixed(3)); const rows=[]; for(let i=0;i<100;i++) if(c.O[i]>0.01) rows.push(N({x:i%10,y:Math.floor(i/10)})+' O='+c.O[i].toFixed(2)+' V='+c.V[i].toFixed(2)); console.log(rows.join('  ')); console.log(g.players.guest.shots.filter(x=>x.cls==='carrier').map(x=>x.turn+':'+N(x.cell)+':'+x.result+(x.crippled?'!':'')).join(' ')); }
