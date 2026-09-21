// From a saved game at a given turn: how many shells until the engine finds a parked ship?
const U=require('./run-tests.js'); const {AI}=U; const fs=require('fs'); const N=c=>'ABCDEFGHIJ'[c.x]+(c.y+1);
const g0=JSON.parse(fs.readFileSync(process.argv[2])).game; const start=Number(process.argv[3]); const target=new Set(process.argv[4].split(','));
const g=JSON.parse(JSON.stringify(g0)); g.stage='battle'; g.winner=null; g.current='guest'; g.phase='maneuver'; g.room='H'+Math.random();
for(const k of ['host','guest']){ const p=g.players[k]; p.shots=p.shots.filter(x=>x.turn<start); p.sightings=(p.sightings||[]).filter(x=>x.turn<start); p.mines=[]; }
g.ai=AI.initMemory('fleet'); let n=0; const seq=[];
for(let t=start;t<start+200;t+=2){ g.turn=t; const a=AI.enumerateActions(g,'guest',g.ai).filter(a=>a.weapon==='shell')[0]; n++; seq.push(N(a.cell)); if(target.has(N(a.cell))) break; g.players.guest.shots.push({turn:t,cell:a.cell,result:'miss',cls:null,weapon:'shell',crippled:false}); }
console.log('shots to find:',n,seq.join(' '));
